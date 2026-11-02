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

export interface BenchMethod {
  caught: string;
  falseAlarms: string;
  costUsd: number;
}

/** Shape of eval/results/summary.json, copied to data/benchmark/ at build time. */
export interface BenchSummary {
  generatedAt: string;
  agencydiff: { scripted: BenchMethod; muse: BenchMethod | null };
  judge: BenchMethod & {
    consistencyK3?: { agreement: number; pairs: number; seeds: string[] };
  };
}

export interface SusPair {
  pair: string;
  pattern: string;
  control: boolean;
  detected: boolean;
  metricsMoved: string[];
}

/** Shape of eval/susbench/results.json, copied to data/benchmark/ at build time. */
export interface SusBench {
  generatedAt: string;
  repeats: number;
  model: string;
  summary: { injectedPairs: number; detectedPairs: number; controlPairs: number; falseAlarms: number };
  pairs: SusPair[];
}

export interface Benchmark {
  summary: BenchSummary | null;
  susbench: SusBench | null;
}

export interface ShowcaseEntry {
  runId: string;
  decision: string;
  seed: string;
  seedDescription: string;
  intent: string;
  intentGoal: string;
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
export const loadShowcase = () => get<ShowcaseEntry[]>("showcase.json");

/** Real benchmark files, synced from eval/ at build time. Missing means pending, never faked. */
export async function loadBenchmark(): Promise<Benchmark> {
  const tryGet = async <T,>(p: string): Promise<T | null> => {
    try {
      return await get<T>(p);
    } catch {
      return null;
    }
  };
  const [summary, susbench] = await Promise.all([
    tryGet<BenchSummary>("benchmark/summary.json"),
    tryGet<SusBench>("benchmark/susbench.json"),
  ]);
  return { summary, susbench };
}

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
