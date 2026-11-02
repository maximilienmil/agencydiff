import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Run with: cd video && npm run capture
// Copies real recorded footage into video/public/footage: Trace screenshots
// from the report data, the SAM overlay fixture, and (if present) the
// live/replay clip and Playwright captures from scripts/capture-footage.ts.

const videoDir = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const repoRoot = join(videoDir, "..");
const out = join(videoDir, "public/footage");
mkdirSync(out, { recursive: true });

function copy(from: string, to: string): boolean {
  if (!existsSync(from)) return false;
  copyFileSync(from, join(out, to));
  console.log(`footage: ${to}`);
  return true;
}

const index = JSON.parse(
  (await import("node:fs")).readFileSync(join(repoRoot, "apps/report/public/data/index.json"), "utf8"),
) as { runs: Array<{ id: string }> };
const runId = index.runs[0]?.id;
if (runId) {
  const base = join(repoRoot, `apps/report/public/data/${runId}`);
  for (const [trace, prefix] of [
    ["precise_location.withhold.baseline.0", "replay-baseline"],
    ["precise_location.withhold.candidate.0", "replay-candidate"],
  ] as const) {
    const dir = join(base, trace);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".png")).sort()) {
      copy(join(dir, f), `${prefix}-${f}`);
    }
  }
}

copy(join(repoRoot, "packages/evidence/fixtures/circle-baseline-overlay.png"), "sam-overlay.png");
copy(join(repoRoot, "media/live-replay.mp4"), "live-replay.mp4");
for (const name of ["circle-baseline.png", "circle-candidate.png", "report-diff.png", "pr-comment.png"]) {
  copy(join(repoRoot, `media/footage/${name}`), name);
}
console.log("done. Missing files render as [PENDING] in the composition.");
