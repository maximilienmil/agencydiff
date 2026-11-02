import type { Action, AgencyReport, Finding, LiveEvent, Trace, Variant } from "@agencydiff/core";
import { fmtNum } from "./format";

export interface PaneState {
  traceId?: string;
  variant: Variant;
  step: number;
  screenshot?: string;
  screenshotUrl?: string;
  actions: Action[];
  note?: string;
  oraclePassed?: boolean;
  finished: boolean;
  started: boolean;
}

export interface LiveState {
  goal?: string;
  intentId?: string;
  decision?: string;
  panes: Record<Variant, PaneState>;
  findings: Finding[];
  finished: boolean;
  passed?: boolean;
}

const emptyPane = (variant: Variant): PaneState => ({ variant, step: 0, actions: [], finished: false, started: false });

export function initialLiveState(): LiveState {
  return { panes: { baseline: emptyPane("baseline"), candidate: emptyPane("candidate") }, findings: [], finished: false };
}

export function reduceLiveEvent(state: LiveState, event: LiveEvent, screenshotBase = ""): LiveState {
  const next: LiveState = { ...state, panes: { baseline: { ...state.panes.baseline }, candidate: { ...state.panes.candidate } }, findings: state.findings };
  const pane = (v: Variant) => next.panes[v];
  switch (event.type) {
    case "run_started": next.goal = event.goal; next.intentId = event.intentId; next.decision = event.decision; break;
    case "probe_started": Object.assign(pane(event.variant), { traceId: event.traceId, started: true }); break;
    case "step_started": pane(event.variant).step = event.step; pane(event.variant).actions = []; break;
    case "action": pane(event.variant).actions = event.actions; pane(event.variant).note = event.note; pane(event.variant).step = event.step; break;
    case "screenshot": pane(event.variant).screenshot = event.screenshot; pane(event.variant).step = event.step; pane(event.variant).screenshotUrl = screenshotBase ? `${screenshotBase.replace(/\/$/, "")}/traces/${event.traceId}/${event.screenshot}` : undefined; break;
    case "oracle_result": pane(event.variant).oraclePassed = event.passed; break;
    case "probe_finished": pane(event.variant).finished = true; pane(event.variant).step = event.steps; break;
    case "finding": if (!next.findings.some((f) => f.id === event.finding.id)) next.findings = [...next.findings, event.finding]; break;
    case "run_finished": next.finished = true; next.passed = event.passed; break;
  }
  return next;
}

export function reduceLiveEvents(events: LiveEvent[], screenshotBase = ""): LiveState {
  return events.reduce((s, e) => reduceLiveEvent(s, e, screenshotBase), initialLiveState());
}

export function cursorFor(actions: Action[]): { x: number; y: number; kind: string } | null {
  for (const a of actions) {
    if (a.type === "click" || a.type === "double_click" || a.type === "scroll" || a.type === "move") return { x: a.x, y: a.y, kind: a.type };
    if (a.type === "drag" && a.path[0]) return { x: a.path[0].x, y: a.path[0].y, kind: "drag" };
  }
  return null;
}

export function replayMaxStep(traces: (Trace | undefined)[]): number {
  return Math.max(0, ...traces.map((t) => t?.steps.length ?? 0));
}

export function paneAtStep(trace: Trace | undefined, step: number): { screenshot?: string; actions: Action[]; note?: string; current: number } {
  if (!trace) return { actions: [], current: 0 };
  const current = Math.min(step, trace.steps.length);
  if (current === 0) return { screenshot: trace.initial.observation.screenshot, actions: [], current };
  const s = trace.steps[current - 1];
  return { screenshot: s.after.screenshot, actions: s.actions, note: s.note, current };
}

export function findingLines(report: AgencyReport, intentId: string, fallbackSteps?: { baseline?: number; candidate?: number }): { label: string; text: string }[] {
  const b = report.aggregates.find((a) => a.intentId === intentId && a.variant === "baseline");
  const c = report.aggregates.find((a) => a.intentId === intentId && a.variant === "candidate");
  const lines: { label: string; text: string }[] = [];
  if (b?.actionCount !== undefined || c?.actionCount !== undefined || fallbackSteps) lines.push({ label: "Steps needed", text: `${fmtNum(b?.actionCount ?? fallbackSteps?.baseline)} → ${fmtNum(c?.actionCount ?? fallbackSteps?.candidate)}` });
  const vis = (v?: boolean) => (v === undefined ? "n/a" : v ? "yes" : "no");
  if (b && c) lines.push({ label: "Visible on first screen", text: `${vis(b.initiallyVisible)} → ${vis(c.initiallyVisible)}` });
  if (b && c) lines.push({ label: "Still possible", text: `${Math.round(b.successRate * 100)}% → ${Math.round(c.successRate * 100)}%` });
  for (const f of report.findings.filter((x) => x.intentId === intentId)) lines.push({ label: f.title, text: `${fmtNum(f.baseline)} → ${fmtNum(f.candidate)}` });
  return lines;
}

export const SPEEDS = [0.5, 1, 2, 4] as const;
export function nextSpeed(current: number): number {
  const i = SPEEDS.indexOf(current as (typeof SPEEDS)[number]);
  return SPEEDS[(i + 1) % SPEEDS.length] ?? 1;
}
