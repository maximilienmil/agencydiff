import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadVideoData } from "./data.js";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "../..");

test("headlines come from the eval evidence files", () => {
  const d = loadVideoData(repoRoot);
  assert.equal(d.agentNoGate, "8/30");
  assert.equal(d.agentGated, "0/30");
  assert.equal(d.gateCaught, "19/20");
  assert.equal(d.gateFalseAlarms, "0/6");
  assert.equal(d.gateCost, "$0");
  assert.equal(d.screensCaught, "1/20");
  assert.equal(d.susDetected, "7/10");
  assert.equal(d.auditRealId, "REAL ID documents: 3/5 → 5/5 · 21 → 1 actions to fact");
});

test("the experiment beat uses the real prompt, diffs and findings", () => {
  const d = loadVideoData(repoRoot);
  assert.ok(d.onboardPrompt?.startsWith("Simplify onboarding:"));
  assert.ok(d.regressingDiff.length > 0);
  assert.ok(d.fixedDiff.length > 0);
  assert.equal(d.gateClaimB, "PASS");
  assert.ok(d.withholdFinding?.includes("no longer on first screen"));
  assert.equal(d.declineBaseline, "1");
  assert.equal(d.declineCandidate, "7");
  assert.equal(d.declineVisibility, "hidden");
});

test("missing files degrade to null, never to invented numbers", () => {
  const d = loadVideoData("/nonexistent-repo-root");
  assert.equal(d.agentNoGate, null);
  assert.equal(d.gateCaught, null);
  assert.deepEqual(d.regressingDiff, []);
});
