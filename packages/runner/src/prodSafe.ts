/**
 * Production-safe guard for `--prod-safe` runs against real production with
 * a dedicated synthetic test account. Audits already refuse submits,
 * credential entry and purchase navigation; prod-safe adds two rules on top:
 *
 * 1. Destructive actions stay blocked even when allow-listed: purchases,
 *    deletion/removal, messaging, and subscription cancellation. The
 *    allow-list only ever permits reversible settings toggles.
 * 2. Default-deny on instrumented controls: a click on a `data-agency`
 *    element whose tag is outside the contract's allow-list is refused.
 *    Plain uninstrumented navigation (links, back buttons) stays allowed.
 */
import {
  isBlockedAuditClick,
  isBlockedAuditKeypress,
  isBlockedAuditType,
  isBlockedNavigationUrl,
  type AuditElementInfo,
  type AuditSubmitContext,
} from "./auditGuard.js";

/** The `data-agency` tag of the element an action would hit, if any. */
export interface ProdSafeElementInfo extends AuditElementInfo {
  agencyTag?: string;
}

/** Labels that always refuse, even for allow-listed tags. Subscription
 *  cancellation counts as destructive: it ends paid access. */
const ALWAYS_BLOCKED_LABEL =
  /\b(buy now|place order|check ?out|pay now|confirm purchase|subscribe|delete|remove account|erase|unsubscribe|cancel subscription|cancel plan|send|send message|message)\b/;

/** True when this click would enter a purchase flow or hit a destructive
 *  control. `allowedTags` is the contract's prod-safe allow-list; absent or
 *  empty means no instrumented control may be touched (fail closed). */
export function isBlockedProdSafeClick(el: ProdSafeElementInfo, allowedTags?: string[] | Set<string>): boolean {
  const label = `${el.text ?? ""} ${el.role ?? ""}`.toLowerCase();
  if (ALWAYS_BLOCKED_LABEL.test(label)) return true;
  if (el.href && isBlockedNavigationUrl(el.href)) return true;
  // The audit submit/credential/purchase rules hold underneath.
  const { agencyTag: _drop, ...auditEl } = el;
  if (isBlockedAuditClick(auditEl)) return true;
  if (!el.agencyTag) return false;
  const allowed = allowedTags instanceof Set ? allowedTags : new Set(allowedTags ?? []);
  return !allowed.has(el.agencyTag);
}

/** Typing is blocked into credentials (audit rule) and into any
 *  instrumented field outside the allow-list. */
export function isBlockedProdSafeType(
  target: { type?: string; name?: string; autocomplete?: string; agencyTag?: string },
  pageHasPasswordField: boolean,
  allowedTags?: string[] | Set<string>,
): boolean {
  if (isBlockedAuditType(target, pageHasPasswordField)) return true;
  if (!target.agencyTag) return false;
  const allowed = allowedTags instanceof Set ? allowedTags : new Set(allowedTags ?? []);
  return !allowed.has(target.agencyTag);
}

/** Enter outside site search would submit a form: blocked, as in audits. */
export function isBlockedProdSafeKeypress(keys: string[], focus?: AuditSubmitContext): boolean {
  return isBlockedAuditKeypress(keys, focus);
}

/** Compare post-restore app state against the pre-probe fixture snapshot.
 *  Only the keys present before the probe are compared: probes must not
 *  leave residue on those keys. */
export function statesMatch(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): { equal: boolean; changed: string[] } {
  if (!before || !after) return { equal: false, changed: ["<missing state snapshot>"] };
  const changed = Object.keys(before).filter((k) => !Object.is(before[k], after[k]));
  return { equal: changed.length === 0, changed };
}

/** Extra instructions appended to the agent prompt in `--prod-safe` runs. */
export const PROD_SAFE_INSTRUCTIONS = `PRODUCTION-SAFE RULES. You are probing a real production app with a
dedicated synthetic test account. You MAY toggle settings listed in your
instructions, and NOTHING else: you MUST NOT buy, subscribe, cancel, delete,
remove, send, message, or submit any form except site search. If the
intention would require any of those, stop and reply with INFEASIBLE: and
name the blocked action. After your run the account is restored to its
starting state and the restore is verified.`;
