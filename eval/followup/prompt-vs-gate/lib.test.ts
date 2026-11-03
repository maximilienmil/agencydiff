import { describe, expect, it } from "vitest";
import {
  PVG_AGENT_MODEL,
  PVG_GATE_WRAPPER,
  PVG_HARD_CAP_USD,
  PVG_MUSE_CONFIRM_CAP_USD,
  PVG_PROTECTIVE_BLOCK,
  buildPvgPrompt,
  countGateRuns,
  diffGroupKey,
  withinBudget,
} from "./lib.js";

const TASK = "Do the thing on the feed screen.";
const OPTS = { devPort: 5261, tag: "c-feed-0" };

describe("buildPvgPrompt arms", () => {
  it("arm A has no protective block and ends with GATE: NOT-RUN", () => {
    const p = buildPvgPrompt(TASK, "a", OPTS);
    expect(p).toContain(TASK);
    expect(p).not.toContain(PVG_PROTECTIVE_BLOCK);
    expect(p).toContain("GATE: NOT-RUN");
    expect(p).not.toContain(PVG_GATE_WRAPPER);
  });

  it("arms B and C share the protective block verbatim", () => {
    const b = buildPvgPrompt(TASK, "b", OPTS);
    const c = buildPvgPrompt(TASK, "c", OPTS);
    expect(b).toContain(PVG_PROTECTIVE_BLOCK);
    expect(c).toContain(PVG_PROTECTIVE_BLOCK);
    // Same commitments, only executable gate feedback differs.
    expect(c.length).toBeGreaterThan(b.length);
    expect(b).toContain("GATE: NOT-RUN");
    expect(c).toContain("GATE: <PASS or FAIL, see below>");
  });

  it("only arm C gets executable gate feedback", () => {
    const a = buildPvgPrompt(TASK, "a", OPTS);
    const b = buildPvgPrompt(TASK, "b", OPTS);
    const c = buildPvgPrompt(TASK, "c", OPTS);
    expect(a).not.toContain(PVG_GATE_WRAPPER);
    expect(b).not.toContain(PVG_GATE_WRAPPER);
    expect(c).toContain(PVG_GATE_WRAPPER);
    expect(c).toContain(`--port ${OPTS.devPort}`);
    expect(c).toContain("up to 3 tries");
  });

  it("protective block covers refusal, cancellation, defaults, and teen contact", () => {
    for (const needle of ["decline", "cancel", "location", "friends-only", "teen", "defaults"]) {
      expect(PVG_PROTECTIVE_BLOCK.toLowerCase()).toContain(needle);
    }
  });

  it("all arms confine edits to apps/circle/src", () => {
    for (const arm of ["a", "b", "c"] as const) {
      expect(buildPvgPrompt(TASK, arm, OPTS)).toContain("ONLY create or edit files under apps/circle/src");
    }
  });
});

describe("experiment constants", () => {
  it("pins the authorized model and the $5 cap", () => {
    expect(PVG_AGENT_MODEL).toBe("muse-spark-1.3-contributor");
    expect(PVG_HARD_CAP_USD).toBe(5);
    expect(PVG_MUSE_CONFIRM_CAP_USD).toBeLessThanOrEqual(2);
  });
});

describe("countGateRuns", () => {
  it("returns 0 for empty or gate-free logs", () => {
    expect(countGateRuns("")).toBe(0);
    expect(countGateRuns("FINAL: did it | GATE: NOT-RUN")).toBe(0);
  });

  it("does not count the prompt echo of the wrapper command", () => {
    const log = `prompt text… 2. Run: ${PVG_GATE_WRAPPER} http://127.0.0.1:5261/ …more prompt`;
    expect(countGateRuns(log)).toBe(0);
  });

  it("counts each real invocation including retries", () => {
    const log = [
      `2. Run: ${PVG_GATE_WRAPPER} http://127.0.0.1:5261/`,
      `"command": "${PVG_GATE_WRAPPER} http://127.0.0.1:5261/"`,
      `"command": "${PVG_GATE_WRAPPER} http://127.0.0.1:5261/"`,
    ].join("\n");
    expect(countGateRuns(log)).toBe(2);
  });
});

describe("diffGroupKey", () => {
  it("is stable and distinguishes different diffs", () => {
    expect(diffGroupKey("abc")).toBe(diffGroupKey("abc"));
    expect(diffGroupKey("abc")).not.toBe(diffGroupKey("abd"));
    expect(diffGroupKey("")).not.toBe(diffGroupKey("abc"));
  });
});

describe("withinBudget", () => {
  it("blocks calls that would exceed the cap", () => {
    expect(withinBudget(4.9, 0.05)).toBe(true);
    expect(withinBudget(4.9, 0.2)).toBe(false);
    expect(withinBudget(5, 0)).toBe(true);
  });
});
