import { describe, expect, it } from "vitest";
import { buildEntry, mergeRuns, type RunIndexEntry } from "./reportExport";
import type { AgencyReport } from "@agencydiff/core";

const report = (over: Partial<AgencyReport> = {}): AgencyReport => ({
  decision: "precise_location",
  promise: "p",
  aggregates: [
    { intentId: "a", variant: "baseline", runs: 1, successRate: 1, traceIds: ["t1", "t2"] },
    { intentId: "a", variant: "candidate", runs: 1, successRate: 1, traceIds: ["t3"] },
  ],
  asymmetry: [],
  findings: [
    {
      id: "f1",
      severity: "high",
      kind: "action_cost",
      decision: "precise_location",
      title: "t",
      baseline: 1,
      candidate: 2,
      evidence: [],
    },
  ],
  passed: false,
  ...over,
});

const target = { baseline: "http://b", candidate: "http://c" };

describe("buildEntry", () => {
  it("counts traces and findings by severity", () => {
    const e = buildEntry({ id: "run1", report: report(), driver: "scripted", target });
    expect(e.traces).toBe(3);
    expect(e.findings).toEqual({ high: 1, medium: 0, low: 0 });
    expect(e.passed).toBe(false);
    expect(e.decision).toBe("precise_location");
  });
});

describe("mergeRuns", () => {
  it("prepends and replaces entries for the same run", () => {
    const a: RunIndexEntry = buildEntry({
      id: "a",
      report: report(),
      driver: "scripted",
      target,
      date: "2026-01-01T00:00:00Z",
    });
    const b: RunIndexEntry = { ...a, id: "b" };
    const merged = mergeRuns([a], b);
    expect(merged.map((r) => r.id)).toEqual(["b", "a"]);
    const replaced = mergeRuns(merged, { ...a, passed: true });
    expect(replaced.map((r) => r.id)).toEqual(["a", "b"]);
    expect(replaced[0].passed).toBe(true);
  });
});
