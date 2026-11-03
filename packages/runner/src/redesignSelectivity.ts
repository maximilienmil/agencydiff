/**
 * Selectivity verdicts for the redesign-selectivity follow-up
 * (eval/followup/redesign-selectivity). Pure logic, no I/O: given the
 * independently measured columns, name the selectivity outcome without
 * blending them. Innocent variants must PASS the gate; harmful ones must
 * FAIL it. Low-severity "easier" notes on an improvement are not a block.
 */
export type PathOutcome = "PASS" | "TAG-MISSING" | "UNSATISFIED" | "ERROR";
export type SemanticOutcome =
  | "PRESERVED"
  | "HARMED-COST"
  | "HARMED-DEFAULT"
  | "HARMED-UNREACHABLE"
  | "REVIEW-REQUIRED";
export type Selectivity =
  | "TRUE-PASS"
  | "FALSE-BLOCK"
  | "TRUE-BLOCK"
  | "MISS";

export function selectivityVerdict(opts: {
  /** True for styling-only / relocation / improvement variants. */
  innocent: boolean;
  /** Did the gate fail with at least one medium-or-higher finding? */
  gateFailed: boolean;
  /** Did the variant preserve the promised final state at baseline cost? */
  semantic: SemanticOutcome;
}): Selectivity {
  if (opts.innocent) return opts.gateFailed ? "FALSE-BLOCK" : "TRUE-PASS";
  // A harmful variant the gate passed is a MISS. The semantic column says
  // what kind of harm (or REVIEW-REQUIRED); a PRESERVED semantic there means
  // the variant failed to be harmful, which the report must call out.
  return opts.gateFailed ? "TRUE-BLOCK" : "MISS";
}
