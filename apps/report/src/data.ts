import type { AgencyReport, Finding, IntentAggregate, Trace } from "@agencydiff/core";

export interface RunMeta {
  id: string;
  decision: string;
  date: string;
  driver: string;
  target: { baseline: string; candidate: string };
}

export interface RunIndex {
  runs: {
    id: string;
    decision: string;
    date: string;
    passed: boolean;
    driver: string;
    target: { baseline: string; candidate: string };
    traces: number;
    findings: { high: number; medium: number; low: number };
  }[];
}

export interface BenchSeed {
  seed: string;
  description: string;
  detected: boolean;
  evidence?: string;
}

export interface BenchJudges {
  agencyDiff: { precision: number; recall: number; falseAlarms: number };
  museAsJudge: { precision: number; recall: number; falseAlarms: number };
}

export interface EvalResults {
  updatedAt: string;
  decision: string;
  sample: boolean;
  summary: { precision: number; recall: number; falseAlarms: number; controls: number };
  seeds: BenchSeed[];
  judges: BenchJudges;
}

const base = import.meta.env.BASE_URL || "/";

export const dataUrl = (p: string) => `${base}data/${p}`;

async function get<T>(p: string): Promise<T> {
  const res = await fetch(dataUrl(p));
  if (!res.ok) throw new Error(`missing ${p}`);
  return res.json() as Promise<T>;
}

export const loadIndex = () => get<RunIndex>("index.json");
export const loadReport = (runId: string) => get<AgencyReport>(`${runId}/report.json`);
export const loadContract = (runId: string) =>
  get<import("@agencydiff/core").AgencyContract>(`${runId}/contract.json`);
export const loadMeta = (runId: string) => get<RunMeta>(`${runId}/meta.json`);
export const loadTrace = (runId: string, traceId: string) =>
  get<Trace>(`${runId}/${traceId}/trace.json`);
export const loadEval = () => get<EvalResults>("eval.json");

export const shotUrl = (runId: string, traceId: string, shot: string) =>
  dataUrl(`${runId}/${traceId}/${shot}`);

/** Segment overlay for a screenshot, when the runner stored one beside it. */
export const samUrl = (runId: string, traceId: string, shot: string) => {
  const overlay = shot.replace(/(\d+)(\.[a-z]+)$/i, "sam-$1$2");
  return dataUrl(`${runId}/${traceId}/${overlay}`);
};

export function aggregatesByIntent(report: AgencyReport) {
  const byId = new Map<string, { baseline?: IntentAggregate; candidate?: IntentAggregate }>();
  for (const a of report.aggregates) {
    const slot = byId.get(a.intentId) ?? {};
    slot[a.variant] = a;
    byId.set(a.intentId, slot);
  }
  return byId;
}

export function findingsFor(report: AgencyReport, intentId?: string): Finding[] {
  return report.findings.filter((f) => (intentId ? f.intentId === intentId : !f.intentId));
}

export function tracesForIntent(
  traces: Trace[],
  intentId: string,
  variant: "baseline" | "candidate",
): Trace[] {
  return traces.filter((t) => t.intentId === intentId && t.variant === variant);
}
