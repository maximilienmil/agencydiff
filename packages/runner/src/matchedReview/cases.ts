/** Frozen case set for the matched-review pilot. See eval/followup/matched-review/PROTOCOL.md.
 *
 *  Case IDs were assigned by shuffling the seed list with random.Random(20261103);
 *  the mapping below is frozen. The model reviewer sees only the case ID, never
 *  the seed name or ground truth.
 */
export interface MatchedCase {
  caseId: string;
  /** Hidden from the reviewer; used for evidence generation and scoring only. */
  seed: string;
  contractFile: string;
  decision: string;
  /** Qualified "decision.intent" ids expected to read changed-for-worse. Empty = control. */
  expected: string[];
  isControl: boolean;
}

export const CASES: MatchedCase[] = [
  { caseId: "CASE-01", seed: "ST_MIN_LIMIT_2H", contractFile: "screen_time.json", decision: "screen_time", expected: ["screen_time.set_limit"], isControl: false },
  { caseId: "CASE-02", seed: "LOC_HIDE_DECLINE", contractFile: "location.json", decision: "precise_location", expected: ["precise_location.withhold"], isControl: false },
  { caseId: "CASE-03", seed: "DM_HIDE_BLOCK", contractFile: "teen_dm.json", decision: "teen_dm", expected: ["teen_dm.block_unknown"], isControl: false },
  { caseId: "CASE-04", seed: "SUB_BURY_CANCEL", contractFile: "subscription.json", decision: "subscription", expected: ["subscription.cancel"], isControl: false },
  { caseId: "CASE-05", seed: "SUB_TERMS_AFTER_CHECKOUT", contractFile: "subscription.json", decision: "subscription", expected: ["subscription.terms"], isControl: false },
  { caseId: "CASE-06", seed: "UI_COPY_TWEAK", contractFile: "subscription.json", decision: "subscription", expected: [], isControl: true },
  { caseId: "CASE-07", seed: "UI_ACCENT", contractFile: "location.json", decision: "precise_location", expected: [], isControl: true },
  { caseId: "CASE-08", seed: "LOC_DEFAULT_ON", contractFile: "location.json", decision: "precise_location", expected: ["precise_location.withhold"], isControl: false },
];

/** Plumbing-only smoke-test seed. Never scored, never part of denominators. */
export const SMOKE_SEED = "DM_BURY_MESSAGES";
export const SMOKE_CONTRACT = "teen_dm.json";

/** Tokens that must never appear in reviewer-facing bundles. */
export const FORBIDDEN_BUNDLE_TOKENS: string[] = [
  ...CASES.map((c) => c.seed),
  SMOKE_SEED,
  "ground_truth",
  "ST_MIN_LIMIT_2H",
  "LOC_HIDE_DECLINE",
  "DM_HIDE_BLOCK",
  "SUB_BURY_CANCEL",
  "SUB_TERMS_AFTER_CHECKOUT",
  "UI_COPY_TWEAK",
  "UI_ACCENT",
  "LOC_DEFAULT_ON",
];
