import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { IntentSpec } from "@agencydiff/core";
import { ScriptedDriver } from "../src/drivers.js";
import { BrowserEnv } from "../src/env.js";

// Viewport is 430x860: the top paragraph is on screen, the bottom one is a
// full screen below the fold. Both live in <body>, so a body-text oracle
// cannot tell them apart but a viewport-text oracle can.
const html = `<!doctype html><html><body><main><p id="top">Alpha fact on screen</p><div style="height:2000px"></div><p id="bottom">Beta detail below fold</p></main></body></html>`;
const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

const buttons =
  `<!doctype html><html><body><button data-agency="one">One</button><button data-agency="two">Two</button></body></html>`;
const buttonsUrl = `data:text/html;charset=utf-8,${encodeURIComponent(buttons)}`;

const intent = { id: "i", goal: "G", polarity: "neutral", mustSucceed: true } as IntentSpec;

describe("viewport oracle evaluation", () => {
  it(
    "collects only in-viewport text as visibleText",
    async (ctx) => {
      const dir = mkdtempSync(path.join(tmpdir(), "agencydiff-sat-"));
      let env: BrowserEnv;
      try {
        env = await BrowserEnv.open(dataUrl, dir);
      } catch {
        ctx.skip();
        return;
      }
      try {
        const [fact] = await env.collectDomFacts(["main"]);
        expect(fact.exists).toBe(true);
        expect(fact.text).toContain("Beta detail below fold");
        expect(fact.visibleText).toContain("Alpha fact on screen");
        expect(fact.visibleText).not.toContain("Beta detail below fold");
      } finally {
        await env.close();
        rmSync(dir, { recursive: true, force: true });
      }
    },
    60000,
  );

  it(
    "stops a scripted run early once the oracle holds",
    async (ctx) => {
      const dir = mkdtempSync(path.join(tmpdir(), "agencydiff-sat-"));
      let env: BrowserEnv;
      try {
        env = await BrowserEnv.open(buttonsUrl, dir);
      } catch {
        ctx.skip();
        return;
      }
      try {
        const driver = new ScriptedDriver(() => ["one", "two"]);
        let calls = 0;
        const result = await driver.run(intent, env, Date.now(), Buffer.of(), {
          isSatisfied: async () => ++calls === 1,
        });
        expect(result.stoppedReason).toBe("satisfied");
        expect(result.steps).toHaveLength(1);
        expect(result.satisfiedFlags).toEqual([true]);
      } finally {
        await env.close();
        rmSync(dir, { recursive: true, force: true });
      }
    },
    60000,
  );

  it(
    "runs the full path when the oracle never holds",
    async (ctx) => {
      const dir = mkdtempSync(path.join(tmpdir(), "agencydiff-sat-"));
      let env: BrowserEnv;
      try {
        env = await BrowserEnv.open(buttonsUrl, dir);
      } catch {
        ctx.skip();
        return;
      }
      try {
        const driver = new ScriptedDriver(() => ["one", "two"]);
        const result = await driver.run(intent, env, Date.now(), Buffer.of(), {
          isSatisfied: async () => false,
        });
        expect(result.stoppedReason).toBe("script_done");
        expect(result.steps).toHaveLength(2);
        expect(result.satisfiedFlags).toEqual([false, false]);
      } finally {
        await env.close();
        rmSync(dir, { recursive: true, force: true });
      }
    },
    60000,
  );
});
