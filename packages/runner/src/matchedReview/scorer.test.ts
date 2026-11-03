import { describe, expect, it } from "vitest";
import { diffContract, type AgencyContract, type Trace } from "@agencydiff/core";
import { scoreComparator, scoreReviewer, scoreMatchedCase } from "./scorer.js";
import type { ReviewResult } from "./reviewer.js";

function trace(intentId: string, variant: "baseline" | "candidate", taps: number, passed: boolean): Trace {
  return {
    id: `subscription.${intentId}.${variant}.0`,
    decision: "subscription",
    intentId,
    variant,
    repeat: 0,
    driver: { kind: "scripted" },
    startedAt: "2026-01-01T00:00:00.000Z",
    initial: { state: {}, observation: { url: "http://x/", screen: "feed", tags: [], screenshot: "000.png" } },
    steps: Array.from({ length: taps }, (_, i) => ({
      index: i,
      tMs: i * 100,
      actions: [{ type: "click", x: 1, y: 1 }],
      after: { url: "http://x/", screen: i === taps - 1 ? "done" : `s${i}`, tags: [], screenshot: `00${i + 1}.png` },
      note: `tag${i}`,
    })),
    final: { state: {} },
    oracle: { checked: true, passed },
    stoppedReason: "script_done",
  };
}

const contract: AgencyContract = {
  decision: "subscription",
  promise: "Cancel whenever you want.",
  intents: [
    { id: "cancel", goal: "Cancel it.", polarity: "reject", mustSucceed: true },
    { id: "resume", goal: "Stay subscribed.", polarity: "accept", mustSucceed: false },
  ],
  pairs: [],
};

const EXPECTED = [{ intent: "subscription.cancel", metric: "action_cost" }];
const CASE = { caseId: "CASE-04", seed: "SUB_BURY_CANCEL", contractFile: "subscription.json", decision: "subscription", expected: ["subscription.cancel"], isControl: false };

describe("comparator determinism and scoring", () => {
  it("produces identical findings over fixed artifacts across runs", () => {
    const traces = [trace("cancel", "baseline", 3, true), trace("cancel", "candidate", 5, true), trace("resume", "baseline", 1, true), trace("resume", "candidate", 1, true)];
    const a = diffContract(contract, traces);
    const b = diffContract(contract, traces);
    expect(JSON.stringify(a.findings)).toBe(JSON.stringify(b.findings));
    expect(a.findings.some((f) => f.intentId === "cancel" && f.kind === "action_cost")).toBe(true);
  });
  it("scores an intent hit, and flags off-intent findings", () => {
    const traces = [trace("cancel", "baseline", 3, true), trace("cancel", "candidate", 5, true), trace("resume", "baseline", 1, true), trace("resume", "candidate", 4, true)];
    const report = diffContract(contract, traces);
    const s = scoreComparator(report, CASE, EXPECTED);
    expect(s.hits).toEqual(["subscription.cancel"]);
    expect(s.falseFlags.filter((f) => f.startsWith("subscription.resume"))).toHaveLength(2);
    expect(s.precision).toBeCloseTo(1 / 3);
  });
  it("scores a default_flip as a hit for default-metric expectations", () => {
    const report = diffContract(
      { ...contract, defaultKey: "sub.plan" },
      [
        { ...trace("cancel", "baseline", 1, true), initial: { state: { "sub.plan": "monthly" }, observation: { url: "http://x/", screen: "s", tags: [], screenshot: "0.png" } } },
        { ...trace("cancel", "candidate", 1, true), initial: { state: { "sub.plan": "annual" }, observation: { url: "http://x/", screen: "s", tags: [], screenshot: "0.png" } } },
      ],
    );
    const s = scoreComparator(report, { ...CASE, decision: "subscription" }, [{ intent: "subscription.subscribe", metric: "default" }]);
    expect(report.findings.some((f) => f.kind === "default_flip")).toBe(true);
    expect(s.hits).toEqual(["subscription.subscribe"]);
  });
});

function reviewResult(verdicts: Record<string, "harder" | "easier" | "unchanged" | "uncertain">): ReviewResult {
  return { verdicts, citations: Object.fromEntries(Object.keys(verdicts).map((k) => [k, "screens: x; actions: y; oracle: z"])), notes: "", raw: "", inputTokens: 1, outputTokens: 1, calls: 1, costUsd: 0, parseRetried: false };
}

describe("scoreReviewer", () => {
  it("hits on majority harder and reports uncertain separately", () => {
    const reps = [
      reviewResult({ "subscription.cancel": "harder", "subscription.resume": "unchanged" }),
      reviewResult({ "subscription.cancel": "harder", "subscription.resume": "uncertain" }),
      reviewResult({ "subscription.cancel": "uncertain", "subscription.resume": "unchanged" }),
    ];
    const { score } = scoreReviewer(reps, CASE, EXPECTED);
    expect(score.hits).toEqual(["subscription.cancel"]);
    expect(score.uncertain).toEqual([]);
    expect(score.falseFlags).toEqual([]);
  });
  it("misses on tied votes and lists unexpected harder flags", () => {
    const reps = [
      reviewResult({ "subscription.cancel": "harder", "subscription.resume": "harder" }),
      reviewResult({ "subscription.cancel": "unchanged", "subscription.resume": "harder" }),
      reviewResult({ "subscription.cancel": "unchanged", "subscription.resume": "harder" }),
    ];
    const { score } = scoreReviewer(reps, CASE, EXPECTED);
    expect(score.misses).toEqual(["subscription.cancel"]);
    expect(score.falseFlags).toEqual(["subscription.resume"]);
  });
});

describe("matched evidence exclusions", () => {
  it("removes infrastructure failures from both denominators and false flags", () => {
    const traces = [trace("cancel", "baseline", 3, true), { ...trace("cancel", "candidate", 0, false), stoppedReason: "error" as const, error: "browser crashed" }];
    const report = diffContract(contract, traces);
    const review = { verdicts: { "subscription.cancel": "harder" }, citations: {}, notes: "", raw: "", inputTokens: 0, outputTokens: 0, calls: 1, costUsd: 0, parseRetried: false } as ReviewResult;
    const s = scoreMatchedCase(report, [review], CASE, EXPECTED, traces);
    expect(s.expected).toEqual([]);
    expect(s.excluded).toEqual(["subscription.cancel"]);
    expect(s.comparator.falseFlags).toEqual([]);
    expect(s.reviewer.score.falseFlags).toEqual([]);
    expect(Number.isNaN(s.comparator.recall)).toBe(true);
    expect(Number.isNaN(s.reviewer.score.recall)).toBe(true);
  });
  it("keeps missing reference controls as the declared path-failure signal", () => {
    const traces = [trace("cancel", "baseline", 3, true), { ...trace("cancel", "candidate", 0, false), stoppedReason: "error" as const, error: "reference tag not found: cancel" }];
    const s = scoreMatchedCase(diffContract(contract, traces), [], CASE, EXPECTED, traces);
    expect(s.expected).toEqual(EXPECTED);
    expect(s.excluded).toEqual([]);
    expect(s.comparator.hits).toEqual(["subscription.cancel"]);
  });
});
