import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Clip, ClipFrame } from "../src/types.js";

// Run with: pnpm --filter video capture
// Stages whole recorded Traces into video/public/footage so the film can play
// them back step by step: every screenshot, the tap the Probe made on it, and
// the Oracle verdict, from apps/report/public/data/<decision>/<trace>/.
// Writes footage/clips.json. Nothing is re-recorded or retouched; the only
// change is a crop of Circle's "fictional test app" banner where a frame has
// one (detected per frame, so taps are shifted by the same amount).

const videoDir = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const repoRoot = join(videoDir, "..");
const out = join(videoDir, "public/footage");
mkdirSync(out, { recursive: true });

const W = 430;
const H = 860;

interface TraceJson {
  id: string;
  initial: { observation: { screenshot: string; screen?: string } };
  steps: { actions: { type: string; x?: number; y?: number }[]; after: { screenshot: string; screen?: string } }[];
  oracle: { passed: boolean };
}

/** Height of the banner at the top of a 430x860 shot, 0 when absent. The
 *  banner is a flat band (yellow on older builds, navy on newer) ending in a
 *  1px rule; read the left pixel column and find where that band stops. */
function bannerHeight(png: string): number {
  let raw: Buffer;
  try {
    raw = execFileSync("ffmpeg", ["-v", "error", "-i", png, "-vf", "crop=1:120:4:0", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]);
  } catch {
    return 0;
  }
  const px = (y: number) => [raw[y * 3], raw[y * 3 + 1], raw[y * 3 + 2]];
  const [r, g, b] = px(0);
  // Warm-tinted, also when a dialog scrim dims it; the app header is neutral.
  const yellow = r - b >= 15 && g - b >= 10 && r >= g;
  const navy = r < 40 && g < 55 && b < 65;
  if (!yellow && !navy) return 0;
  const same = (y: number) => {
    const [r2, g2, b2] = px(y);
    return Math.abs(r2 - r) + Math.abs(g2 - g) + Math.abs(b2 - b) < 12;
  };
  let y = 0;
  while (y < 119 && same(y + 1)) y++;
  // y is the last banner row; skip the hairline beneath it.
  return Math.min(y + 2, 100);
}

function stage(decision: string, traceDir: string, name: string): Clip | null {
  const src = join(repoRoot, "apps/report/public/data", decision, traceDir);
  const tracePath = join(src, "trace.json");
  if (!existsSync(tracePath)) {
    console.log(`missing: ${tracePath}`);
    return null;
  }
  const t = JSON.parse(readFileSync(tracePath, "utf8")) as TraceJson;
  const shots = [t.initial.observation.screenshot, ...t.steps.map((s) => s.after.screenshot)];
  const screens = [t.initial.observation.screen, ...t.steps.map((s) => s.after.screen)];
  const frames: ClipFrame[] = shots.map((shot, i) => {
    const file = `${name}-${shot}`;
    copyFileSync(join(src, shot), join(out, file));
    const crop = bannerHeight(join(src, shot));
    // The tap made ON this screen is the next step's first pointer action.
    const next = t.steps[i]?.actions.find((a) => typeof a.x === "number" && typeof a.y === "number");
    return {
      file: `footage/${file}`,
      crop,
      screen: screens[i] ?? null,
      tap: next ? { x: next.x! / W, y: (next.y! - crop) / (H - crop) } : null,
    };
  });
  const maxCrop = Math.max(...frames.map((f) => f.crop));
  console.log(`clip ${name}: ${t.id}, ${t.steps.length} steps, oracle ${t.oracle.passed ? "passed" : "failed"}, banner crop ${maxCrop}px`);
  return { traceId: t.id, steps: t.steps.length, oraclePassed: t.oracle.passed, window: H - maxCrop, frames };
}

// Cold open: the passing baseline Trace (it ends on Messages with "Block
// unknown people" selected) against a failed candidate Trace that spends its
// 20 steps in Settings and Privacy without reaching the block option.
const clips = {
  coldBaseline: stage("teen_dm", "teen_dm.block_unknown.baseline.1", "cold-b"),
  coldCandidate: stage("teen_dm", "teen_dm.block_unknown.candidate.2", "cold-c"),
  withBaseline: stage("precise_location", "precise_location.withhold.baseline.0", "with-b"),
  withCandidate: stage("precise_location", "precise_location.withhold.candidate.0", "with-c"),
};
writeFileSync(join(out, "clips.json"), JSON.stringify(clips, null, 1));

const copy = (from: string, to: string) => {
  if (!existsSync(from)) return console.log(`missing: ${from}`);
  copyFileSync(from, join(out, to));
  console.log(`footage: ${to}`);
};
copy(join(repoRoot, "packages/evidence/fixtures/circle-baseline-overlay.png"), "sam-overlay.png");

// Decision-sheet crop of the SAM overlay (the decline/allow buttons with
// their red/green masks), so the film can show it legibly at card size.
try {
  execFileSync("ffmpeg", [
    "-y", "-v", "error",
    "-i", join(repoRoot, "packages/evidence/fixtures/circle-baseline-overlay.png"),
    "-vf", "crop=430:360:0:500",
    join(out, "sam-sheet.png"),
  ]);
  console.log("footage: sam-sheet.png");
} catch {
  console.log("missing: sam-sheet.png (ffmpeg not on PATH)");
}
console.log("done. Missing files render as [PENDING] in the composition.");
