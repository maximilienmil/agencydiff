import { describe, expect, it } from "vitest";
import { countActions } from "@agencydiff/core";
import { assertBundleClean, bundleImageOrder, renderBundleText, renderStoppedLines, type CaseBundle } from "./bundle.js";
import { CASES } from "./cases.js";
import { majorityVerdict, parseReviewReply } from "./reviewer.js";

function fixtureBundle(): CaseBundle {
  return {
    caseId: "CASE-99",
    decision: "subscription",
    promise: "Cancel whenever you want.",
    intents: [
      {
        intent: "subscription.cancel",
        goal: "Cancel my subscription.",
        baseline: {
          actions: ["nav.settings", "settings.subscription", "sub.cancel"],
          actionCount: 3,
          screens: ["feed", "settings", "subscription"],
          finalScreen: "subscription",
          oraclePassed: true,
          finalState: { "sub.active": false },
          initialShot: "traces/a/000.png",
          finalShot: "traces/a/003.png",
        },
        candidate: {
          actions: ["nav.settings", "settings.subscription", "sub.manage", "sub.cancel", "sub.confirm_cancel"],
          actionCount: 5,
          screens: ["feed", "settings", "subscription", "manage", "subscription"],
          finalScreen: "subscription",
          oraclePassed: true,
          finalState: { "sub.active": false },
          initialShot: "traces/b/000.png",
          finalShot: "traces/b/005.png",
        },
      },
    ],
  };
}

describe("renderBundleText", () => {
  it("states both variants' actions, counts, screens and oracle outcomes", () => {
    const text = renderBundleText(fixtureBundle());
    expect(text).toContain("subscription.cancel");
    expect(text).toContain("BASELINE: nav.settings -> settings.subscription -> sub.cancel");
    expect(text).toContain("CANDIDATE taps: 5");
    expect(text).toContain("final-state oracle: PASS");
    expect(text).toContain("starting state:");
  });
});

describe("defaultKey rendering", () => {
  it("names the default key and its meaning when present", () => {
    const b = { ...fixtureBundle(), defaultKey: "location.precise" };
    expect(renderBundleText(b)).toContain('Default key for this decision: "location.precise"');
    expect(renderBundleText(fixtureBundle())).not.toContain("Default key");
  });
});

describe("bundleImageOrder", () => {
  it("emits baseline initial/final then candidate initial/final per intent", () => {
    const order = bundleImageOrder("/cases/CASE-99", fixtureBundle());
    expect(order.map((o) => o.label)).toEqual([
      "BASELINE first screen",
      "BASELINE final screen",
      "CANDIDATE first screen",
      "CANDIDATE final screen",
    ]);
    expect(order[0].file).toContain("CASE-99");
    expect(order[0].file).toContain("traces");
  });
});

describe("renderStoppedLines", () => {
  it("names completion state and seed-free error text per side", () => {
    const lines = renderStoppedLines(fixtureBundle(), {
      "subscription.cancel.baseline": { stoppedReason: "script_done" },
      "subscription.cancel.candidate": { stoppedReason: "error", error: "reference tag not found: sub.cancel" },
    });
    expect(lines).toContain("BASELINE stopped: script_done");
    expect(lines).toContain("CANDIDATE stopped: error (reference tag not found: sub.cancel)");
  });
});

describe("assertBundleClean", () => {
  it("rejects seed names in reviewer-facing text", () => {
    expect(() => assertBundleClean(CASES[3], "candidate ?seeds=SUB_BURY_CANCEL")).toThrow(/SUB_BURY_CANCEL/);
  });
  it("rejects ground-truth pointers", () => {
    expect(() => assertBundleClean(CASES[3], "see eval/ground_truth.json")).toThrow(/ground_truth/);
  });
  it("accepts the rendered fixture bundle plus goals", () => {
    const b = fixtureBundle();
    expect(() => assertBundleClean(CASES[3], renderBundleText(b) + b.intents[0].goal)).not.toThrow();
  });
});

describe("parseReviewReply", () => {
  const intents = ["subscription.cancel", "subscription.resume"];
  it("parses a strict verdict map with citations", () => {
    const r = parseReviewReply(
      `{"verdicts": {"subscription.cancel": "harder", "subscription.resume": "unchanged"}, "citations": {"subscription.cancel": "actions: +2 taps", "subscription.resume": "screens: same"}, "notes": "ok"}`,
      intents,
    );
    expect(r.verdicts["subscription.cancel"]).toBe("harder");
    expect(r.notes).toBe("ok");
  });
  it("accepts bare intent keys and uncertain", () => {
    const r = parseReviewReply(
      `{"verdicts": {"cancel": "uncertain", "resume": "easier"}, "citations": {"cancel": "oracle: unclear", "resume": "screens: fewer"}}`,
      intents,
    );
    expect(r.verdicts["subscription.cancel"]).toBe("uncertain");
  });
  it("rejects unknown verdict values", () => {
    expect(() =>
      parseReviewReply(
        `{"verdicts": {"cancel": "worse", "resume": "unchanged"}, "citations": {"cancel": "x", "resume": "y"}}`,
        intents,
      ),
    ).toThrow(/Bad verdict/);
  });
  it("rejects missing intents and missing citations", () => {
    expect(() =>
      parseReviewReply(`{"verdicts": {"cancel": "harder"}, "citations": {"cancel": "x"}}`, intents),
    ).toThrow();
    expect(() =>
      parseReviewReply(
        `{"verdicts": {"cancel": "harder", "resume": "unchanged"}, "citations": {"cancel": "x"}}`,
        intents,
      ),
    ).toThrow(/citation/);
  });
});

describe("majorityVerdict", () => {
  it("takes the majority and collapses ties to uncertain", () => {
    expect(majorityVerdict(["harder", "harder", "unchanged"])).toBe("harder");
    expect(majorityVerdict(["harder", "unchanged", "uncertain"])).toBe("uncertain");
    expect(majorityVerdict(["uncertain", "uncertain", "easier"])).toBe("uncertain");
  });
});

describe("countActions sanity", () => {
  it("counts click actions in a trace", () => {
    expect(
      countActions({ steps: [{ actions: [{ type: "click" }, { type: "click" }] }, { actions: [{ type: "input" }] }] } as never),
    ).toBe(2);
  });
});
