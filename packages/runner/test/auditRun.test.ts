import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AgencyContract, Trace } from "@agencydiff/core";
import {
  compareAudits,
  extractHtml,
  findContract,
  keepPhraseHints,
  keepPhrases,
  loadAuditRuns,
  missingPhrases,
  screensVisited,
  slugify,
  summarizeIntent,
} from "../src/auditRun.js";

const obs = (url: string, screen?: string) => ({ url, screen, tags: [], screenshot: "s.png" });

function trace(intentId: string, steps: number, passed: boolean, repeat = 0): Trace {
  return {
    id: `d.${intentId}.baseline.${repeat}`,
    decision: "d",
    intentId,
    variant: "baseline",
    repeat,
    driver: { kind: "scripted" },
    startedAt: "2026-11-01T00:00:00Z",
    initial: { observation: obs("http://x/start", "home") },
    steps: Array.from({ length: steps }, (_, i) => ({
      index: i,
      tMs: (i + 1) * 1000,
      actions: [{ type: "click", x: 1, y: 1 } as const],
      after: obs("http://x/p", i === 0 ? "p" : undefined),
    })),
    final: {},
    oracle: { checked: true, passed },
    stoppedReason: "script_done",
  };
}

const contract = {
  decision: "d",
  promise: "p",
  intents: [
    { id: "a", goal: "Goal A", polarity: "neutral", domOracle: [{ kind: "textContains", selector: "h1", text: "Alpha" }], mustSucceed: true },
    { id: "b", goal: "Goal B", polarity: "neutral", domOracle: [{ kind: "textContains", selector: "main", text: "Beta text" }], mustSucceed: true },
  ],
  pairs: [],
} as unknown as AgencyContract;

describe("auditRun helpers", () => {
  it("slugifies decisions", () => {
    expect(slugify("license_renewal_info")).toBe("license-renewal-info");
  });

  it("extracts HTML from fenced or bare replies, rejecting prose", () => {
    expect(extractHtml('```html\n<html><body>x</body></html>\n```')).toContain("<html>");
    expect(extractHtml("Sure! <!doctype html><html></html>")).toContain("<html>");
    expect(() => extractHtml("no html here")).toThrow();
  });

  it("tracks keep phrases for dom oracles", () => {
    expect(keepPhrases(contract)).toEqual(["Alpha", "Beta text"]);
    expect(keepPhraseHints(contract)).toEqual([
      '"Alpha" inside the <h1>',
      '"Beta text" inside an element matching "main"',
    ]);
    expect(missingPhrases("<h1>Alpha</h1>", ["Alpha", "Beta text"])).toEqual(["Beta text"]);
  });

  it("dedupes screens visited, preferring data-screen over URL", () => {
    const t = trace("a", 2, true);
    expect(screensVisited(t)).toEqual(["p", "x/p"]);
  });

  it("summarizes an intent with core-compatible medians", () => {
    const s = summarizeIntent("a", [trace("a", 1, true), trace("a", 3, false), trace("a", 2, true)], contract);
    expect(s).toMatchObject({ attempts: 3, successes: 2, medianSteps: 2, medianActions: 2, goal: "Goal A" });
  });

  it("pairs before/after traces by intent", () => {
    const rows = compareAudits(
      [{ dir: "b", decision: "d", report: {} as never, traces: [{ trace: trace("a", 4, true), dir: "b" }] }],
      [{ dir: "a", decision: "d", report: {} as never, traces: [{ trace: trace("a", 1, true), dir: "a" }] }],
      contract,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].before.medianSteps).toBe(4);
    expect(rows[0].after.medianSteps).toBe(1);
  });

  it("loads audit runs from disk", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "agencydiff-run-"));
    const dd = path.join(root, "d");
    const td = path.join(dd, "d.a.baseline.0");
    mkdirSync(td, { recursive: true });
    writeFileSync(path.join(dd, "audit.json"), JSON.stringify({ decision: "d", aggregates: [] }));
    writeFileSync(path.join(td, "trace.json"), JSON.stringify(trace("a", 1, true)));
    try {
      const loaded = await loadAuditRuns(root);
      expect(loaded).toHaveLength(1);
      expect(loaded[0].traces).toHaveLength(1);
      expect(loaded[0].traces[0].dir).toBe(td);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("findContract is covered by the dmv contract on disk", async () => {
    const root = path.join(import.meta.dirname, "..", "..", "..");
    const c = await findContract(root, "license_renewal_info");
    expect(c?.intents.map((i) => i.id)).toEqual(["renew-online", "renew-office", "real-id-docs", "renew-appointment"]);
  });
});
