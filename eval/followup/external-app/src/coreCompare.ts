/** Pure agreement analysis between the standalone pilot scorer and core
 *  diffContract findings for one variant x decision cell. No DOM, no I/O. */
import type { Finding as CoreFinding } from "../../../../packages/core/src/types.js";
import type { Finding as StandaloneFinding, NoFinding } from "./score.js";

export type StandaloneVerdict = StandaloneFinding | NoFinding;

export type Agreement = "agree" | "disagree" | "needs-review";

/**
 * Both instruments replay the identical frozen path, so their verdicts must
 * coincide cell by cell: oracle failure <-> goal_unreachable, tap increase
 * <-> action_cost, parity-or-better <-> no finding on either side. Any
 * divergence is retained as `disagree` with a machine-readable reason; a
 * broken baseline on either side is `needs-review`, never silent.
 */
export function classifyAgreement(
  standalone: StandaloneVerdict,
  coreFindings: CoreFinding[],
): { agreement: Agreement; reason: string } {
  const kinds = new Set(coreFindings.map((f) => f.kind));
  if ("finding" in standalone && standalone.finding === null) {
    if (standalone.reason === "baseline-broken") {
      return { agreement: "needs-review", reason: `standalone: ${standalone.detail}` };
    }
    if (coreFindings.length === 0) {
      return { agreement: "agree", reason: `both silent (${standalone.reason}: ${standalone.detail})` };
    }
    return {
      agreement: "disagree",
      reason: `standalone silent (${standalone.reason}) but core reports ${[...kinds].join(",")}`,
    };
  }
  const kind = (standalone as StandaloneFinding).kind;
  if (kinds.has(kind as CoreFinding["kind"]) && coreFindings.length === 1) {
    return { agreement: "agree", reason: `both report ${kind}` };
  }
  if (coreFindings.length === 0) {
    return { agreement: "disagree", reason: `standalone reports ${kind} but core is silent` };
  }
  return {
    agreement: "disagree",
    reason: `standalone reports ${kind} but core reports ${[...kinds].join(",")}`,
  };
}
