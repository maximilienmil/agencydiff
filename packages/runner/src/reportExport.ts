import type { AgencyReport } from "@agencydiff/core";

export interface RunIndexEntry {
  id: string;
  decision: string;
  date: string;
  passed: boolean;
  driver: string;
  target: { baseline: string; candidate: string };
  traces: number;
  findings: { high: number; medium: number; low: number };
}

/** Latest entry first, replacing any earlier entry for the same run. */
export function mergeRuns(runs: RunIndexEntry[], entry: RunIndexEntry): RunIndexEntry[] {
  return [entry, ...runs.filter((r) => r.id !== entry.id)];
}

export function buildEntry(opts: {
  id: string;
  report: AgencyReport;
  driver: string;
  target: { baseline: string; candidate: string };
  date?: string;
}): RunIndexEntry {
  const { report } = opts;
  return {
    id: opts.id,
    decision: report.decision,
    date: opts.date ?? new Date().toISOString(),
    passed: report.passed,
    driver: opts.driver,
    target: opts.target,
    traces: report.aggregates.reduce((n, a) => n + a.traceIds.length, 0),
    findings: {
      high: report.findings.filter((f) => f.severity === "high").length,
      medium: report.findings.filter((f) => f.severity === "medium").length,
      low: report.findings.filter((f) => f.severity === "low").length,
    },
  };
}
