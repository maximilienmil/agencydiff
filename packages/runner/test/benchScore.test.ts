import { describe, expect, it } from "vitest";
import type { AgencyReport, Trace } from "@agencydiff/core";
import {
  actionVariance,
  oracleRate,
  qualify,
  sameIntent,
  scoreJudgeSeed,
  scoreSeed,
  summarizeVerdicts,
  tracesDiffer,
  usdForTokens,
  type GroundTruthEntry,
} from "../src/benchScore.js";
import { parseJudgeVerdicts } from "../src/benchJudge.js";

function trace(over: Partial<Trace> & { id: string }): Trace {
  return {
    decision: "d",
    intentId: "i",
    variant: "baseline",
    repeat: 0,
    driver: { kind: "scripted" },
    startedAt: "t",
    initial: { observation: { url: "u", screen: "home", tags: [], screenshot: "" } },
    steps: [],
    final: {},
    oracle: { checked: true, passed: true },
    stoppedReason: "script_done",
    ...over,
  } as Trace;
}

const truth = (seed: string, intents: string[], direction: "regression" | "none" = "regression"): GroundTruthEntry => ({
  seed,
  intents,
  direction,
  metric: "action_cost",
});

describe("usdForTokens", () => {
  it("applies contributor pricing", () => {
    expect(usdForTokens(1_000_000, 1_000_000)).toBeCloseTo(0.3);
    expect(usdForTokens(0, 0)).toBe(0);
  });
});

describe("tracesDiffer", () => {
  it("is false for identical traces", () => {
    const t = trace({ id: "a" });
    expect(tracesDiffer([t], [trace({ id: "a" })])).toBe(false);
  });
  it("spots an oracle flip and a stranded dialog", () => {
    const base = trace({ id: "b" });
    const flipped = trace({ id: "c", oracle: { checked: true, passed: false } });
    expect(tracesDiffer([base], [flipped])).toBe(true);
  });
  it("is false with no traces on either side", () => {
    expect(tracesDiffer([], [])).toBe(false);
  });
});

describe("scoreSeed", () => {
  const report = (decision: string, findings: AgencyReport["findings"]): AgencyReport => ({
    decision,
    promise: "p",
    aggregates: [],
    asymmetry: [],
    findings,
    passed: findings.length === 0,
  });

  it("hits on a Finding that names the expected intent", () => {
    const v = scoreSeed({
      seed: "S",
      truth: truth("S", ["d.i"]),
      contracts: ["d"],
      reports: [
        report("d", [
          { id: "d/action_cost/i", severity: "high", kind: "goal_unreachable", decision: "d", intentId: "i", title: "t", baseline: 1, candidate: 0, evidence: [] },
        ]),
      ],
      tracesByIntent: new Map(),
    });
    expect(v.detected).toBe(true);
    expect(v.expected[0]).toMatchObject({ hit: true, via: "finding" });
  });

  it("hits a default seed through the decision-level default finding", () => {
    const v = scoreSeed({
      seed: "S",
      truth: { ...truth("S", ["d.i"]), metric: "default" },
      contracts: ["d"],
      reports: [
        report("d", [
          { id: "d/default_flip/pair", severity: "high", kind: "default_flip", decision: "d", title: "t", baseline: "a", candidate: "b", evidence: [] },
        ]),
      ],
      tracesByIntent: new Map(),
    });
    expect(v.detected).toBe(true);
    expect(v.expected[0].via).toBe("default");
  });

  it("counts a trace difference as lenient only, not a strict detection", () => {
    const base = trace({ id: "b", intentId: "i" });
    const cand = trace({
      id: "c",
      intentId: "i",
      steps: [{ index: 0, tMs: 1, actions: [], after: { url: "u", screen: "home+dialog", tags: [], screenshot: "" } }],
    });
    const v = scoreSeed({
      seed: "S",
      truth: truth("S", ["d.i"]),
      contracts: ["d"],
      reports: [report("d", [])],
      tracesByIntent: new Map([["d.i", { baseline: [base], candidate: [cand] }]]),
    });
    expect(v.detected).toBe(false);
    expect(v.lenientDetected).toBe(true);
    expect(v.expected[0]).toMatchObject({ hit: false, via: "behavior" });
    expect(v.missed).toEqual(["d.i"]);
  });

  it("misses when nothing moved and records unexpected findings", () => {
    const v = scoreSeed({
      seed: "S",
      truth: truth("S", ["d.i"]),
      contracts: ["d"],
      reports: [
        report("d", [
          { id: "d/action_cost/other", severity: "low", kind: "action_cost", decision: "d", intentId: "other", title: "t", baseline: 1, candidate: 2, evidence: [] },
        ]),
      ],
      tracesByIntent: new Map([["d.i", { baseline: [trace({ id: "a" })], candidate: [trace({ id: "b" })] }]]),
    });
    expect(v.detected).toBe(false);
    expect(v.missed).toEqual(["d.i"]);
    expect(v.unexpected.map((u) => u.intentId)).toEqual(["other"]);
  });

  it("flags a control with a finding and passes a clean one", () => {
    const clean = scoreSeed({
      seed: "C", truth: truth("C", [], "none"), contracts: ["d"], reports: [report("d", [])],
      tracesByIntent: new Map([["d.i", { baseline: [trace({ id: "a" })], candidate: [trace({ id: "b" })] }]]),
    });
    expect(clean.falseAlarm).toBe(false);
    const dirty = scoreSeed({
      seed: "C", truth: truth("C", [], "none"), contracts: ["d"],
      reports: [report("d", [
        { id: "x", severity: "low", kind: "action_cost", decision: "d", intentId: "i", title: "t", baseline: 1, candidate: 2, evidence: [] },
      ])],
      tracesByIntent: new Map(),
    });
    expect(dirty.falseAlarm).toBe(true);
  });

  it("does not false-alarm a control on trace noise alone", () => {
    const noisy = scoreSeed({
      seed: "C", truth: truth("C", [], "none"), contracts: ["d"], reports: [report("d", [])],
      tracesByIntent: new Map([["d.i", {
        baseline: [trace({ id: "a" })],
        candidate: [trace({
          id: "b",
          steps: [{ index: 0, tMs: 1, actions: [], after: { url: "u", screen: "elsewhere", tags: [], screenshot: "" } }],
        })],
      }]]),
    });
    expect(noisy.falseAlarm).toBe(false);
  });
});

describe("scoreJudgeSeed", () => {
  it("detects harder on expected intents and flags extras", () => {
    const v = scoreJudgeSeed({
      seed: "S",
      truth: truth("S", ["d.i"]),
      contracts: ["d"],
      verdicts: { "d.i": "harder", "d.other": "easier" },
    });
    expect(v.detected).toBe(true);
    expect(v.unexpected.map((u) => u.intentId)).toEqual(["d.other"]);
  });

  it("misses unchanged and flags changed controls", () => {
    const miss = scoreJudgeSeed({ seed: "S", truth: truth("S", ["d.i"]), contracts: ["d"], verdicts: { "d.i": "unchanged" } });
    expect(miss.detected).toBe(false);
    const control = scoreJudgeSeed({ seed: "C", truth: truth("C", [], "none"), contracts: ["d"], verdicts: { "d.i": "harder" } });
    expect(control.falseAlarm).toBe(true);
  });
});

describe("parseJudgeVerdicts", () => {
  it("extracts JSON from prose and qualifies bare ids", () => {
    const v = parseJudgeVerdicts('Here you go:\n{"verdicts": {"i": "harder", "d.j": "unchanged"}}', "d");
    expect(v).toEqual({ "d.i": "harder", "d.j": "unchanged" });
  });
  it("rejects bad values", () => {
    expect(() => parseJudgeVerdicts('{"verdicts": {"i": "worse"}}', "d")).toThrow();
  });
});

describe("summarizeVerdicts", () => {
  it("computes recall, precision and control FAR at seed level", () => {
    const t = summarizeVerdicts([
      { seed: "a", kind: "regression", contracts: [], detected: true, lenientDetected: true, falseAlarm: false, expected: [], missed: [], unexpected: [], oraclePassRate: {} },
      { seed: "b", kind: "regression", contracts: [], detected: false, lenientDetected: true, falseAlarm: false, expected: [], missed: ["x"], unexpected: [], oraclePassRate: {} },
      { seed: "c", kind: "control", contracts: [], detected: false, lenientDetected: false, falseAlarm: true, expected: [], missed: [], unexpected: [], oraclePassRate: {} },
      { seed: "d", kind: "control", contracts: [], detected: false, lenientDetected: false, falseAlarm: false, expected: [], missed: [], unexpected: [], oraclePassRate: {} },
    ]);
    expect(t).toMatchObject({ detected: 1, recall: 0.5, precision: 0.5, controlFalseAlarmRate: 0.5, lenientOnly: ["b"] });
  });
});

describe("helpers", () => {
  it("qualify and sameIntent handle bare and qualified ids", () => {
    expect(qualify("i", "d")).toBe("d.i");
    expect(qualify("d.i", "d")).toBe("d.i");
    expect(sameIntent("i", "d", "d.i")).toBe(true);
    expect(sameIntent("i", "d", "d.j")).toBe(false);
  });
  it("actionVariance is zero for identical repeats", () => {
    expect(actionVariance([trace({ id: "a" }), trace({ id: "b" })])).toBe(0);
  });
  it("oracleRate counts passes", () => {
    expect(oracleRate([trace({ id: "a" }), trace({ id: "b", oracle: { checked: true, passed: false } })])).toBe(0.5);
  });
});
