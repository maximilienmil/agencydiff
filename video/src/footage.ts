import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Clips, Footage } from "./types.js";
import { EMPTY_CLIPS } from "./types.js";

// Resolves which staged footage exists under video/public/footage (written by
// scripts/capture.ts): whole recorded Traces for playback, plus the SAM 3.1
// overlay fixture. Missing clips stay null and render as a [PENDING] card.
// The report viewer is deliberately not screen-recorded: the film plays the
// recorded Trace screenshots directly, full phone-column, with the taps the
// Probe made drawn over them.

export function loadFootage(publicDir: string): Footage {
  const dir = join(publicDir, "footage");
  const one = (name: string) => (existsSync(join(dir, name)) ? `footage/${name}` : null);
  const vo = (name: string) =>
    existsSync(join(publicDir, "vo", `${name}.wav`)) ? `vo/${name}.wav` : null;
  let clips: Clips = EMPTY_CLIPS;
  const manifest = join(dir, "clips.json");
  if (existsSync(manifest)) {
    try {
      const raw = JSON.parse(readFileSync(manifest, "utf8")) as Clips;
      const ok = (c: Clips[keyof Clips]) =>
        c && c.frames.every((f) => existsSync(join(publicDir, f.file))) ? c : null;
      clips = {
        coldBaseline: ok(raw.coldBaseline),
        coldCandidate: ok(raw.coldCandidate),
        withBaseline: ok(raw.withBaseline),
        withCandidate: ok(raw.withCandidate),
      };
    } catch {
      clips = EMPTY_CLIPS;
    }
  }
  return {
    clips,
    samOverlay: one("sam-overlay.png"),
    samTeen: one("sam-teen.png"),
    samSheet: one("sam-sheet.png"),
    voCold: vo("cold"),
    voProblem: vo("problem"),
    voExperiment: vo("experiment"),
    voHow: vo("how"),
    voGeneralize: vo("generalize"),
    voBuilt: vo("built"),
    voClose: vo("close"),
  };
}
