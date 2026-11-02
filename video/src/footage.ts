import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Footage } from "./types.js";

// Resolves which footage files actually exist under video/public/footage.
// Staged stills only: full-phone Trace screenshots (already the phone
// column, shown large, never letterboxed) and the SAM 3.1 overlay fixture.
// Missing clips stay null and the composition renders a [PENDING] card.
// The report viewer's live/replay clip is deliberately not used: its footer
// carries driver debug text ("safety checks acknowledged…") and its phones
// are tiny inside a wide panel.

export function loadFootage(publicDir: string): Footage {
  const dir = join(publicDir, "footage");
  const one = (name: string) => (existsSync(join(dir, name)) ? `footage/${name}` : null);
  const trace = (decision: string, trace: string, shot: string) =>
    existsSync(join(dir, `${decision}-${trace}-${shot}.png`))
      ? `footage/${decision}-${trace}-${shot}.png`
      : null;
  const vo = (name: string) =>
    existsSync(join(publicDir, "vo", `${name}.wav`)) ? `vo/${name}.wav` : null;
  return {
    coldBaselineStart: trace("teen_dm", "block_unknown-baseline-0", "000"),
    coldBaselineDecided: trace("teen_dm", "block_unknown-baseline-0", "017"),
    coldCandidateStart: trace("teen_dm", "block_unknown-candidate-0", "000"),
    coldCandidateLost: trace("teen_dm", "block_unknown-candidate-0", "020"),
    withBaseline: trace("precise_location", "withhold-baseline-0", "000"),
    withCandidate: trace("precise_location", "withhold-candidate-0", "000"),
    withCandidateDeep: trace("precise_location", "withhold-candidate-0", "007"),
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
