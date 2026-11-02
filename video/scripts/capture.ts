import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Run with: cd video && npm run capture
// Stages the stills the composition uses into video/public/footage: the
// phone-column Trace screenshots where each decision happens (never the
// report viewer chrome, so no driver debug text and no letterboxed phones),
// plus the SAM 3.1 overlay fixture. Anything missing renders as [PENDING].

const videoDir = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const repoRoot = join(videoDir, "..");
const out = join(videoDir, "public/footage");
mkdirSync(out, { recursive: true });

function copy(from: string, to: string): boolean {
  if (!existsSync(from)) {
    console.log(`missing: ${from}`);
    return false;
  }
  copyFileSync(from, join(out, to));
  console.log(`footage: ${to}`);
  return true;
}

// [report decision dir, trace dir, shot] -> staged as
// footage/<decision>-<intent>-<variant>-<repeat>-<shot>.png
const staged: Array<[string, string, string]> = [
  ["teen_dm", "teen_dm.block_unknown.baseline.0", "000"],
  ["teen_dm", "teen_dm.block_unknown.baseline.0", "017"],
  ["teen_dm", "teen_dm.block_unknown.candidate.0", "000"],
  ["teen_dm", "teen_dm.block_unknown.candidate.0", "020"],
  ["precise_location", "precise_location.withhold.baseline.0", "000"],
  ["precise_location", "precise_location.withhold.candidate.0", "000"],
  ["precise_location", "precise_location.withhold.candidate.0", "007"],
];

for (const [decision, trace, shot] of staged) {
  const stem = trace.replace(`${decision}.`, "").replaceAll(".", "-");
  copy(
    join(repoRoot, "apps/report/public/data", decision, trace, `${shot}.png`),
    `${decision}-${stem}-${shot}.png`,
  );
}

copy(
  join(repoRoot, "apps/report/public/data/teen_dm/teen_dm.block_unknown.baseline.0/sam-017.png"),
  "sam-teen.png",
);
copy(join(repoRoot, "packages/evidence/fixtures/circle-baseline-overlay.png"), "sam-overlay.png");

// Decision-sheet crop of the SAM overlay (the decline/allow buttons with
// their red/green masks), so the film can show it legibly at card size.
try {
  execFileSync("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-i",
    join(repoRoot, "packages/evidence/fixtures/circle-baseline-overlay.png"),
    "-vf",
    "crop=430:360:0:500",
    join(out, "sam-sheet.png"),
  ]);
  console.log("footage: sam-sheet.png");
} catch {
  console.log("missing: sam-sheet.png (ffmpeg not on PATH)");
}
console.log("done. Missing files render as [PENDING] in the composition.");
