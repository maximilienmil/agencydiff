import type { Finding, IntentAggregate } from "@agencydiff/core";

export type RowStatus = "regression" | "improvement" | "unchanged";

export function fmtNum(v: unknown): string {
  if (v === undefined || v === null) return "—";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, "").replace(/\.$/, ".0");
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}

export function fmtPct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function worse(baseline?: number, candidate?: number): boolean {
  return baseline !== undefined && candidate !== undefined && candidate > baseline;
}

function better(baseline?: number, candidate?: number): boolean {
  return baseline !== undefined && candidate !== undefined && candidate < baseline;
}

/** Row status for one intent: any blocking finding means regression. */
export function intentStatus(
  b: IntentAggregate | undefined,
  c: IntentAggregate | undefined,
  findings: Finding[],
): RowStatus {
  if (!b || !c) return "unchanged";
  if (findings.some((f) => f.intentId === b.intentId && f.severity !== "low")) return "regression";
  const regressed =
    (b.successRate > c.successRate && c.successRate < 1) ||
    worse(b.actionCount, c.actionCount) ||
    worse(b.navigationDepth, c.navigationDepth) ||
    (b.initiallyVisible === true && c.initiallyVisible === false);
  if (regressed) return "regression";
  const improved =
    (c.successRate > b.successRate) ||
    better(b.actionCount, c.actionCount) ||
    better(b.navigationDepth, c.navigationDepth) ||
    (b.initiallyVisible === false && c.initiallyVisible === true);
  return improved ? "improvement" : "unchanged";
}

export const STATUS_LABEL: Record<RowStatus, string> = {
  regression: "Regression",
  improvement: "Improvement",
  unchanged: "Unchanged",
};

export function polarityLabel(p: string): string {
  if (p === "reject") return "Protective";
  if (p === "accept") return "Standard";
  return "Neutral";
}

export function actionLabel(actions: { type: string }[]): string {
  return actions.map((a) => a.type.replace(/_/g, " ")).join(", ");
}

/** Shots shown for a trace: the initial screenshot plus one per step. */
export function shotList(trace: { initial: { observation: { screenshot: string } }; steps: { after: { screenshot: string } }[] }): string[] {
  return [trace.initial.observation.screenshot, ...trace.steps.map((s) => s.after.screenshot)];
}
