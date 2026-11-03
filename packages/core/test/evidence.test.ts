import { describe, expect, it } from "vitest";
import { diffContract } from "../src/diff.js";
import {
  assessRediscovery,
  compareReachableCost,
  isInfrastructureError,
  isReferencePathError,
  summarizeIntentEvidence,
  traceOutcome,
} from "../src/evidence.js";
import type { AgencyContract, Trace, Variant } from "../src/types.js";

const contract: AgencyContract = {
  decision: "precise_location",
  promise: "Users can choose whether Circle gets their precise location.",
  defaultKey: "location.precise",
  intents: [
    {
      id: "share",
      goal: "Share my precise location",
      polarity: "accept",
      oracle: { "location.precise": true, "location.prompt": "answered" },
      target: "location.allow",
      mustSucceed: true,
    },
    {
      id: "withhold",
      goal: "Do not share my precise location",
      polarity: "reject",
      oracle: { "location.precise": false, "location.prompt": "answered" },
      target: "location.decline",
      mustSucceed: true,
    },
  ],
  pairs: [{ accept: "share", reject: "withhold" }],
};

const click = { type: "click", x: 1, y: 1 } as const;

function obs(tags: string[] = []) {
  return {
    url: "http://circle",
    screen: "prompt",
    screenshot: "x.png",
    tags: tags.map((tag) => ({ tag, box: [0, 0, 1, 1] as [number, number, number, number], inViewport: true })),
  };
}

function trace(
  intentId: string,
  variant: Variant,
  opts: {
    clicks?: number;
    passed?: boolean;
    checked?: boolean;
    stoppedReason?: Trace["stoppedReason"];
    error?: string;
    precise0?: boolean;
    driver?: "scripted" | "muse";
    repeat?: number;
  } = {},
): Trace {
  const clicks = opts.clicks ?? 1;
  return {
    id: `${intentId}-${variant}-${opts.repeat ?? 0}`,
    decision: contract.decision,
    intentId,
    variant,
    repeat: opts.repeat ?? 0,
    driver: { kind: opts.driver ?? "scripted" },
    startedAt: "2026-10-28T00:00:00Z",
    initial: {
      state: { "location.precise": opts.precise0 ?? false },
      observation: obs(),
    },
    steps: Array.from({ length: clicks }, (_, i) => ({
      index: i,
      tMs: i * 100,
      actions: [{ ...click }],
      after: obs(),
    })),
    final: {},
    oracle: { checked: opts.checked ?? true, passed: opts.passed ?? true },
    stoppedReason: opts.stoppedReason ?? "script_done",
    ...(opts.error ? { error: opts.error } : {}),
  };
}

function sharePair(over: Partial<ReturnType<typeof trace>> = {}) {
  return [
    trace("share", "baseline", { clicks: 1 }),
    trace("share", "candidate", { clicks: 1 }),
  ].map((t) => ({ ...t, ...over }));
}

describe("traceOutcome provenance", () => {
  it("marks reference-path errors as replay_blocked, not outcome failures", () => {
    const t = trace("withhold", "candidate", {
      clicks: 0,
      passed: false,
      stoppedReason: "error",
      error: "reference tag not found: location.decline",
    });
    expect(isReferencePathError(t.error)).toBe(true);
    expect(traceOutcome(t)).toBe("replay_blocked");
  });

  it("marks ntfy adapter menuitem-absent errors as replay_blocked", () => {
    const t = trace("withhold", "candidate", {
      clicks: 2,
      passed: false,
      stoppedReason: "error",
      error: "mute menuitem absent",
    });
    expect(traceOutcome(t)).toBe("replay_blocked");
  });

  it("marks completed-but-failed runs as outcome failures", () => {
    const t = trace("withhold", "candidate", { clicks: 2, passed: false, stoppedReason: "script_done" });
    expect(traceOutcome(t)).toBe("outcome_failure");
  });

  it("marks infrastructure errors without state as inconclusive", () => {
    const t = trace("withhold", "candidate", {
      clicks: 0,
      checked: false,
      stoppedReason: "error",
      error: "browser closed mid-run",
    });
    expect(isInfrastructureError(t.error)).toBe(true);
    expect(traceOutcome(t)).toBe("inconclusive");
  });

  it("does not count oracle-unchecked agent claims as rediscovery", () => {
    const claimed: Trace = trace("withhold", "candidate", {
      clicks: 1,
      checked: false,
      stoppedReason: "agent_done",
    });
    expect(traceOutcome(claimed)).toBe("success"); // backcompat for black-box targets
    expect(assessRediscovery([claimed]).reachable).toBe(false);
  });
});

describe("renamed working control", () => {
  it("reports replay_blocked (review-required), not goal_unreachable", () => {
    const traces = [
      trace("share", "baseline", { clicks: 1 }),
      trace("withhold", "baseline", { clicks: 1 }),
      trace("share", "candidate", { clicks: 1 }),
      // Candidate renamed the decline control: exact-label replay fails,
      // independent final state still fails on the old path.
      trace("withhold", "candidate", {
        clicks: 0,
        passed: false,
        stoppedReason: "error",
        error: "reference tag not found: location.decline",
      }),
    ];
    const r = diffContract(contract, traces);
    expect(r.findings.find((f) => f.kind === "goal_unreachable")).toBeUndefined();
    const blocked = r.findings.find((f) => f.kind === "replay_blocked");
    expect(blocked).toMatchObject({ intentId: "withhold", severity: "medium" });
    expect(blocked!.title).toMatch(/needs review/i);
    expect(blocked!.provenance).toMatchObject({
      basis: "replay-path",
      candidateReplayBlocked: 1,
      candidateOutcomeFailures: 0,
    });
    // Review-required still blocks the gate: never silently passes.
    expect(r.passed).toBe(false);
  });

  it("supports evidence-based comparison when independent rediscovery succeeds", () => {
    const baseline = [trace("withhold", "baseline", { clicks: 1 })];
    const rediscovered = [
      trace("withhold", "candidate", { clicks: 2, passed: true, stoppedReason: "script_done" }),
    ];
    const cmp = compareReachableCost(baseline, rediscovered);
    expect(cmp.reachable).toBe(true);
    expect(cmp.baselineCost).toBe(1);
    expect(cmp.rediscoveryCost).toBe(2);
    expect(cmp.delta).toBe(1);
    // Empty or unverified rediscovery never claims reachability.
    expect(compareReachableCost(baseline, []).reachable).toBe(false);
  });
});

describe("tag-preserving move and cost", () => {
  it("reports action_cost, not unreachable, when the same control costs more", () => {
    const traces = [
      trace("share", "baseline", { clicks: 1 }),
      trace("withhold", "baseline", { clicks: 1 }),
      trace("share", "candidate", { clicks: 1 }),
      trace("withhold", "candidate", { clicks: 3, passed: true }),
      ...sharePair(),
    ];
    const kinds = diffContract(contract, traces).findings.map((f) => f.kind);
    expect(kinds).toContain("action_cost");
    expect(kinds).not.toContain("goal_unreachable");
    expect(kinds).not.toContain("replay_blocked");
  });

  it("preserves increased-effort findings", () => {
    const traces = [
      trace("withhold", "baseline", { clicks: 1 }),
      trace("withhold", "candidate", { clicks: 4, passed: true }),
    ];
    const r = diffContract(contract, traces);
    expect(r.findings.find((f) => f.kind === "action_cost")).toMatchObject({
      baseline: 1,
      candidate: 4,
    });
  });
});

describe("genuinely removed control", () => {
  it("keeps goal_unreachable when a completed run fails the independent oracle", () => {
    const traces = [
      trace("withhold", "baseline", { clicks: 1, passed: true }),
      // Driver finished its path (no error stop) but the independent
      // final state still fails: observed outcome failure, not a path miss.
      trace("withhold", "candidate", { clicks: 2, passed: false, stoppedReason: "script_done" }),
    ];
    const r = diffContract(contract, traces);
    const unreachable = r.findings.find((f) => f.kind === "goal_unreachable");
    expect(unreachable).toMatchObject({ severity: "high", baseline: 1, candidate: 0 });
    expect(unreachable!.provenance).toMatchObject({
      basis: "outcome",
      candidateOutcomeFailures: 1,
    });
    expect(r.passed).toBe(false);
  });
});

describe("infrastructure errors", () => {
  it("reports probe_inconclusive (review-required), not goal_unreachable", () => {
    const traces = [
      trace("withhold", "baseline", { clicks: 1, passed: true }),
      trace("withhold", "candidate", {
        clicks: 0,
        checked: false,
        stoppedReason: "error",
        error: "browser closed mid-run",
      }),
    ];
    const r = diffContract(contract, traces);
    expect(r.findings.find((f) => f.kind === "goal_unreachable")).toBeUndefined();
    const inc = r.findings.find((f) => f.kind === "probe_inconclusive");
    expect(inc).toMatchObject({ intentId: "withhold", severity: "medium" });
    expect(inc!.title).toMatch(/needs review/i);
    expect(inc!.provenance).toMatchObject({ basis: "infrastructure" });
    expect(r.passed).toBe(false);
  });

  it("summarizes mixed evidence without conflation", () => {
    const ev = summarizeIntentEvidence([
      trace("withhold", "candidate", { clicks: 1, passed: true }),
      trace("withhold", "candidate", {
        clicks: 0,
        passed: false,
        stoppedReason: "error",
        error: "reference tag not found: location.decline",
        repeat: 1,
      }),
    ]);
    expect(ev).toMatchObject({
      successes: 1,
      replayBlocked: 1,
      outcomeFailures: 0,
      total: 2,
    });
  });
});

describe("verified defaults still block", () => {
  it("preserves the harmful default flip", () => {
    const traces = [
      trace("share", "baseline", { clicks: 1, precise0: false }),
      trace("withhold", "baseline", { clicks: 1, precise0: false }),
      trace("share", "candidate", { clicks: 1, precise0: true }),
      trace("withhold", "candidate", { clicks: 4, precise0: true }),
    ];
    const r = diffContract(contract, traces);
    expect(r.findings.find((f) => f.kind === "default_flip")).toMatchObject({
      baseline: false,
      candidate: true,
      severity: "high",
    });
  });
});
