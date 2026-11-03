import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { countActions, type AgencyContract, type Trace } from "@agencydiff/core";
import { FORBIDDEN_BUNDLE_TOKENS, type MatchedCase } from "./cases.js";

export interface IntentEvidence {
  intent: string;
  goal: string;
  baseline: {
    actions: string[];
    actionCount: number;
    screens: string[];
    finalScreen?: string;
    oraclePassed?: boolean;
    finalState?: Record<string, unknown>;
    initialShot: string;
    finalShot: string;
  };
  candidate: {
    actions: string[];
    actionCount: number;
    screens: string[];
    finalScreen?: string;
    oraclePassed?: boolean;
    finalState?: Record<string, unknown>;
    initialShot: string;
    finalShot: string;
  };
}

export interface CaseBundle {
  caseId: string;
  decision: string;
  promise: string;
  intents: IntentEvidence[];
}

/** Relative POSIX path of a trace dir under the case dir. */
export function traceDirName(trace: Trace): string {
  return trace.id;
}

function screenOf(t: Trace, index: number): string | undefined {
  if (index < 0) return t.initial.observation.screen;
  return t.steps[index]?.after.screen;
}

function sideEvidence(t: Trace, traceDir: string): IntentEvidence["baseline"] {
  const actions = t.steps.map((s) => s.note ?? `step-${s.index}`);
  const screens: string[] = [];
  const seen = new Set<string>();
  const push = (s?: string) => {
    if (s && !seen.has(s)) {
      seen.add(s);
      screens.push(s);
    }
  };
  push(t.initial.observation.screen);
  for (const s of t.steps) push(s.after.screen);
  const shots = [
    t.initial.observation.screenshot,
    t.steps.length ? t.steps[t.steps.length - 1].after.screenshot : t.initial.observation.screenshot,
  ].map((f) => path.join(traceDir, f));
  return {
    actions,
    actionCount: countActions(t),
    screens,
    finalScreen: t.steps.length ? t.steps[t.steps.length - 1].after.screen : t.initial.observation.screen,
    oraclePassed: t.oracle.passed,
    finalState: t.final.state,
    initialShot: shots[0],
    finalShot: shots[1],
  };
}

/** Build the reviewer/comparator-shared bundle from frozen traces on disk. */
export async function buildCaseBundle(opts: {
  caseDir: string;
  contract: AgencyContract;
  traces: Trace[];
}): Promise<CaseBundle> {
  const intents: IntentEvidence[] = [];
  for (const intent of opts.contract.intents) {
    const b = opts.traces.find((t) => t.intentId === intent.id && t.variant === "baseline");
    const c = opts.traces.find((t) => t.intentId === intent.id && t.variant === "candidate");
    if (!b || !c) throw new Error(`Missing ${intent.id} baseline/candidate trace in ${opts.caseDir}`);
    intents.push({
      intent: `${opts.contract.decision}.${intent.id}`,
      goal: intent.goal,
      baseline: sideEvidence(b, traceDirName(b)),
      candidate: sideEvidence(c, traceDirName(c)),
    });
  }
  return { caseId: path.basename(opts.caseDir), decision: opts.contract.decision, promise: opts.contract.promise, intents };
}

/** Render the text half of the reviewer prompt. Images are attached separately. */
export function renderBundleText(bundle: CaseBundle): string {
  const lines = [
    `Product promise: "${bundle.promise}"`,
    `Decision under review: ${bundle.decision} (case ${bundle.caseId})`,
    `Two variants of the same app were probed with an identical scripted path per intention.`,
    ``,
  ];
  for (const e of bundle.intents) {
    const fmt = (s: IntentEvidence["baseline"], label: string) => [
      `${label}: ${s.actions.length ? s.actions.join(" -> ") : "(no actions; intent already satisfied)"}`,
      `${label} taps: ${s.actionCount}; screens visited: ${s.screens.join(" > ") || "?"}; final screen: ${s.finalScreen ?? "?"}`,
      `${label} final-state oracle: ${s.oraclePassed === undefined ? "not checked" : s.oraclePassed ? "PASS" : "FAIL"}; final state: ${JSON.stringify(s.finalState ?? null)}`,
    ];
    lines.push(`Intention ${e.intent}: ${e.goal}`);
    lines.push(...fmt(e.baseline, "BASELINE"));
    lines.push(...fmt(e.candidate, "CANDIDATE"));
    lines.push(``);
  }
  return lines.join("\n");
}

export interface StoppedInfo {
  stoppedReason: Trace["stoppedReason"];
  error?: string;
}

/** One line per intent per variant so the reviewer sees script completion state. */
export function renderStoppedLines(bundle: CaseBundle, stopped: Record<string, StoppedInfo>): string {
  const lines: string[] = [];
  for (const e of bundle.intents) {
    for (const side of ["baseline", "candidate"] as const) {
      const key = `${e.intent}.${side}`;
      const s = stopped[key];
      if (!s) continue;
      lines.push(`${e.intent} ${side.toUpperCase()} stopped: ${s.stoppedReason}${s.error ? ` (${s.error})` : ""}`);
    }
  }
  return lines.join("\n");
}

/** Ordered PNG paths for the reviewer call: per intent, baseline initial/final then candidate initial/final. */
export function bundleImageOrder(caseDir: string, bundle: CaseBundle): { intent: string; label: string; file: string }[] {
  const out: { intent: string; label: string; file: string }[] = [];
  for (const e of bundle.intents) {
    out.push({ intent: e.intent, label: "BASELINE first screen", file: path.join(caseDir, e.baseline.initialShot) });
    out.push({ intent: e.intent, label: "BASELINE final screen", file: path.join(caseDir, e.baseline.finalShot) });
    out.push({ intent: e.intent, label: "CANDIDATE first screen", file: path.join(caseDir, e.candidate.initialShot) });
    out.push({ intent: e.intent, label: "CANDIDATE final screen", file: path.join(caseDir, e.candidate.finalShot) });
  }
  return out;
}

/** Fail when reviewer-facing text leaks seed names or ground-truth pointers. */
export function assertBundleClean(c: MatchedCase, text: string): void {
  for (const tok of FORBIDDEN_BUNDLE_TOKENS) {
    if (text.includes(tok)) throw new Error(`Bundle for ${c.caseId} leaks forbidden token ${tok}`);
  }
}

export function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export async function sha256File(file: string): Promise<string> {
  return sha256Hex(await readFile(file));
}

export { screenOf };
