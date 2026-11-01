import { describe, expect, it } from "vitest";
import { auditContract } from "../src/diff.js";
import type { Action, AgencyContract, Trace } from "../src/types.js";

const contract: AgencyContract = {
  decision: "precise_location",
  promise: "Users can choose.",
  intents: [
    { id: "share", goal: "Share", polarity: "accept", mustSucceed: true },
    { id: "withhold", goal: "Withhold", polarity: "reject", mustSucceed: true },
  ],
  pairs: [{ accept: "share", reject: "withhold" }],
};

const click: Action = { type: "click", x: 1, y: 1 };

function trace(intentId: string, clicks: number): Trace {
  const obs = { url: "http://x", screen: "home", screenshot: "x.png", tags: [] };
  return {
    id: `${intentId}-audit`,
    decision: contract.decision,
    intentId,
    variant: "baseline",
    repeat: 0,
    driver: { kind: "scripted" },
    startedAt: "2026-10-28T00:00:00Z",
    initial: { observation: obs },
    steps: Array.from({ length: clicks }, (_, i) => ({
      index: i,
      tMs: i * 100,
      actions: [click],
      after: obs,
    })),
    final: {},
    oracle: { checked: true, passed: true },
    stoppedReason: "agent_done",
  };
}

describe("auditContract", () => {
  it("reports cost and asymmetry for one variant, labelled model-judged", () => {
    const r = auditContract(
      contract,
      "baseline",
      "http://x",
      [trace("share", 1), trace("withhold", 3)],
      true,
    );
    expect(r.variant).toBe("baseline");
    expect(r.modelJudged).toBe(true);
    expect(r.cost).toMatchObject({ totalActions: 4, traces: 2 });
    expect(r.asymmetry).toMatchObject([{ accept: "share", reject: "withhold", ratio: 3 }]);
    expect(r.traceIds).toHaveLength(2);
  });
});
