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

/** Lowercase, drop punctuation, collapse whitespace: "U.S. passport",
 *  "u.s. passport" and "US PASSPORT" all become "us passport". Synonyms
 *  shorter than three characters normalize to nothing and never match. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Facts covered by a visible-text sample: a fact is covered when any of
 *  its synonyms appears in the normalized sample. */
export function coveredFacts(sample: string, facts: { id: string; synonyms: string[] }[]): string[] {
  const hay = ` ${normalizeText(sample)} `;
  return facts
    .filter((f) =>
      f.synonyms.some((s) => {
        const n = normalizeText(s);
        return n.length >= 3 && hay.includes(n);
      }),
    )
    .map((f) => f.id);
}

/** Every assertion must hold against the fact recorded for its selector.
 *  An assertion with no matching fact fails. */
export function checkDomAssertions(
  assertions: DomAssertion[] | undefined,
  facts: DomElementFact[],
): boolean | undefined {
  if (!assertions || assertions.length === 0) return undefined;
  const bySelector = new Map(facts.map((f) => [f.selector, f]));
  return assertions.every((a) => checkOne(a, bySelector));
}

function checkOne(a: DomAssertion, bySelector: Map<string, DomElementFact>): boolean {
  // One disjunction per fact: the same Intent can be answered by different
  // pages (a dedicated page or a search advisor) in different words.
  if (a.kind === "anyOf") return a.assertions.some((sub) => checkOne(sub, bySelector));
  if (a.kind === "facts") {
    const f = bySelector.get(a.selector);
    if (!f || !f.exists) return false;
    return coveredFacts(f.visibleText ?? "", a.facts).length >= a.minFacts;
  }
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
}
