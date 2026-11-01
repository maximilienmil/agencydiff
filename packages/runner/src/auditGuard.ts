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

/** Form context around a focused control or a submit target. Method and role
 *  are lowercase; has* flags default to false when unknown. */
export interface AuditSubmitContext {
  inForm: boolean;
  inputType?: string;
  formMethod?: string;
  formRole?: string;
  formHasSearchField?: boolean;
  formHasSensitiveField?: boolean;
}

/** Field names or autocomplete tokens that mark personal data. */
const SENSITIVE_FIELD_PATTERN =
  /\b(user-?name|login|email|e-?mail|passwd|pass-?word|tel|phone|mobile|address|street|city|zip|postal|ssn|social|dob|birth-?day|card|cvv|cvc|account)\b/;

/** True when this form field carries credentials or personal data. */
export function isSensitiveField(target: { type?: string; name?: string; autocomplete?: string }): boolean {
  const t = (target.type ?? "").toLowerCase();
  if (t === "password" || t === "email" || t === "tel") return true;
  return SENSITIVE_FIELD_PATTERN.test(`${target.name ?? ""} ${target.autocomplete ?? ""}`.toLowerCase());
}

/** Site search is read-only discovery, so its submits stay allowed: an
 *  input of type=search, a form with role=search, or a GET form with no
 *  credential or personal-data fields. POST forms always stay blocked. */
export function isAllowedSearchSubmit(c: AuditSubmitContext): boolean {
  const method = (c.formMethod ?? "").toLowerCase();
  if (method !== "" && method !== "get") return false;
  if ((c.inputType ?? "").toLowerCase() === "search" || c.formHasSearchField) return true;
  if ((c.formRole ?? "").toLowerCase() === "search") return true;
  return c.inForm && !c.formHasSensitiveField;
}

/** Minimal serializable description of the element an action would hit. */
export interface AuditElementInfo extends AuditSubmitContext {
  tag: string;
  type?: string;
  role?: string;
  href?: string;
  text?: string;
  isPasswordField: boolean;
  isSubmitControl: boolean;
  pageHasPasswordField: boolean;
}

/** Clicks that submit a form, hit credentials, or walk into a purchase flow.
 *  Submit controls in a site-search form stay clickable. */
export function isBlockedAuditClick(el: AuditElementInfo): boolean {
  if (el.isPasswordField) return true;
  if (el.href && isBlockedNavigationUrl(el.href)) return true;
  const label = `${el.text ?? ""} ${el.role ?? ""}`.toLowerCase();
  if (/\b(buy now|place order|check ?out|pay now|confirm purchase)\b/.test(label)) return true;
  // A submit control with no form submits nothing; plain app buttons stay clickable.
  if (el.isSubmitControl && el.inForm && !isAllowedSearchSubmit(el)) return true;
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

/** Enter submits whichever form has focus, so it is blocked except inside
 *  site search, where it is read-only discovery. Without focus context the
 *  safe default stays blocked. */
export function isBlockedAuditKeypress(keys: string[], focus?: AuditSubmitContext): boolean {
  if (!keys.some((k) => k.toUpperCase() === "ENTER" || k.toUpperCase() === "RETURN")) return false;
  if (!focus) return true;
  // Enter outside any form activates the focused link or button, which the
  // click and navigation guards already cover.
  if (!focus.inForm && (focus.inputType ?? "").toLowerCase() !== "password") return false;
  return !isAllowedSearchSubmit(focus);
}

/** Static-HTML helper for tests: does this page contain a credential form? */
export function pageHasCredentialField(html: string): boolean {
  return /<input\b[^>]*type\s*=\s*["']?password["']?/i.test(html);
}

/** Extra instructions appended to the agent prompt in Audit mode. */
export const AUDIT_INSTRUCTIONS = `READ-ONLY AUDIT RULES. You are discovering what the interface offers, not
using it. You MAY use the site's own search box (a search field, or a search
/ GET form with no login fields), including pressing Enter there: that is
read-only discovery. You MUST NOT submit any other form, enter any
credentials (usernames, passwords, emails into login fields), or make any
purchase (including cart, checkout, payment, or subscription steps). Do not
fill password fields, and do not follow links to checkout, cart, payment, or
subscription pages. If the intention would require any of those, stop and
reply with INFEASIBLE: and name the blocked action.`;
