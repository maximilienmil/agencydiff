import { describe, expect, it } from "vitest";
import { diffContract } from "../src/diff.js";
import type { AgencyContract, Action, Trace, Variant } from "../src/types.js";

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

const click: Action = { type: "click", x: 1, y: 1 };

function trace(
  intentId: string,
  variant: Variant,
  clicks: number,
  opts: {
    visibleAt0?: string;
    precise0?: boolean;
    passed?: boolean;
    driver?: "scripted" | "muse";
    repeat?: number;
  } = {},
): Trace {
  const obs = (screen: string, tags: string[] = []) => ({
    url: "http://circle",
    screen,
    screenshot: "x.png",
    tags: tags.map((tag) => ({ tag, box: [0, 0, 1, 1] as [number, number, number, number], inViewport: true })),
  });
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
      observation: obs("prompt", opts.visibleAt0 ? [opts.visibleAt0] : []),
    },
    steps: Array.from({ length: clicks }, (_, i) => ({
      index: i,
      tMs: i * 100,
      actions: [click],
      after: obs(i === clicks - 1 ? "home" : `menu-${i}`),
    })),
    final: {},
    oracle: { checked: true, passed: opts.passed ?? true },
    stoppedReason: "agent_done",
  };
}

function repeats(
  intentId: string,
  variant: Variant,
  clicks: number[],
  opts: { driver?: "scripted" | "muse"; passed?: boolean[] } = {},
): Trace[] {
  return clicks.map((c, i) =>
    trace(intentId, variant, c, {
      visibleAt0: "location.decline",
      driver: opts.driver,
      repeat: i,
      passed: opts.passed?.[i] ?? true,
    }),
  );
}

describe("diffContract", () => {
  it("passes when nothing changed", () => {
    const traces = [
      trace("share", "baseline", 1, { visibleAt0: "location.allow" }),
      trace("withhold", "baseline", 1, { visibleAt0: "location.decline" }),
      trace("share", "candidate", 1, { visibleAt0: "location.allow" }),
      trace("withhold", "candidate", 1, { visibleAt0: "location.decline" }),
    ];
    const r = diffContract(contract, traces);
    expect(r.findings).toEqual([]);
    expect(r.passed).toBe(true);
  });

  it("flags the hero regression: hidden decline, 1→4 actions, default flip, asymmetry", () => {
    const traces = [
      trace("share", "baseline", 1, { visibleAt0: "location.allow" }),
      trace("withhold", "baseline", 1, { visibleAt0: "location.decline" }),
      trace("share", "candidate", 1, { visibleAt0: "location.allow", precise0: true }),
      trace("withhold", "candidate", 4, { precise0: true }),
    ];
    const r = diffContract(contract, traces);
    const kinds = Object.fromEntries(r.findings.map((f) => [f.kind, f]));

    expect(kinds.action_cost).toMatchObject({ intentId: "withhold", baseline: 1, candidate: 4, severity: "high" });
    expect(kinds.visibility).toMatchObject({ intentId: "withhold", severity: "high" });
    expect(kinds.default_flip).toMatchObject({ baseline: false, candidate: true, severity: "high" });
    expect(kinds.asymmetry).toMatchObject({ baseline: 1, candidate: 4 });
    expect(kinds.navigation_depth).toMatchObject({ baseline: 1, candidate: 4 });
    expect(r.passed).toBe(false);
  });

  it("uses the oracle, not the agent's claim, for success", () => {
    const traces = [
      trace("withhold", "baseline", 1),
      trace("withhold", "candidate", 1, { passed: false }),
    ];
    const r = diffContract(contract, traces);
    expect(r.findings.find((f) => f.kind === "goal_unreachable")).toMatchObject({
      baseline: 1,
      candidate: 0,
      severity: "high",
    });
  });

  it("ignores overlapping muse repeats: a higher median alone is noise", () => {
    const traces = [
      ...repeats("withhold", "baseline", [1, 5, 5], { driver: "muse" }),
      ...repeats("withhold", "candidate", [2, 6, 6], { driver: "muse" }),
    ];
    const r = diffContract(contract, traces);
    expect(r.findings.find((f) => f.kind === "action_cost")).toBeUndefined();
    expect(r.findings.find((f) => f.kind === "navigation_depth")).toBeUndefined();
  });

  it("flags separated muse repeats: every candidate run cost more", () => {
    const traces = [
      ...repeats("withhold", "baseline", [1, 2, 3], { driver: "muse" }),
      ...repeats("withhold", "candidate", [4, 5, 6], { driver: "muse" }),
    ];
    const r = diffContract(contract, traces);
    expect(r.findings.find((f) => f.kind === "action_cost")).toMatchObject({
      intentId: "withhold",
      baseline: 2,
      candidate: 5,
    });
  });

  it("needs a 2/3 success-rate gap across muse repeats", () => {
    const close = diffContract(contract, [
      ...repeats("withhold", "baseline", [1, 1, 1], { driver: "muse" }),
      ...repeats("withhold", "candidate", [1, 1, 1], { driver: "muse", passed: [true, true, false] }),
    ]);
    expect(close.findings.find((f) => f.kind === "goal_unreachable")).toBeUndefined();
    const wide = diffContract(contract, [
      ...repeats("withhold", "baseline", [1, 1, 1], { driver: "muse" }),
      ...repeats("withhold", "candidate", [1, 1, 1], { driver: "muse", passed: [true, false, false] }),
    ]);
    expect(wide.findings.find((f) => f.kind === "goal_unreachable")).toMatchObject({
      baseline: 1,
      candidate: 1 / 3,
    });
  });

  it("keeps the old rule for scripted repeats and single muse runs", () => {
    const scripted = diffContract(contract, [
      ...repeats("withhold", "baseline", [1, 5, 5]),
      ...repeats("withhold", "candidate", [2, 6, 6]),
    ]);
    expect(scripted.findings.find((f) => f.kind === "action_cost")).toBeDefined();
    const single = diffContract(contract, [
      trace("withhold", "baseline", 1, { visibleAt0: "location.decline", driver: "muse" }),
      trace("withhold", "candidate", 2, { visibleAt0: "location.decline", driver: "muse" }),
    ]);
    expect(single.findings.find((f) => f.kind === "action_cost")).toBeDefined();
  });
});
