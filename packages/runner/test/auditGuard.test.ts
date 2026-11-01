import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUDIT_INSTRUCTIONS,
  isBlockedAuditClick,
  isBlockedAuditKeypress,
  isBlockedAuditType,
  isBlockedNavigationUrl,
  pageHasCredentialField,
  type AuditElementInfo,
} from "../src/auditGuard.js";
import { assertDiffOracle } from "../src/targets.js";

const fixture = readFileSync(path.join(import.meta.dirname, "fixture.html"), "utf8");

function el(over: Partial<AuditElementInfo>): AuditElementInfo {
  return {
    tag: "button",
    inForm: false,
    isPasswordField: false,
    isSubmitControl: false,
    pageHasPasswordField: true,
    ...over,
  };
}

describe("audit safety guard", () => {
  it("spots the credential form in a static page", () => {
    expect(pageHasCredentialField(fixture)).toBe(true);
    expect(pageHasCredentialField("<html><body><input type='search'></body></html>")).toBe(false);
  });

  it("blocks purchase-flow navigation but allows discovery pages", () => {
    expect(isBlockedNavigationUrl("https://shop.example/checkout")).toBe(true);
    expect(isBlockedNavigationUrl("https://shop.example/cart?x=1")).toBe(true);
    expect(isBlockedNavigationUrl("https://shop.example/payments/confirm")).toBe(true);
    expect(isBlockedNavigationUrl("https://shop.example/products")).toBe(false);
    expect(isBlockedNavigationUrl("https://shop.example/settings")).toBe(false);
  });

  it("refuses clicks that submit, touch credentials, or buy", () => {
    expect(isBlockedAuditClick(el({ isSubmitControl: true, inForm: true }))).toBe(true);
    expect(isBlockedAuditClick(el({ isSubmitControl: true, inForm: false }))).toBe(false);
    expect(isBlockedAuditClick(el({ tag: "input", isPasswordField: true }))).toBe(true);
    expect(isBlockedAuditClick(el({ tag: "a", href: "https://shop.example/checkout" }))).toBe(true);
    expect(isBlockedAuditClick(el({ text: "Buy now" }))).toBe(true);
    expect(isBlockedAuditClick(el({ text: "Learn more" }))).toBe(false);
  });

  it("refuses credential typing but allows discovery typing", () => {
    expect(isBlockedAuditType({ type: "password" }, false)).toBe(true);
    expect(isBlockedAuditType({ type: "text", name: "username" }, true)).toBe(true);
    expect(isBlockedAuditType({ type: "email", name: "email" }, true)).toBe(true);
    expect(isBlockedAuditType({ type: "search", name: "q" }, true)).toBe(false);
    expect(isBlockedAuditType({ type: "text", name: "q" }, false)).toBe(false);
  });

  it("refuses the Enter key that would submit a focused form", () => {
    expect(isBlockedAuditKeypress(["Enter"])).toBe(true);
    expect(isBlockedAuditKeypress(["Escape"])).toBe(false);
  });

  it("tells the agent the read-only rules in prose", () => {
    expect(AUDIT_INSTRUCTIONS).toMatch(/must not submit/i);
    expect(AUDIT_INSTRUCTIONS).toMatch(/credential/i);
    expect(AUDIT_INSTRUCTIONS).toMatch(/purchase/i);
  });

  it("keeps model judgement out of two-Variant diffs", () => {
    expect(() =>
      assertDiffOracle({ urls: { baseline: "http://x" }, contracts: ["c.json"], oracle: "model-judged" }, "t.json"),
    ).toThrow(/Audit/);
    expect(() =>
      assertDiffOracle({ urls: { baseline: "http://x" }, contracts: ["c.json"], oracle: "dom" }, "t.json"),
    ).not.toThrow();
  });
});
