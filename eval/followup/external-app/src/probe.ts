import { setTimeout as sleep } from "node:timers/promises";
import { chromium, type Browser, type Page } from "playwright";
import type { ProbeRun } from "./score.js";

export interface ProbeResult extends ProbeRun {
  durationMs: number;
}

export interface ProbeOpts {
  baseUrl: string;
  variant: string;
  decision: "D1" | "D2" | "D3" | "D4";
  rep: number;
  topic: string;
  headless?: boolean;
}

class TapCounter {
  taps = 0;
  constructor(readonly page: Page) {}
  async click(selector: string, opts?: { timeout?: number }) {
    await this.page.click(selector, { timeout: opts?.timeout ?? 8000 });
    this.taps += 1;
  }
  async clickLocator(loc: import("playwright").Locator, opts?: { timeout?: number }) {
    await loc.click({ timeout: opts?.timeout ?? 8000 });
    this.taps += 1;
  }
  async fill(loc: import("playwright").Locator, text: string) {
    await loc.fill(text);
    this.taps += 1;
  }
}

async function dismissBannerIfPresent(t: TapCounter) {
  // Let the first-run banner settle (it self-hides once the pre-granted
  // permission resolves); checking mid-flap costs a random tap.
  await t.page.waitForTimeout(1500);
  const close = t.page.getByRole("button", { name: "Close" }).first();
  try {
    if (await close.isVisible({ timeout: 1000 })) await t.clickLocator(close, { timeout: 3000 });
  } catch {
    /* banner absent: zero taps */
  }
}

async function subscribeUI(t: TapCounter, topic: string) {
  await dismissBannerIfPresent(t);
  await t.clickLocator(t.page.getByRole("button", { name: "Subscribe to topic" }));
  await t.fill(t.page.getByPlaceholder(/Topic name/), topic);
  // Let React commit the field value before confirming (no tap).
  await t.page.waitForTimeout(400);
  const dlg = t.page.getByRole("dialog");
  await t.clickLocator(dlg.getByRole("button").last());
  await t.page.getByRole("button", { name: topic }).first().waitFor({ timeout: 30000 });
}

function subId(baseUrl: string, topic: string) {
  return `${baseUrl.replace(/\/$/, "")}/${topic}`;
}

async function readStore(page: Page, store: string): Promise<unknown[]> {
  return page.evaluate(
    (s) =>
      new Promise<unknown[]>((resolve, reject) => {
        const req = indexedDB.open("ntfy");
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(s)) return resolve([]);
          const tx = db.transaction(s, "readonly");
          const all = tx.objectStore(s).getAll();
          all.onsuccess = () => resolve(all.result as unknown[]);
          all.onerror = () => reject(new Error(`read ${s}`));
        };
        req.onerror = () => reject(new Error("open ntfy db"));
      }),
    store,
  );
}

async function openTopicMenu(t: TapCounter, topic: string) {
  const row = t.page.getByRole("button", { name: topic }).first();
  await row.waitFor({ timeout: 30000 });
  const inner = row.locator("button");
  if ((await inner.count()) > 0) {
    await t.clickLocator(inner.first());
  } else {
    await t.clickLocator(row, { button: "right" } as never);
  }
  await t.page.getByRole("menu").waitFor({ timeout: 8000 });
}

function freshContext(browser: Browser, baseUrl: string) {
  // Standardized first-run state: notification permission pre-granted and
  // the OS-permission banner pre-dismissed via the app's own prefs blob
  // (orthogonal prompt; subscriptions empty, all protective defaults kept).
  // This keeps banner handling at a constant zero taps.
  const prefcache = JSON.stringify({
    sound: "ding",
    minPriority: 1,
    deleteAfter: 604800,
    theme: "system",
    dateFormat: "system",
    timeFormat: "system",
    webPushEnabled: false,
    notificationAlertDismissed: true,
  });
  return browser.newContext({
    viewport: { width: 1280, height: 800 },
    permissions: ["notifications"],
    storageState: {
      cookies: [],
      origins: [{ origin: baseUrl.replace(/\/$/, ""), localStorage: [{ name: "prefcache", value: prefcache }] }],
    },
  });
}

export async function probeD1(browser: Browser, o: ProbeOpts): Promise<ProbeResult> {
  const started = Date.now();
  const ctx = await freshContext(browser, o.baseUrl);
  const page = await ctx.newPage();
  const t = new TapCounter(page);
  let detail = "";
  try {
    await page.goto(o.baseUrl, { waitUntil: "domcontentloaded" });
    await subscribeUI(t, o.topic);
    await openTopicMenu(t, o.topic);
    const unsub = page.getByRole("menuitem", { name: "Unsubscribe" });
    if ((await unsub.count()) === 0) {
      detail = "Unsubscribe menuitem absent";
      return { ...base(o, t), durationMs: Date.now() - started, oraclePass: false, detail };
    }
    await t.clickLocator(unsub.first());
    await page.getByRole("heading", { name: /no subscriptions yet|don't have any subscriptions/i }).waitFor({ timeout: 10000 });
    const subs = (await readStore(page, "subscriptions")) as { topic: string; baseUrl: string }[];
    const mine = subs.filter((s) => s.topic === o.topic);
    detail = `subscriptions for topic: ${mine.length}`;
    return { ...base(o, t), durationMs: Date.now() - started, oraclePass: mine.length === 0, detail };
  } catch (e) {
    return { ...base(o, t), durationMs: Date.now() - started, oraclePass: false, detail: `error: ${(e as Error).message.slice(0, 500)}` };
  } finally {
    await ctx.close();
  }
}

export async function probeD2(browser: Browser, o: ProbeOpts): Promise<ProbeResult> {
  const started = Date.now();
  const ctx = await freshContext(browser, o.baseUrl);
  const page = await ctx.newPage();
  const t = new TapCounter(page);
  let detail = "";
  try {
    await page.goto(o.baseUrl, { waitUntil: "domcontentloaded" });
    await subscribeUI(t, o.topic);
    await openTopicMenu(t, o.topic);
    // Variant O2 shows a confirm dialog; baseline mutes immediately.
    const muteItem = page.getByRole("menuitem", { name: /^(mute|unmute) notifications$/i });
    if ((await muteItem.count()) === 0) {
      detail = "mute menuitem absent";
      return { ...base(o, t), durationMs: Date.now() - started, oraclePass: false, detail };
    }
    await t.clickLocator(muteItem.first());
    const confirmBtn = page.getByRole("button", { name: /mute anyway/i });
    try {
      if (await confirmBtn.first().isVisible({ timeout: 2500 })) {
        await t.clickLocator(confirmBtn.first());
      }
    } catch {
      /* baseline: no confirm dialog */
    }
    await page.waitForTimeout(1500);
    const subs = (await readStore(page, "subscriptions")) as { topic: string; mutedUntil: number }[];
    const mine = subs.find((s) => s.topic === o.topic);
    // Muted indicator is an aria-labelled icon, not text: query both.
    const badge = await page
      .locator('[aria-label*="muted" i], [title*="muted" i]')
      .count()
      .catch(() => 0);
    detail = `mutedUntil=${mine?.mutedUntil ?? "missing"} badge=${badge}`;
    return {
      ...base(o, t),
      durationMs: Date.now() - started,
      oraclePass: !!mine && mine.mutedUntil > 0 && badge > 0,
      detail,
    };
  } catch (e) {
    return { ...base(o, t), durationMs: Date.now() - started, oraclePass: false, detail: `error: ${(e as Error).message.slice(0, 500)}` };
  } finally {
    await ctx.close();
  }
}

export async function probeD3(browser: Browser, o: ProbeOpts): Promise<ProbeResult> {
  const started = Date.now();
  const ctx = await freshContext(browser, o.baseUrl);
  const page0 = await ctx.newPage();
  const t0 = new TapCounter(page0);
  try {
    // Seed 2 messages server-side (setup, not taps) before the UI run.
    // ntfy rate-limits rapid publishes: pace + retry on 429.
    for (const n of [1, 2]) {
      let ok = false;
      for (let a = 0; a < 4 && !ok; a++) {
        const r = await fetch(`${o.baseUrl.replace(/\/$/, "")}/${o.topic}`, {
          method: "POST",
          body: `trial message ${n}`,
        });
        ok = r.ok;
        if (!ok && r.status === 429) await page0.waitForTimeout(2000);
        else if (!ok) throw new Error(`seed publish failed: ${r.status}`);
      }
      if (!ok) throw new Error("seed publish failed: 429 persistent");
      await page0.waitForTimeout(1500);
    }
  } catch (e) {
    await ctx.close();
    return { ...base(o, t0), durationMs: Date.now() - started, oraclePass: false, detail: `error: ${(e as Error).message.slice(0, 500)}` };
  }
  await page0.close();
  const page = await ctx.newPage();
  const t = new TapCounter(page);
  try {
    await page.goto(o.baseUrl, { waitUntil: "domcontentloaded" });
    await subscribeUI(t, o.topic);
    await page.getByText(/trial message 2/i).first().waitFor({ timeout: 30000 });
    await openTopicMenu(t, o.topic);
    const clearItem = page.getByRole("menuitem", { name: /clear all notifications/i });
    if ((await clearItem.count()) === 0) {
      return { ...base(o, t), durationMs: Date.now() - started, oraclePass: false, detail: "clear menuitem absent" };
    }
    await t.clickLocator(clearItem.first());
    // Variant O3 shows a type-to-confirm dialog; baseline clears immediately.
    const confirmInput = page.getByRole("dialog").getByLabel(/topic name confirmation/i);
    try {
      if (await confirmInput.first().isVisible({ timeout: 2500 })) {
        await t.fill(confirmInput.first(), o.topic);
        await t.clickLocator(page.getByRole("dialog").getByRole("button", { name: /clear everything/i }));
      }
    } catch {
      /* baseline: no confirm dialog */
    }
    await page.getByText(/haven't received any notifications/i).first().waitFor({ timeout: 10000 });
    // Clear marks rows deleted=1 rather than removing them: oracle counts
    // non-deleted records for the topic.
    const notifs = (await readStore(page, "notifications")) as {
      subscriptionId: string;
      deleted?: number;
    }[];
    const mine = notifs.filter((n) => n.subscriptionId === subId(o.baseUrl, o.topic) && !n.deleted);
    const detail = `visible notifications for topic: ${mine.length}`;
    return { ...base(o, t), durationMs: Date.now() - started, oraclePass: mine.length === 0, detail };
  } catch (e) {
    return { ...base(o, t), durationMs: Date.now() - started, oraclePass: false, detail: `error: ${(e as Error).message.slice(0, 500)}` };
  } finally {
    await ctx.close();
  }
}

export async function probeD4(browser: Browser, o: ProbeOpts): Promise<ProbeResult> {
  const started = Date.now();
  const ctx = await freshContext(browser, o.baseUrl);
  const page = await ctx.newPage();
  const t = new TapCounter(page);
  try {
    await page.goto(o.baseUrl, { waitUntil: "domcontentloaded" });
    await dismissBannerIfPresent(t);
    await t.clickLocator(page.getByRole("button", { name: "Settings" }));
    await page.getByText("Delete notifications").first().waitFor({ timeout: 10000 });
    // Open the delete-after combobox (role=combobox; the "After one week"
    // text also appears in the row description, so text matching is ambiguous).
    const combo = page.locator('div[role="combobox"]', { hasText: "After one week" });
    if ((await combo.count()) === 0) {
      return { ...base(o, t), durationMs: Date.now() - started, oraclePass: false, detail: "delete-after control absent" };
    }
    await t.clickLocator(combo.first());
    const opt = page.getByRole("option", { name: /after three hours/i });
    const optCount = await opt.count().catch(() => 0);
    if (optCount === 0) {
      // Fallback: raw option elements, ignoring hidden ones (an overlay
      // that hides an option removes it from the a11y tree but not the DOM).
      const raw = await page.evaluate(() =>
        [...document.querySelectorAll("[role='option'], option, li[data-value]")]
          .filter((e) => {
            const h = e as HTMLElement;
            return h.style.display !== "none" && h.offsetParent !== null;
          })
          .map((e) => e.textContent?.trim() ?? "")
          .filter(Boolean),
      );
      if (!raw.some((x) => /three hours/i.test(x))) {
        return { ...base(o, t), durationMs: Date.now() - started, oraclePass: false, detail: `three-hour option absent; options=[${raw.join("|")}]` };
      }
    }
    await t.clickLocator(opt.first());
    await page.waitForTimeout(1000);
    const pref = await page.evaluate(() => {
      try {
        return JSON.parse(localStorage.getItem("prefcache") ?? "{}").deleteAfter;
      } catch {
        return "unparseable";
      }
    });
    const detail = `deleteAfter=${pref}`;
    return { ...base(o, t), durationMs: Date.now() - started, oraclePass: pref === 10800, detail };
  } catch (e) {
    return { ...base(o, t), durationMs: Date.now() - started, oraclePass: false, detail: `error: ${(e as Error).message.slice(0, 500)}` };
  } finally {
    await ctx.close();
  }
}

function base(o: ProbeOpts, t: TapCounter): ProbeRun {
  return { variant: o.variant, decision: o.decision, rep: o.rep, taps: t.taps, oraclePass: false };
}

export async function runProbe(browser: Browser, o: ProbeOpts): Promise<ProbeResult> {
  switch (o.decision) {
    case "D1":
      return probeD1(browser, o);
    case "D2":
      return probeD2(browser, o);
    case "D3":
      return probeD3(browser, o);
    case "D4":
      return probeD4(browser, o);
  }
  await sleep(0);
  throw new Error(`unknown decision ${o.decision}`);
}
