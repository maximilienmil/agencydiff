import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadVideoData } from "./data.js";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "../..");

test("loads benchmark numbers from eval evidence files", () => {
  const d = loadVideoData(repoRoot);
  assert.equal(d.scriptedCaught, "20/20");
  assert.equal(d.judgeCaught, "18/20");
  assert.equal(d.susDetected, "7/10 injected patterns");
});

test("loads the decline Finding from the report data", () => {
  const d = loadVideoData(repoRoot);
  assert.equal(d.declineBaseline, "1");
  assert.equal(d.declineCandidate, "4");
  assert.equal(d.declineVisibility, "hidden");
  assert.ok(d.findings.length > 0);
});

test("missing files degrade to null, never to invented numbers", () => {
  const d = loadVideoData("/nonexistent-repo-root");
  assert.equal(d.scriptedCaught, null);
  assert.deepEqual(d.findings, []);
});
