import type { DomAssertion } from "./types.js";

/** One observed fact about a selector on the final page, collected in the
 *  browser and evaluated here so the check itself stays pure and offline. */
export interface DomElementFact {
  selector: string;
  exists: boolean;
  visible: boolean;
  text: string;
  /** Text of the element's descendants that intersect the viewport.
   *  Collected alongside `text` so viewport checks stay pure and offline. */
  visibleText?: string;
  checked?: boolean;
  value?: string;
}

/** Every assertion must hold against the fact recorded for its selector.
 *  An assertion with no matching fact fails. */
export function checkDomAssertions(
  assertions: DomAssertion[] | undefined,
  facts: DomElementFact[],
): boolean | undefined {
  if (!assertions || assertions.length === 0) return undefined;
  const bySelector = new Map(facts.map((f) => [f.selector, f]));
  return assertions.every((a) => {
    const f = bySelector.get(a.selector);
    if (!f || !f.exists) return false;
    switch (a.kind) {
      case "exists":
        return true;
      case "visible":
        return f.visible;
      case "textContains":
        return f.text.includes(a.text);
      case "visibleText":
        return (f.visibleText ?? "").includes(a.text);
      case "checked":
        return (f.checked ?? false) === (a.checked ?? true);
      case "value":
        return f.value === a.value;
    }
  });
}
