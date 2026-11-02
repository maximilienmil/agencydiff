import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IntentSpec } from "@agencydiff/core";
import {
  fillLoginFromEnv,
  maskSecrets,
  readCredsFromEnv,
  resolveStorageState,
} from "../src/auth.js";
import { MuseDriver } from "../src/drivers.js";
import type { BrowserEnv } from "../src/env.js";

const LOGIN_HTML = `<!doctype html><html><body>
<form action="/session" method="post">
  <label>Username <input type="text" name="username" autocomplete="username"></label>
  <label>Password <input type="password" name="password" autocomplete="current-password"></label>
  <button type="submit">Sign in</button>
</form>
</body></html>`;
const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(LOGIN_HTML)}`;

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.T16_TEST_USER;
  delete process.env.T16_TEST_PASS;
});

describe("auth credentials", () => {
  it("reads scripted credentials from env vars", () => {
    process.env.T16_TEST_USER = "circle-test";
    process.env.T16_TEST_PASS = "s3cret";
    expect(readCredsFromEnv({ usernameEnv: "T16_TEST_USER", passwordEnv: "T16_TEST_PASS" })).toEqual({
      username: "circle-test",
      password: "s3cret",
    });
  });

  it("names the missing variable, never the secret", () => {
    process.env.T16_TEST_USER = "circle-test";
    expect(() => readCredsFromEnv({ usernameEnv: "T16_TEST_USER", passwordEnv: "T16_TEST_PASS" })).toThrow(
      /T16_TEST_PASS/,
    );
  });

  it("resolves the storageState path against the target file", () => {
    expect(resolveStorageState("/targets/circle-auth.json", { storageState: ".auth/circle.json" })).toBe(
      "/targets/.auth/circle.json",
    );
    expect(resolveStorageState("/targets/circle-auth.json", {})).toBeUndefined();
  });

  it("rejects a missing storageState file before the browser opens", async () => {
    const { BrowserEnv } = await import("../src/env.js");
    const dir = mkdtempSync(path.join(tmpdir(), "agencydiff-auth-"));
    try {
      await expect(
        BrowserEnv.open(dataUrl, dir, { storageState: path.join(dir, "nope.json") }),
      ).rejects.toThrow(/storageState file not found/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fills the login form from env vars with no model involved", async () => {
    process.env.T16_TEST_USER = "circle-test";
    process.env.T16_TEST_PASS = "s3cret";
    const browser = await chromium.launch().catch(() => null);
    if (!browser) return;
    try {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto(dataUrl);
      await fillLoginFromEnv(page, { usernameEnv: "T16_TEST_USER", passwordEnv: "T16_TEST_PASS" });
      expect(await page.locator('input[name="username"]').inputValue()).toBe("circle-test");
      expect(await page.locator('input[name="password"]').inputValue()).toBe("s3cret");
      await ctx.close();
    } finally {
      await browser.close();
    }
  });

  it("masks password fields for screenshots without touching their values", async () => {
    const browser = await chromium.launch().catch(() => null);
    if (!browser) return;
    try {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto(dataUrl);
      await page.locator('input[name="password"]').fill("s3cret");
      const release = await maskSecrets(page);
      try {
        const covered = await page.evaluate(() => {
          const input = document.querySelector('input[name="password"]')!;
          const r = input.getBoundingClientRect();
          const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return !!el?.closest?.("[data-agencydiff-mask]");
        });
        expect(covered).toBe(true);
        expect(await page.locator('input[name="password"]').inputValue()).toBe("s3cret");
      } finally {
        await release();
      }
      await page.close();
      await ctx.close();
    } finally {
      await browser.close();
    }
  });

  it("never sends scripted secrets to the model", async () => {
    process.env.T16_TEST_PASS = "s3cret-dont-leak";
    const bodies: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: "r1",
          output: [{ type: "message", content: [{ type: "text", text: "DONE: ok" }] }],
        }),
        text: async () => "",
      }),
    );
    const fetch = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const intent = { id: "i", goal: "G", polarity: "neutral", mustSucceed: true } as IntentSpec;
    const env = {
      execute: async () => {},
      observe: async () => ({
        observation: { url: "http://x", tags: [], screenshot: "s.png" },
        png: Buffer.from([1]),
      }),
    } as unknown as BrowserEnv;
    const driver = new MuseDriver({ apiKey: "test", maxSteps: 2 });
    await driver.run(intent, env, Date.now(), Buffer.from([1]));
    for (const call of (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls) {
      bodies.push(JSON.stringify(call[1]));
    }
    expect(bodies.length).toBeGreaterThan(0);
    for (const b of bodies) expect(b).not.toContain("s3cret-dont-leak");
  });
});
