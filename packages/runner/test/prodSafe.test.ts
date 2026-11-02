import { describe, expect, it } from "vitest";
import type { AuditElementInfo } from "../src/auditGuard.js";
import {
  isBlockedProdSafeClick,
  isBlockedProdSafeType,
  statesMatch,
  type ProdSafeElementInfo,
} from "../src/prodSafe.js";

function el(over: Partial<ProdSafeElementInfo>): ProdSafeElementInfo {
  return {
    tag: "button",
    inForm: false,
    isPasswordField: false,
    isSubmitControl: false,
    pageHasPasswordField: false,
    ...over,
  };
}

const auditEl = (e: ProdSafeElementInfo): AuditElementInfo => e;

describe("prod-safe guard", () => {
  it("blocks purchases, deletion and messaging even when the tag is allow-listed", () => {
    const allowed = ["sub.subscribe", "dm.block_unknown", "settings.location"];
    expect(isBlockedProdSafeClick(el({ tag: "a", href: "https://shop.example/checkout", agencyTag: "sub.subscribe" }), allowed)).toBe(
      true,
    );
    expect(isBlockedProdSafeClick(el({ text: "Buy now", agencyTag: "sub.subscribe" }), allowed)).toBe(true);
    expect(isBlockedProdSafeClick(el({ text: "Delete my account", agencyTag: "settings.location" }), allowed)).toBe(
      true,
    );
    expect(isBlockedProdSafeClick(el({ text: "Send message", agencyTag: "dm.block_unknown" }), allowed)).toBe(true);
    expect(isBlockedProdSafeClick(el({ text: "Cancel subscription", agencyTag: "sub.subscribe" }), allowed)).toBe(
      true,
    );
  });

  it("lets allow-listed settings controls through", () => {
    const allowed = ["nav.settings", "settings.location", "location.toggle"];
    expect(isBlockedProdSafeClick(el({ agencyTag: "location.toggle" }), allowed)).toBe(false);
    expect(isBlockedProdSafeClick(el({ agencyTag: "nav.settings" }), allowed)).toBe(false);
  });

  it("blocks instrumented controls outside the allow-list, allows plain navigation", () => {
    const allowed = ["nav.settings", "settings.location", "location.toggle"];
    expect(isBlockedProdSafeClick(el({ agencyTag: "sub.subscribe" }), allowed)).toBe(true);
    expect(isBlockedProdSafeClick(el({ text: "Learn more" }), allowed)).toBe(false);
    expect(isBlockedProdSafeClick(el({ tag: "a", href: "https://app.example/settings" }), allowed)).toBe(false);
  });

  it("keeps the audit submit and credential rules underneath", () => {
    const allowed = ["settings.location"];
    expect(
      isBlockedProdSafeClick(
        el({ isSubmitControl: true, inForm: true, formMethod: "post", agencyTag: "settings.location" }),
        allowed,
      ),
    ).toBe(true);
    expect(isBlockedProdSafeType({ type: "password" }, false, undefined)).toBe(true);
    expect(
      isBlockedProdSafeType({ type: "text", name: "nickname", agencyTag: "profile.nickname" }, false, [
        "profile.nickname",
      ]),
    ).toBe(false);
    expect(isBlockedProdSafeType({ type: "text", name: "nickname" }, false, [])).toBe(false);
    expect(
      isBlockedProdSafeType({ type: "text", name: "nickname", agencyTag: "profile.other" }, false, [
        "profile.nickname",
      ]),
    ).toBe(true);
  });

  it("fails closed with no allow-list", () => {
    expect(isBlockedProdSafeClick(el({ agencyTag: "location.toggle" }), [])).toBe(true);
    expect(isBlockedProdSafeClick(el({ agencyTag: "location.toggle" }), undefined)).toBe(true);
  });

  it("compares fixture state for the restore check", () => {
    const before = { "location.precise": false, "dm.policy": "friends" };
    expect(statesMatch(before, { ...before })).toEqual({ equal: true, changed: [] });
    expect(statesMatch(before, { "location.precise": true, "dm.policy": "friends" })).toEqual({
      equal: false,
      changed: ["location.precise"],
    });
    expect(statesMatch(before, { "location.precise": false })).toEqual({ equal: false, changed: ["dm.policy"] });
  });

  it("reuses the audit element shape", () => {
    const e = el({ agencyTag: "x" });
    expect(auditEl(e).tag).toBe("button");
  });
});
