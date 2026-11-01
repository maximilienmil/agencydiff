import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const EVAL = path.join(import.meta.dirname, "..", "..", "..", "eval", "susbench");

interface ManifestPair {
  name: string;
  pattern: string;
  codes: string[];
  contract: string;
  page: string;
  control?: boolean;
}

const manifest = JSON.parse(readFileSync(path.join(EVAL, "manifest.json"), "utf8")) as {
  pairs: ManifestPair[];
};

function pageHtml(page: string): string {
  return readFileSync(path.join(EVAL, "pages", page), "utf8");
}

// Offline contract↔page consistency: every domOracle selector must exist in
// its page, every intent target must have a data-agency tag, and every pair
// page must carry its __susbench marker. No model, no browser, no network.
describe("susbench lab assets", () => {
  it("manifest covers all 9 SusBench pattern types plus controls", () => {
    const patterns = new Set(manifest.pairs.filter((p) => !p.control).map((p) => p.pattern));
    for (const expected of [
      "Disguised ad",
      "False hierarchy",
      "Preselection",
      "Pop-up ad",
      "Double negative",
      "Confirm shaming",
      "Fake social proof",
      "Forced action",
      "Hidden information",
    ]) {
      expect(patterns.has(expected), `missing pattern: ${expected}`).toBe(true);
    }
    expect(manifest.pairs.filter((p) => p.control).length).toBeGreaterThanOrEqual(3);
  });

  it("every contract referenced by the manifest parses with valid pairs", () => {
    const seen = new Set<string>();
    for (const pair of manifest.pairs.filter((p) => !p.control)) {
      if (seen.has(pair.contract)) continue;
      seen.add(pair.contract);
      const contract = JSON.parse(readFileSync(path.join(EVAL, pair.contract), "utf8")) as {
        intents: { id: string; domOracle?: { selector: string }[]; target?: string }[];
        pairs: { accept: string; reject: string }[];
      };
      const ids = new Set(contract.intents.map((i) => i.id));
      for (const p of contract.pairs) {
        expect(ids.has(p.accept)).toBe(true);
        expect(ids.has(p.reject)).toBe(true);
      }
      expect(contract.intents.length).toBeGreaterThan(0);
    }
  });

  it("every domOracle selector exists in its page", () => {
    const seen = new Set<string>();
    for (const pair of manifest.pairs) {
      if (seen.has(pair.contract + pair.page)) continue;
      seen.add(pair.contract + pair.page);
      const contract = JSON.parse(readFileSync(path.join(EVAL, pair.contract), "utf8")) as {
        intents: { id: string; domOracle?: { selector: string }[] }[];
      };
      const html = pageHtml(pair.page);
      for (const intent of contract.intents) {
        for (const assertion of intent.domOracle ?? []) {
          const id = assertion.selector.match(/^#([\w-]+)/)?.[1];
          expect(id, `${pair.name}/${intent.id} selector ${assertion.selector}`).toBeTruthy();
          expect(html.includes(`id="${id}"`), `${pair.name}/${intent.id} missing #${id}`).toBe(true);
        }
      }
    }
  });

  it("every intent target has a matching data-agency tag", () => {
    const seen = new Set<string>();
    for (const pair of manifest.pairs) {
      if (seen.has(pair.contract + pair.page)) continue;
      seen.add(pair.contract + pair.page);
      const contract = JSON.parse(readFileSync(path.join(EVAL, pair.contract), "utf8")) as {
        intents: { id: string; target?: string }[];
      };
      const html = pageHtml(pair.page);
      for (const intent of contract.intents) {
        if (!intent.target) continue;
        expect(
          html.includes(`data-agency="${intent.target}"`) || html.includes(`dataset.agency = "${intent.target}"`),
          `${pair.name}/${intent.id} missing data-agency tag`,
        ).toBe(true);
      }
    }
  });

  it("every page carries a __susbench marker and no checkout plumbing", () => {
    for (const file of readdirSync(path.join(EVAL, "pages"))) {
      if (!file.endsWith(".html")) continue;
      const html = readFileSync(path.join(EVAL, "pages", file), "utf8");
      expect(html.includes("__susbench"), `${file} marker`).toBe(true);
      expect(html.includes("<form"), `${file} must not contain a form`).toBe(false);
      expect(/(href|action)="[^"]*(checkout|purchase|payment|place-order)/i.test(html), `${file} must not link a purchase flow`).toBe(false);
    }
  });

  it("results.json matches the manifest schema", () => {
    const results = JSON.parse(readFileSync(path.join(EVAL, "results.json"), "utf8")) as {
      repeats: number;
      model: string;
      pairs: {
        pair: string;
        pattern: string;
        codes: string[];
        control: boolean;
        detected?: boolean;
        falseAlarm?: boolean;
        metricsMoved: string[];
      }[];
    };
    const names = new Set(manifest.pairs.map((p) => p.name));
    expect(results.repeats).toBeGreaterThanOrEqual(1);
    expect(results.model.length).toBeGreaterThan(0);
    for (const entry of results.pairs) {
      expect(names.has(entry.pair), `unknown pair ${entry.pair}`).toBe(true);
      if (entry.control) {
        expect(entry.falseAlarm === undefined || typeof entry.falseAlarm === "boolean").toBe(true);
      } else {
        expect(typeof entry.detected).toBe("boolean");
      }
      expect(Array.isArray(entry.metricsMoved)).toBe(true);
    }
  });
});
