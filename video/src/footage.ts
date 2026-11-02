import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Footage } from "./types.js";

// Resolves which footage files actually exist under video/public/footage.
// Missing clips stay null and the composition renders a [PENDING] card.

function list(dir: string, prefix: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".png"))
    .sort()
    .map((f) => `footage/${f}`);
}

export function loadFootage(publicDir: string): Footage {
  const dir = join(publicDir, "footage");
  const one = (name: string) => (existsSync(join(dir, name)) ? `footage/${name}` : null);
  return {
    circleBaseline: one("circle-baseline.png"),
    circleCandidate: one("circle-candidate.png"),
    reportDiff: one("report-diff.png"),
    prComment: one("pr-comment.png"),
    replayBaseline: list(dir, "replay-baseline-"),
    replayCandidate: list(dir, "replay-candidate-"),
    samOverlay: one("sam-overlay.png"),
    liveReplay: existsSync(join(dir, "live-replay.mp4")) ? "footage/live-replay.mp4" : null,
  };
}
