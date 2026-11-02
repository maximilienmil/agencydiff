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

  it("checks visibleText against in-viewport text only", () => {
    const viewport: DomElementFact[] = [
      { selector: "main", exists: true, visible: true, text: "Alpha fact Beta detail", visibleText: "Alpha fact" },
    ];
    expect(
      checkDomAssertions([{ kind: "visibleText", selector: "main", text: "Alpha fact" }], viewport),
    ).toBe(true);
    expect(
      checkDomAssertions([{ kind: "visibleText", selector: "main", text: "Beta detail" }], viewport),
    ).toBe(false);
  });

  it("fails visibleText for hidden elements and facts without viewport text", () => {
    const hidden: DomElementFact[] = [
      { selector: "main", exists: true, visible: false, text: "Alpha fact", visibleText: "" },
    ];
    expect(
      checkDomAssertions([{ kind: "visibleText", selector: "main", text: "Alpha fact" }], hidden),
    ).toBe(false);
    const legacy: DomElementFact[] = [
      { selector: "main", exists: true, visible: true, text: "Alpha fact" },
    ];
    expect(
      checkDomAssertions([{ kind: "visibleText", selector: "main", text: "Alpha fact" }], legacy),
    ).toBe(false);
  });

  it("passes anyOf when one disjunct holds, even nested", () => {
    const viewport: DomElementFact[] = [
      { selector: "main", exists: true, visible: true, text: "Renew Online today", visibleText: "Renew Online today" },
    ];
    expect(
      checkDomAssertions(
        [
          {
            kind: "anyOf",
            assertions: [
              { kind: "visibleText", selector: "main", text: "Online Renewal" },
              { kind: "visibleText", selector: "main", text: "Renew Online" },
            ],
          },
        ],
        viewport,
      ),
    ).toBe(true);
    expect(
      checkDomAssertions(
        [
          {
            kind: "anyOf",
            assertions: [
              { kind: "visibleText", selector: "main", text: "Online Renewal" },
              {
                kind: "anyOf",
                assertions: [{ kind: "visibleText", selector: "main", text: "by mail" }],
              },
            ],
          },
        ],
        viewport,
      ),
    ).toBe(false);
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
