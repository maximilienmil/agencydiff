import { describe, expect, it } from "vitest";
import type { AgencyReport, LiveEvent, Trace } from "@agencydiff/core";
import { cursorFor, findingLines, paneAtStep, reduceLiveEvents, replayMaxStep } from "./live";

const trace = (variant: "baseline" | "candidate", steps: number): Trace => ({
  id: `d.i.${variant}.0`, decision: "d", intentId: "i", variant, repeat: 0, driver: { kind: "scripted" },
  startedAt: "2026-11-01T00:00:00Z",
  initial: { observation: { url: "http://x", tags: [], screenshot: "000.png" } },
  steps: Array.from({ length: steps }, (_, i) => ({ index: i, tMs: i * 100, actions: [{ type: "click", x: 10 + i, y: 20 } as const], after: { url: "http://x", tags: [], screenshot: `${String(i + 1).padStart(3, "0")}.png` } })),
  final: {}, oracle: { checked: true, passed: true }, stoppedReason: "script_done",
});

describe("live helpers", () => {
  it("reduces a streamed probe into pane state", () => {
    const at = "2026-11-01T00:00:00Z";
    const events: LiveEvent[] = [
      { type: "run_started", runId: "r", decision: "teen_dm", intentId: "block_unknown", goal: "I do not want strangers messaging me", at },
      { type: "probe_started", traceId: "t1", variant: "baseline", intentId: "block_unknown", at },
      { type: "screenshot", traceId: "t1", variant: "baseline", step: 0, screenshot: "000.png", at },
      { type: "action", traceId: "t1", variant: "baseline", step: 1, actions: [{ type: "click", x: 100, y: 200 }], at },
      { type: "screenshot", traceId: "t1", variant: "baseline", step: 1, screenshot: "001.png", at },
      { type: "oracle_result", traceId: "t1", variant: "baseline", passed: true, checked: true, stoppedReason: "script_done", at },
      { type: "probe_finished", traceId: "t1", variant: "baseline", steps: 1, at },
    ];
    const s = reduceLiveEvents(events, "http://localhost:5175");
    expect(s.goal).toContain("strangers");
    expect(s.panes.baseline).toMatchObject({ step: 1, screenshot: "001.png", oraclePassed: true, finished: true });
    expect(s.panes.baseline.screenshotUrl).toBe("http://localhost:5175/traces/t1/001.png");
  });

  it("builds replay panes and finding lines", () => {
    const b = trace("baseline", 2); const c = trace("candidate", 5);
    expect(replayMaxStep([b, c])).toBe(5);
    expect(paneAtStep(c, 2).screenshot).toBe("002.png");
    expect(cursorFor(c.steps[0].actions)).toEqual({ x: 10, y: 20, kind: "click" });
    const report = { aggregates: [
      { intentId: "i", variant: "baseline", runs: 1, successRate: 1, actionCount: 2, initiallyVisible: true, traceIds: [] },
      { intentId: "i", variant: "candidate", runs: 1, successRate: 1, actionCount: 5, initiallyVisible: false, traceIds: [] },
    ], findings: [] } as unknown as AgencyReport;
    expect(findingLines(report, "i")).toEqual(expect.arrayContaining([
      { label: "Steps needed", text: "2 → 5" },
      { label: "Visible on first screen", text: "yes → no" },
    ]));
  });
});
