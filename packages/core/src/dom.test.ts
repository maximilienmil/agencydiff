import { describe, expect, it } from "vitest";
import {
  checkDomAssertions,
  coveredFacts,
  normalizeText,
  type DomElementFact,
} from "./dom.js";

const NEEDS = [
  { id: "identity", synonyms: ["U.S. passport", "birth certificate"] },
  { id: "residency", synonyms: ["proof of residency", "utility bill", "bank statement"] },
  { id: "checklist", synonyms: ["REAL ID checklist", "document checklist"] },
];

const fact = (visibleText: string): DomElementFact[] => [
  { selector: "body", exists: true, visible: true, text: visibleText, visibleText },
];

describe("normalizeText", () => {
  it("is case- and punctuation-insensitive", () => {
    expect(normalizeText("U.S. Passport")).toBe("us passport");
    expect(normalizeText("Driver’s License")).toBe("drivers license");
    expect(normalizeText("  Know   Before\tYou Go ")).toBe("know before you go");
  });
});

describe("coveredFacts", () => {
  it("covers a fact through any synonym", () => {
    expect(coveredFacts("Bring a valid passport or birth certificate.", NEEDS)).toContain("identity");
    expect(coveredFacts("BIRTH CERTIFICATE required.", NEEDS)).toContain("identity");
  });

  it("ignores synonyms shorter than three characters", () => {
    expect(coveredFacts("Show your ID at the office.", [{ id: "x", synonyms: ["ID"] }])).toEqual([]);
  });
});

describe("facts oracle", () => {
  const assertion = { kind: "facts", selector: "body", facts: NEEDS, minFacts: 2 } as const;

  it("passes when the viewport covers enough facts", () => {
    expect(
      checkDomAssertions(
        [assertion],
        fact("Bring a valid passport and a utility bill. Use the REAL ID checklist to gather documents."),
      ),
    ).toBe(true);
  });

  it("fails when the viewport covers too few facts", () => {
    expect(checkDomAssertions([assertion], fact("Welcome to the DMV homepage. Online services."))).toBe(false);
  });

  it("fails on an unrelated topic page", () => {
    expect(
      checkDomAssertions(
        [assertion],
        fact("Renew your vehicle registration online. You need your license plate number and VIN."),
      ),
    ).toBe(false);
  });

  it("paraphrased wording still covers the fact", () => {
    expect(
      checkDomAssertions(
        [assertion],
        fact("Identity proof: a birth certificate works. Residency proof: a bank statement works."),
      ),
    ).toBe(true);
  });
});
