import { describe, expect, it } from "vitest";
import {
  pickPvgNoiseSample,
  pickPvgTargets,
  pvgSpentUsd,
  wilsonPvg,
  type PvgAttempt,
} from "./run.js";

function attempt(over: Partial<PvgAttempt>): PvgAttempt {
  return {
    arm: "a", task: "feed", attempt: 0,
    invalidReason: null, filesChanged: [], touchedForbidden: false,
    gateClaim: "NOT-RUN", gateRuns: 0, taskDone: null,
    scripted: {}, regressions: [], execSeconds: 1,
    diffPath: "x",
    ...over,
  } as PvgAttempt;
}

describe("pickPvgNoiseSample", () => {
  it("is seeded-deterministic and balanced across arms", () => {
    const attempts = [
      ...[0, 1, 2, 3].map((n) => attempt({ arm: "a" as const, task: `t${n}`, attempt: n, scripted: {}, regressions: [] })),
      ...[0, 1, 2, 3].map((n) => attempt({ arm: "b" as const, task: `t${n}`, attempt: n, scripted: {}, regressions: [] })),
      ...[0, 1, 2, 3].map((n) => attempt({ arm: "c" as const, task: `t${n}`, attempt: n, scripted: {}, regressions: [] })),
    ];
    const once = pickPvgNoiseSample(attempts, 7, 2).map((a) => `${a.arm}/${a.task}/${a.attempt}`);
    const twice = pickPvgNoiseSample(attempts, 7, 2).map((a) => `${a.arm}/${a.task}/${a.attempt}`);
    expect(once).toEqual(twice);
    expect(once).toHaveLength(6);
    expect(once.filter((k) => k.startsWith("a/"))).toHaveLength(2);
    expect(once.filter((k) => k.startsWith("b/"))).toHaveLength(2);
    expect(once.filter((k) => k.startsWith("c/"))).toHaveLength(2);
  });

  it("skips invalid and regressed attempts", () => {
    const attempts = [
      attempt({ arm: "a", task: "x", attempt: 0, regressions: ["subscription.cancel [goal_unreachable] t"], scripted: {} }),
      attempt({ arm: "a", task: "x", attempt: 1, invalidReason: "boom" }),
      attempt({ arm: "a", task: "x", attempt: 2, scripted: {}, regressions: [] }),
    ];
    const sample = pickPvgNoiseSample(attempts, 7, 2);
    expect(sample.map((a) => a.attempt)).toEqual([2]);
  });
});

describe("pickPvgTargets", () => {
  it("orders flagged findings before noise and maps decisions to contracts", () => {
    const attempts = [
      attempt({ arm: "b", task: "billing", attempt: 1, scripted: {}, regressions: ["subscription.cancel [goal_unreachable] t"] }),
      attempt({ arm: "a", task: "feed", attempt: 0, scripted: {}, regressions: [] }),
    ];
    const sample = [attempts[1]];
    const targets = pickPvgTargets(attempts, sample, ["precise_location.withhold"]);
    expect(targets[0]).toMatchObject({ contractPath: "contracts/subscription.json", intentIds: ["cancel"], noise: false });
    const noiseTargets = targets.filter((t) => t.noise);
    expect(noiseTargets).toHaveLength(1);
    expect(noiseTargets[0]).toMatchObject({ contractPath: "contracts/location.json", intentIds: ["withhold"] });
  });

  it("ignores unparseable labels", () => {
    const attempts = [attempt({ regressions: ["not a label"], scripted: {} })];
    expect(pickPvgTargets(attempts, [], [])).toEqual([]);
  });
});

describe("wilsonPvg", () => {
  it("widens on tiny samples and contains the rate", () => {
    const w = wilsonPvg(0, 12);
    expect(w.lo).toBe(0);
    expect(w.hi).toBeGreaterThan(0);
    const w2 = wilsonPvg(6, 12);
    expect(w2.lo).toBeLessThanOrEqual(w2.rate);
    expect(w2.rate).toBeLessThanOrEqual(w2.hi);
  });
});

describe("pvgSpentUsd", () => {
  it("sums judge, confirm, and agent spend", () => {
    const r = { costUsd: { judge: 0.02, museConfirm: 0.5, agentRuns: 1.9, note: "" } };
    expect(pvgSpentUsd(r as never)).toBeCloseTo(2.42);
    expect(pvgSpentUsd({ costUsd: { judge: 0, museConfirm: 0, agentRuns: null, note: "" } } as never)).toBe(0);
  });
});
