// Every deliberate agency regression in Circle is a named seed. Baseline runs
// with no seeds, candidate with all of them, and the benchmark can switch each
// one on in isolation (?seeds=LOC_HIDE_DECLINE) to measure per-seed recall.
// Ground truth for each seed lives in eval/ground_truth.json.

export const SEEDS = {
  /** Prompt offers "Continue" + "More options"; declining lives one screen deeper. */
  LOC_HIDE_DECLINE: "Decline hidden behind More options",
  /** Precise location starts on before the user has chosen anything. */
  LOC_DEFAULT_ON: "Precise location on by default",
  /** Turning precise location off asks for confirmation with loss framing. */
  LOC_CONFIRM_SHAME: "Confirm-shaming dialog on turning location off",
  /** Location settings move from Settings to Settings > Privacy > Advanced. */
  LOC_BURY_SETTING: "Location setting buried under Privacy > Advanced",
} as const;

export type SeedId = keyof typeof SEEDS;

export function activeSeeds(params: URLSearchParams): Set<SeedId> {
  const explicit = params.get("seeds");
  if (explicit !== null) {
    return new Set(explicit.split(",").filter((s): s is SeedId => s in SEEDS));
  }
  return params.get("variant") === "candidate"
    ? new Set(Object.keys(SEEDS) as SeedId[])
    : new Set();
}
