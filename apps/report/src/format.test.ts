import { describe, expect, it } from "vitest";
import { fmtNum, fmtPct, intentStatus, polarityLabel, shotList } from "./format";
import type { Finding, IntentAggregate } from "@agencydiff/core";

const agg = (part: Partial<IntentAggregate> & { intentId: string; variant: "baseline" | "candidate" }): IntentAggregate => ({
  runs: 1,
  successRate: 1,
  traceIds: [],
  ...part,
});

describe("fmtNum", () => {
  it("renders numbers, booleans and missing values", () => {
    expect(fmtNum(4)).toBe("4");
    expect(fmtNum(4.0)).toBe("4");
    expect(fmtNum(1.5)).toBe("1.5");
    expect(fmtNum(true)).toBe("yes");
    expect(fmtNum(undefined)).toBe("—");
  });
});

describe("fmtPct", () => {
  it("renders success rates as whole percents", () => {
    expect(fmtPct(1)).toBe("100%");
    expect(fmtPct(0.5)).toBe("50%");
  });
});

describe("intentStatus", () => {
  it("marks blocking findings as regressions", () => {
    const b = agg({ intentId: "x", variant: "baseline" });
    const c = agg({ intentId: "x", variant: "candidate" });
    const f = { severity: "high", intentId: "x" } as Finding;
    expect(intentStatus(b, c, [f])).toBe("regression");
  });

  it("marks cheaper candidates as improvements and equal runs as unchanged", () => {
    const b = agg({ intentId: "x", variant: "baseline", actionCount: 4 });
    const cheap = agg({ intentId: "x", variant: "candidate", actionCount: 2 });
    const same = agg({ intentId: "x", variant: "candidate", actionCount: 4 });
    expect(intentStatus(b, cheap, [])).toBe("improvement");
    expect(intentStatus(b, same, [])).toBe("unchanged");
  });
});

describe("polarityLabel", () => {
  it("uses plain language for polarity", () => {
    expect(polarityLabel("reject")).toBe("Protective");
    expect(polarityLabel("accept")).toBe("Standard");
  });
});

describe("shotList", () => {
  it("starts with the initial screenshot", () => {
    const shots = shotList({
      initial: { observation: { screenshot: "000.png" } },
      steps: [{ after: { screenshot: "001.png" } }],
    });
    expect(shots).toEqual(["000.png", "001.png"]);
  });
});
