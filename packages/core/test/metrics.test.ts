import { describe, expect, it } from "vitest";
import {
  aggregate,
  firstSatisfaction,
  traceMetrics,
  type SatisfactionInput,
} from "../src/metrics.js";
import type { Trace, TraceStep } from "../src/types.js";

const click = { type: "click", x: 1, y: 1 } as const;
const wait = { type: "wait" } as const;
const shot = { type: "screenshot" } as const;

function steps(actions: (typeof click | typeof wait | typeof shot)[][]): Pick<TraceStep, "actions">[] {
  return actions.map((a, i) => ({ index: i, tMs: i * 1000, actions: [...a], after: undefined as never }));
}

describe("firstSatisfaction", () => {
  it("is zero-cost when the oracle holds on the initial observation", () => {
    const s: SatisfactionInput = { initialSatisfied: true, satisfiedFlags: [], finalPassed: true };
    expect(firstSatisfaction(steps([[click], [click]]), s)).toEqual({
      firstSatisfiedStep: 0,
      actionsToSatisfy: 0,
    });
  });

  it("stops at the first satisfied step, counting only effortful actions", () => {
    const s: SatisfactionInput = {
      initialSatisfied: false,
      satisfiedFlags: [false, true, true],
      finalPassed: true,
    };
    expect(firstSatisfaction(steps([[click], [wait, click, shot], [click]]), s)).toEqual({
      firstSatisfiedStep: 2,
      actionsToSatisfy: 2,
    });
  });

  it("falls back to the final state when no step flag fired", () => {
    const s: SatisfactionInput = { initialSatisfied: false, satisfiedFlags: [], finalPassed: true };
    expect(firstSatisfaction(steps([[click], [click]]), s)).toEqual({
      firstSatisfiedStep: 2,
      actionsToSatisfy: 2,
    });
  });

  it("is empty when the oracle never held", () => {
    const s: SatisfactionInput = {
      initialSatisfied: false,
      satisfiedFlags: [false, false],
      finalPassed: false,
    };
    expect(firstSatisfaction(steps([[click], [click]]), s)).toEqual({});
  });
});

function trace(id: string, actionsToSatisfy?: number): Trace {
  const obs = { url: "http://x", screen: "home", screenshot: "x.png", tags: [] };
  return {
    id,
    decision: "d",
    intentId: "i",
    variant: "baseline",
    repeat: 0,
    driver: { kind: "scripted" },
    startedAt: "2026-11-01T00:00:00Z",
    initial: { observation: obs },
    steps: [{ index: 0, tMs: 0, actions: [{ type: "click", x: 1, y: 1 }], after: obs }],
    final: {},
    oracle: { checked: true, passed: true },
    stoppedReason: "satisfied",
    actionsToSatisfy,
  };
}

describe("actionsToSatisfy aggregation", () => {
  it("carries the recorded cost through traceMetrics into the aggregate median", () => {
    const ms = [trace("a", 1), trace("b", 5), trace("c", 3)].map((t) =>
      traceMetrics(t, { id: "i", goal: "G", polarity: "neutral", mustSucceed: true }),
    );
    expect(ms[0].actionsToSatisfy).toBe(1);
    expect(aggregate("i", "baseline", ms).actionsToSatisfy).toBe(3);
  });

  it("leaves the aggregate empty when no run recorded a cost", () => {
    const ms = [trace("a")].map((t) =>
      traceMetrics(t, { id: "i", goal: "G", polarity: "neutral", mustSucceed: true }),
    );
    expect(ms[0].actionsToSatisfy).toBeUndefined();
    expect(aggregate("i", "baseline", ms).actionsToSatisfy).toBeUndefined();
  });
});
