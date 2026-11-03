import { describe, expect, it } from "vitest";
import {
  decideDeterministic,
  decideNoisy,
  type ProbeRun,
} from "../src/score.js";

function run(variant: string, decision: string, rep: number, taps: number, pass: boolean): ProbeRun {
  return { variant, decision, rep, taps, oraclePass: pass };
}

describe("decideDeterministic", () => {
  it("reports equal when taps and oracles match", () => {
    const out = decideDeterministic([run("b", "D1", 0, 5, true)], [run("c", "D1", 0, 5, true)]);
    expect(out).toEqual({ finding: null, reason: "equal", detail: "taps 5 both sides" });
  });

  it("reports action_cost on any tap increase", () => {
    const out = decideDeterministic([run("b", "D2", 0, 4, true)], [run("c", "D2", 0, 6, true)]);
    expect(out).toMatchObject({ decision: "D2", kind: "action_cost" });
  });

  it("reports goal_unreachable when the candidate oracle fails", () => {
    const out = decideDeterministic([run("b", "D1", 0, 5, true)], [run("c", "D1", 0, 5, false)]);
    expect(out).toMatchObject({ decision: "D1", kind: "goal_unreachable" });
  });

  it("treats fewer taps as improvement, never a finding", () => {
    const out = decideDeterministic([run("b", "D1", 0, 5, true)], [run("c", "D1", 0, 3, true)]);
    expect(out).toMatchObject({ finding: null, reason: "improvement" });
  });

  it("refuses to score when baseline taps vary", () => {
    const out = decideDeterministic(
      [run("b", "D2", 0, 4, true), run("b", "D2", 1, 6, true)],
      [run("c", "D2", 0, 6, true), run("c", "D2", 1, 6, true)],
    );
    expect(out).toMatchObject({ finding: null, reason: "baseline-broken" });
  });

  it("refuses to score when baseline oracle fails", () => {
    const out = decideDeterministic([run("b", "D1", 0, 5, false)], [run("c", "D1", 0, 5, false)]);
    expect(out).toMatchObject({ finding: null, reason: "baseline-broken" });
  });

  it("flags goal_unreachable even when taps also change", () => {
    const out = decideDeterministic([run("b", "D4", 0, 3, true)], [run("c", "D4", 0, 9, false)]);
    expect(out).toMatchObject({ decision: "D4", kind: "goal_unreachable" });
  });
});

describe("decideNoisy", () => {
  const base = [4, 5, 5].map((t, i) => run("b", "D2", i, t, true));

  it("finds action_cost only on separated ranges", () => {
    const out = decideNoisy(base, [7, 8, 8].map((t, i) => run("c", "D2", i, t, true)));
    expect(out).toMatchObject({ decision: "D2", kind: "action_cost" });
  });

  it("stays silent on overlapping ranges", () => {
    const out = decideNoisy(base, [4, 5, 9].map((t, i) => run("c", "D2", i, t, true)));
    expect(out).toMatchObject({ finding: null, reason: "equal" });
  });

  it("finds goal_unreachable on >=2/3 pass-to-fail flips", () => {
    const out = decideNoisy(
      base,
      [run("c", "D1", 0, 5, false), run("c", "D1", 1, 5, false), run("c", "D1", 2, 5, true)],
    );
    expect(out).toMatchObject({ decision: "D1", kind: "goal_unreachable" });
  });

  it("does not flip on a single noisy failure", () => {
    const out = decideNoisy(
      base,
      [run("c", "D1", 0, 5, false), run("c", "D1", 1, 5, true), run("c", "D1", 2, 5, true)],
    );
    expect(out).toMatchObject({ finding: null });
  });
});
