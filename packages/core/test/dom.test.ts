import { describe, expect, it } from "vitest";
import { checkDomAssertions, type DomElementFact } from "../src/dom.js";

const facts: DomElementFact[] = [
  { selector: "#save", exists: true, visible: true, text: "Save changes" },
  { selector: "#hidden-tip", exists: true, visible: false, text: "Hidden" },
  { selector: "#notify", exists: true, visible: true, text: "Email me", checked: true },
  { selector: "#name", exists: true, visible: true, text: "", value: "Ada" },
];

describe("checkDomAssertions", () => {
  it("returns undefined when there is nothing to check", () => {
    expect(checkDomAssertions(undefined, facts)).toBeUndefined();
    expect(checkDomAssertions([], facts)).toBeUndefined();
  });

  it("passes when every assertion holds", () => {
    expect(
      checkDomAssertions(
        [
          { kind: "exists", selector: "#save" },
          { kind: "visible", selector: "#save" },
          { kind: "textContains", selector: "#save", text: "Save" },
          { kind: "checked", selector: "#notify" },
          { kind: "value", selector: "#name", value: "Ada" },
        ],
        facts,
      ),
    ).toBe(true);
  });

  it("fails a hidden element, wrong text, unchecked box and wrong value", () => {
    expect(checkDomAssertions([{ kind: "visible", selector: "#hidden-tip" }], facts)).toBe(false);
    expect(
      checkDomAssertions([{ kind: "textContains", selector: "#save", text: "Delete" }], facts),
    ).toBe(false);
    expect(
      checkDomAssertions([{ kind: "checked", selector: "#notify", checked: false }], facts),
    ).toBe(false);
    expect(checkDomAssertions([{ kind: "value", selector: "#name", value: "Grace" }], facts)).toBe(
      false,
    );
  });

  it("fails assertions with no matching fact", () => {
    expect(checkDomAssertions([{ kind: "exists", selector: "#missing" }], facts)).toBe(false);
  });

  it("treats one failing assertion as a failed oracle", () => {
    expect(
      checkDomAssertions(
        [
          { kind: "exists", selector: "#save" },
          { kind: "visible", selector: "#hidden-tip" },
        ],
        facts,
      ),
    ).toBe(false);
  });
});
