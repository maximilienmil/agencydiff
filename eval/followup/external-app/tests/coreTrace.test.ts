/** Adapter and scoring-agreement tests for the core-integration phase.
 *  No browser, no container: synthetic traces plus the frozen contract. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { diffContract } from "../../../../packages/core/src/diff.js";
import { countActions } from "../../../../packages/core/src/metrics.js";
import type {
  AgencyContract,
  Finding as CoreFinding,
  Trace,
} from "../../../../packages/core/src/types.js";
import { describe, expect, it } from "vitest";
import { classifyAgreement } from "../src/coreCompare.js";
import { CORE_DECISION, toCoreVariant, traceIdFor } from "../src/coreProbe.js";
import { decideDeterministic, type ProbeRun } from "../src/score.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const contract = JSON.parse(
  readFileSync(path.join(ROOT, "contracts", "ntfy-choice-protection.json"), "utf-8"),
) as AgencyContract;

function run(variant: string, decision: string, taps: number, oraclePass: boolean): ProbeRun {
  return { variant, decision, rep: 0, taps, oraclePass };
}

function trace(
  intentId: string,
  variant: "baseline" | "candidate",
  taps: number,
  oraclePass: boolean,
): Trace {
  const steps = Array.from({ length: taps }, (_, i) => ({
    index: i,
    tMs: i * 100,
    actions: [{ type: "click" as const, x: 100 + i, y: 200 }],
    after: { url: "http://127.0.0.1:5280/", tags: [], screenshot: `00${i + 1}.png` },
  }));
  return {
    id: `${CORE_DECISION}.${intentId}.${variant}.0`,
    decision: CORE_DECISION,
    intentId,
    variant,
    repeat: 0,
    driver: { kind: "scripted" },
    startedAt: new Date(0).toISOString(),
    initial: { observation: { url: "http://127.0.0.1:5280/", tags: [], screenshot: "000.png" } },
    steps,
    final: {},
    oracle: { checked: true, passed: oraclePass },
    stoppedReason: "script_done",
  };
}

function coreKinds(intentId: string, base: Trace, cand: Trace): CoreFinding[] {
  return diffContract(contract, [base, cand]).findings.filter((f) => f.intentId === intentId);
}

describe("frozen contract shape", () => {
  it("covers the four protective decisions, all must-succeed, no pairs", () => {
    expect(contract.decision).toBe("ntfy-choice-protection");
    expect(contract.intents.map((i) => i.id)).toEqual(["D1", "D2", "D3", "D4"]);
    expect(contract.intents.every((i) => i.mustSucceed)).toBe(true);
    expect(contract.intents.every((i) => i.polarity === "reject")).toBe(true);
    expect(contract.pairs).toEqual([]);
  });
});

describe("adapter naming", () => {
  it("maps only pristine baseline to the baseline variant", () => {
    expect(toCoreVariant("baseline")).toBe("baseline");
    for (const v of ["V-benign", "V-improve", "O1", "O2", "O3", "O4", "A-menu-0"]) {
      expect(toCoreVariant(v)).toBe("candidate");
    }
  });
  it("builds unique trace ids carrying the pilot variant name", () => {
    const ids = new Set(["O1", "O2", "A-menu-0"].map((v) => traceIdFor("D1", v, 0)));
    expect(ids.size).toBe(3);
    expect(traceIdFor("D1", "O1", 0)).toContain(".O1.");
  });
  it("counts one effortful action per recorded tap", () => {
    expect(countActions(trace("D1", "baseline", 6, true))).toBe(6);
    expect(countActions(trace("D4", "baseline", 4, true))).toBe(4);
  });
});

describe("core findings mirror the frozen deterministic rule", () => {
  const cases: { name: string; base: ProbeRun; cand: ProbeRun; standaloneKind: string | null; coreKinds: string[] }[] = [
    { name: "equal replay stays silent", base: run("baseline", "D1", 6, true), cand: run("O9", "D1", 6, true), standaloneKind: null, coreKinds: [] },
    { name: "removed control flags both", base: run("baseline", "D1", 6, true), cand: run("O1", "D1", 5, false), standaloneKind: "goal_unreachable", coreKinds: ["goal_unreachable"] },
    { name: "+1 tap flags cost on both", base: run("baseline", "D2", 6, true), cand: run("O2", "D2", 7, true), standaloneKind: "action_cost", coreKinds: ["action_cost"] },
    { name: "+2 taps flags cost on both", base: run("baseline", "D3", 6, true), cand: run("O3", "D3", 8, true), standaloneKind: "action_cost", coreKinds: ["action_cost"] },
    { name: "fewer taps is an improvement, never a finding", base: run("baseline", "D1", 6, true), cand: run("V-improve", "D1", 5, true), standaloneKind: null, coreKinds: [] },
  ];
  for (const c of cases) {
    it(c.name, () => {
      const standalone = decideDeterministic([c.base], [c.cand]);
      const standaloneKind = "finding" in standalone && standalone.finding === null ? null : (standalone as { kind: string }).kind;
      expect(standaloneKind).toBe(c.standaloneKind);
      const b = trace(c.base.decision, "baseline", c.base.taps, c.base.oraclePass);
      const d = trace(c.cand.decision, "candidate", c.cand.taps, c.cand.oraclePass);
      // Candidate trace id must carry the pilot variant segment the runner filters on.
      d.id = `${CORE_DECISION}.${c.cand.decision}.${c.cand.variant}.0`;
      const kinds = coreKinds(c.base.decision, b, d).map((f) => f.kind);
      expect(kinds).toEqual(c.coreKinds);
      expect(classifyAgreement(standalone, coreKinds(c.base.decision, b, d)).agreement).toBe("agree");
    });
  }
});

describe("blind rename false flags are shared, not smoothed", () => {
  it("both instruments flag a relabelled-but-working control as unreachable", () => {
    // A-menu-0 renames Unsubscribe/Mute/Clear; the exact-match replay fails
    // its oracle while the protective choice still works live. Both
    // instruments must say goal_unreachable here: the adapter records the
    // replay faithfully and the disagreement with functional reality is
    // retained in the report, not filtered by either scorer.
    const b = run("baseline", "D1", 6, true);
    const c = { ...run("A-menu-0", "D1", 5, false), detail: "Unsubscribe menuitem absent" };
    const standalone = decideDeterministic([b], [c]);
    expect(standalone).toMatchObject({ kind: "goal_unreachable" });
    const kinds = coreKinds("D1", trace("D1", "baseline", 6, true), {
      ...trace("D1", "candidate", 5, false),
      id: `${CORE_DECISION}.D1.A-menu-0.0`,
    }).map((f) => f.kind);
    expect(kinds).toEqual(["goal_unreachable"]);
    expect(classifyAgreement(standalone, coreKinds("D1", trace("D1", "baseline", 6, true), {
      ...trace("D1", "candidate", 5, false),
      id: `${CORE_DECISION}.D1.A-menu-0.0`,
    })).agreement).toBe("agree");
  });
});

describe("agreement classifier retains real divergence", () => {
  it("flags standalone-silent/core-loud and standalone-loud/core-silent", () => {
    const silent = { finding: null, reason: "equal", detail: "taps 6 both sides" } as const;
    const loud: CoreFinding[] = [{
      id: "x", severity: "low", kind: "action_cost", decision: CORE_DECISION,
      intentId: "D2", title: "t", baseline: 6, candidate: 7, evidence: [],
    }];
    expect(classifyAgreement(silent, loud).agreement).toBe("disagree");
    expect(
      classifyAgreement({ decision: "D2", kind: "action_cost", baseline: "6", candidate: "7" }, []).agreement,
    ).toBe("disagree");
    expect(
      classifyAgreement({ finding: null, reason: "baseline-broken", detail: "baseline oracle failed" }, []).agreement,
    ).toBe("needs-review");
  });
});
