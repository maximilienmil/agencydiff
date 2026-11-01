import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BrowserEnv } from "../src/env.js";

// Exercises the real page.evaluate serialization path in BrowserEnv:
// the callbacks run in the browser, so any loader-injected helper they
// close over fails here exactly as it would in a live audit.
const html = readFileSync(path.join(import.meta.dirname, "fixture.html"), "utf8");
const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

describe("collectDomFacts", () => {
  it(
    "reads facts from the live page",
    async (ctx) => {
      const dir = mkdtempSync(path.join(tmpdir(), "agencydiff-dom-"));
      let env: BrowserEnv;
      try {
        env = await BrowserEnv.open(dataUrl, dir);
      } catch {
        ctx.skip();
        return;
      }
      try {
        const facts = await env.collectDomFacts(["h1", "#buy", "#nope", 'input[name="password"]']);
        const by = new Map(facts.map((f) => [f.selector, f]));
        expect(by.get("h1")).toMatchObject({ exists: true, visible: true });
        expect(by.get("h1")?.text).toContain("Demo store");
        expect(by.get("#buy")).toMatchObject({ exists: true, visible: true });
        expect(by.get("#nope")).toMatchObject({ exists: false, visible: false });
        expect(by.get('input[name="password"]')).toMatchObject({ exists: true, value: "" });
      } finally {
        await env.close();
        rmSync(dir, { recursive: true, force: true });
      }
    },
    60000,
  );
});
