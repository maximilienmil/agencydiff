import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyHunks,
  extractDiff,
  extractJsonPatch,
  loadReports,
  parseFilePatches,
  parsePatchFiles,
  patchToReviewComments,
  validatePatch,
} from "../src/proposeFix.js";

const DECLINE_PATCH = `diff --git a/apps/circle/src/App.tsx b/apps/circle/src/App.tsx
--- a/apps/circle/src/App.tsx
+++ b/apps/circle/src/App.tsx
@@ -1,13 +1,7 @@ export function App() {
                   <button className="primary" data-agency="sub.subscribe" onClick={subscribe}>
                     {copyTweak ? "Get Circle+" : "Subscribe"}
                   </button>
-                  {!has("SUB_HIDE_DECLINE") ? (
-                    <button className="link" data-agency="sub.decline" onClick={declineOffer}>
-                      {copyTweak ? "Maybe later" : "Not now"}
-                    </button>
-                  ) : (
-                    <button className="link" data-agency="sub.more" onClick={() => push("decline_options")}>
-                      More options
-                    </button>
-                  )}
+                  <button className="link" data-agency="sub.decline" onClick={declineOffer}>
+                    {copyTweak ? "Maybe later" : "Not now"}
+                  </button>
                 </div>
`;

const ORIGINAL = [
  "                  <button className=\"primary\" data-agency=\"sub.subscribe\" onClick={subscribe}>",
  "                    {copyTweak ? \"Get Circle+\" : \"Subscribe\"}",
  "                  </button>",
  "                  {!has(\"SUB_HIDE_DECLINE\") ? (",
  "                    <button className=\"link\" data-agency=\"sub.decline\" onClick={declineOffer}>",
  "                      {copyTweak ? \"Maybe later\" : \"Not now\"}",
  "                    </button>",
  "                  ) : (",
  "                    <button className=\"link\" data-agency=\"sub.more\" onClick={() => push(\"decline_options\")}>",
  "                      More options",
  "                    </button>",
  "                  )}",
  "                </div>",
].join("\n");

describe("extractDiff", () => {
  it("pulls a fenced diff out of prose", () => {
    const reply = `Here is the fix:\n\n\`\`\`diff\n${DECLINE_PATCH}\`\`\`\n\nThat restores decline.`;
    expect(extractDiff(reply)).toBe(DECLINE_PATCH);
  });

  it("accepts a bare diff", () => {
    expect(extractDiff(`Some prose\n${DECLINE_PATCH}`)).toBe(DECLINE_PATCH);
  });

  it("throws when there is no diff", () => {
    expect(() => extractDiff("looks fine to me, no changes needed")).toThrow(/no unified diff/);
  });
});

describe("extractJsonPatch", () => {
  it("parses fenced JSON with patch and rationale", () => {
    const reply = '```json\n{"patch": "diff --git here", "rationale": "restore decline"}\n```';
    expect(extractJsonPatch(reply)).toEqual({ patch: "diff --git here", rationale: "restore decline" });
  });

  it("falls back to a raw diff reply with an empty rationale", () => {
    expect(extractJsonPatch(DECLINE_PATCH)).toEqual({ patch: DECLINE_PATCH, rationale: "" });
  });

  it("throws when JSON has no patch and there is no diff", () => {
    expect(() => extractJsonPatch('{"rationale": "nothing to do"}')).toThrow();
  });
});

describe("parsePatchFiles", () => {
  it("lists every touched file", () => {
    const patch = `${DECLINE_PATCH}diff --git a/apps/circle/src/seeds.ts b/apps/circle/src/seeds.ts\n--- a/apps/circle/src/seeds.ts\n+++ b/apps/circle/src/seeds.ts\n@@ -1,1 +1,1 @@\n-x\n+y\n`;
    expect(parsePatchFiles(patch)).toEqual(["apps/circle/src/App.tsx", "apps/circle/src/seeds.ts"]);
  });
});

describe("validatePatch", () => {
  it("accepts a Circle patch", () => {
    expect(validatePatch(DECLINE_PATCH)).toEqual(["apps/circle/src/App.tsx"]);
  });

  it("rejects files outside the Circle app", () => {
    const patch = DECLINE_PATCH.replaceAll("apps/circle/src/App.tsx", "contracts/subscription.json");
    expect(() => validatePatch(patch)).toThrow(/escapes the Circle app/);
  });

  it("rejects hunk-less input", () => {
    expect(() => validatePatch("diff --git a/apps/circle/src/App.tsx b/apps/circle/src/App.tsx\n")).toThrow();
  });
});

describe("applyHunks", () => {
  it("restores the direct decline control", () => {
    const [{ hunks }] = parseFilePatches(DECLINE_PATCH);
    const next = applyHunks(ORIGINAL, hunks);
    expect(next).toContain('data-agency="sub.decline"');
    expect(next).not.toContain('data-agency="sub.more"');
    expect(next).not.toContain("SUB_HIDE_DECLINE");
  });

  it("rejects a patch whose context does not match", () => {
    const [{ hunks }] = parseFilePatches(DECLINE_PATCH);
    expect(() => applyHunks("something else entirely\n", hunks)).toThrow(/mismatch/);
  });
});

describe("loadReports", () => {
  it("ignores verification re-probes under verify-*/", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "propose-fix-test-"));
    const report = { decision: "subscription", promise: "p", aggregates: [], asymmetry: [], findings: [], passed: false };
    await mkdir(path.join(root, "subscription"), { recursive: true });
    await writeFile(path.join(root, "subscription", "report.json"), JSON.stringify(report));
    await mkdir(path.join(root, "verify-muse", "subscription"), { recursive: true });
    await writeFile(path.join(root, "verify-muse", "subscription", "report.json"), JSON.stringify(report));
    const loaded = await loadReports(root);
    expect(loaded.map((r) => r.dir)).toEqual([path.join(root, "subscription")]);
  });
});

describe("patchToReviewComments", () => {
  it("anchors a multi-line hunk to its old range and replays the new lines", () => {
    const [comment] = patchToReviewComments(DECLINE_PATCH);
    expect(comment.path).toBe("apps/circle/src/App.tsx");
    expect(comment.start_line).toBe(1);
    expect(comment.line).toBe(1 + 13 - 1);
    expect(comment.side).toBe("RIGHT");
    expect(comment.body).toContain("```suggestion");
    expect(comment.body).toContain('data-agency="sub.decline"');
    expect(comment.body).not.toContain('data-agency="sub.more"');
    const suggestion = comment.body.replace(/```suggestion\n?|\n?```/g, "");
    const applied = applyHunks(ORIGINAL, parseFilePatches(DECLINE_PATCH)[0].hunks);
    expect(applied).toContain(suggestion.split("\n")[0]);
  });
});
