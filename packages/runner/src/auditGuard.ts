/**
 * Audit-mode safety guard. Audits probe a single Variant with read-only
 * discovery Intents, so the driver must never submit a form, enter
 * credentials, or make a purchase. These pure helpers decide what is blocked;
 * BrowserEnv enforces them at the Playwright layer and the agent instructions
 * state the same rule in prose.
 */

/** URL fragments that indicate a purchase flow. Navigation to them is blocked. */
const BLOCKED_URL_FRAGMENTS = [
  "checkout",
  "check-out",
  "cashier",
  "payment",
  "purchase",
  "place-order",
  "buy-now",
  "confirm-purchase",
  "billing",
  "subscribe",
  "cart",
];

/** True when visiting this URL would enter a purchase flow. */
export function isBlockedNavigationUrl(url: string): boolean {
  const u = url.toLowerCase();
  return BLOCKED_URL_FRAGMENTS.some((f) => u.includes(f));
}

/** Minimal serializable description of the element an action would hit. */
export interface AuditElementInfo {
  tag: string;
  type?: string;
  role?: string;
  href?: string;
  text?: string;
  inForm: boolean;
  isPasswordField: boolean;
  isSubmitControl: boolean;
  pageHasPasswordField: boolean;
}

/** Clicks that submit a form, hit credentials, or walk into a purchase flow. */
export function isBlockedAuditClick(el: AuditElementInfo): boolean {
  // A submit control with no form submits nothing; plain app buttons stay clickable.
  if (el.isPasswordField || (el.isSubmitControl && el.inForm)) return true;
  if (el.href && isBlockedNavigationUrl(el.href)) return true;
  const label = `${el.text ?? ""} ${el.role ?? ""}`.toLowerCase();
  if (/\b(buy now|place order|check ?out|pay now|confirm purchase)\b/.test(label)) return true;
  return false;
}

/** Typing that would enter credentials. Only credential-looking fields are
 *  blocked; free-text discovery (search boxes, notes) stays allowed. */
export function isBlockedAuditType(
  target: { type?: string; name?: string; autocomplete?: string },
  pageHasPasswordField: boolean,
): boolean {
  const t = (target.type ?? "text").toLowerCase();
  if (t === "password") return true;
  if (!pageHasPasswordField) return false;
  const id = `${target.name ?? ""} ${target.autocomplete ?? ""}`.toLowerCase();
  return (
    t === "email" ||
    /\b(user-?name|login|email|account|passwd)\b/.test(id)
  );
}

/** The Enter key submits whichever form has focus, so it is blocked outright. */
export function isBlockedAuditKeypress(keys: string[]): boolean {
  return keys.some((k) => k.toUpperCase() === "ENTER" || k.toUpperCase() === "RETURN");
}

/** Static-HTML helper for tests: does this page contain a credential form? */
export function pageHasCredentialField(html: string): boolean {
  return /<input\b[^>]*type\s*=\s*["']?password["']?/i.test(html);
}

/** Extra instructions appended to the agent prompt in Audit mode. */
export const AUDIT_INSTRUCTIONS = `READ-ONLY AUDIT RULES. You are discovering what the interface offers, not
using it. You MUST NOT submit any form, enter any credentials (usernames,
passwords, emails into login fields), or make any purchase (including cart,
checkout, payment, or subscription steps). Do not press Enter to submit, do
not fill password fields, and do not follow links to checkout, cart, payment,
or subscription pages. If the intention would require any of those, stop and
reply with INFEASIBLE: and name the blocked action.`;
