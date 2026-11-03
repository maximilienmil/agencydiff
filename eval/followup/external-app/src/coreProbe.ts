/**
 * Core-compatible instrumented probes for the external-app pilot.
 *
 * Interaction logic mirrors src/probe.ts step for step (same selectors,
 * same waits, same settle timeouts, same frozen oracle predicates) so the
 * recorded cost stays comparable tap-for-tap. The difference is purely
 * evidential: every tap is recorded as a real core `Action` with measured
 * viewport coordinates, every step carries a real screenshot file, and the
 * run assembles a spec-compliant core `Trace` (runner persistence layout:
 * one directory per trace holding trace.json + NNN.png shots).
 *
 * Deliberate adapter choices (all disclosed in RESULTS.md):
 * - One effortful core Action per pilot tap: click -> {click,x,y},
 *   fill -> {type,text}. Waits and settles are free, as in core metrics.
 * - Tags are always []: ntfy exposes no data-agency instrumentation, so
 *   discoveryStep/initiallyVisible stay undefined and no visibility
 *   finding can fire from core on this target.
 * - `screen` is omitted: ntfy exposes no data-screen labels, so
 *   navigationDepth falls back to URL and is 0 on every trace.
 * - probe.ts's openTopicMenu passes `{button:"right"}` to a helper that
 *   only forwards `timeout`, so the frozen behaviour is a plain
 *   left-click; the adapter records exactly that (no invented right-click).
 * - D1's oracle predicate holds vacuously on the initial observation
 *   (fresh profile has no subscriptions AND shows the empty state), so
 *   firstSatisfiedStep/actionsToSatisfy are {0,0} for D1. Retained as-is;
 *   round-trip cost lives in actionCount, as in the frozen rule.
 */
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { firstSatisfaction } from "../../../../packages/core/src/metrics.js";
import type {
  Action,
  Observation,
  Trace,
  TraceStep,
  Variant,
} from "../../../../packages/core/src/types.js";
import { type Browser, type Locator, type Page } from "playwright";
import type { ProbeOpts } from "./probe.js";

export const CORE_DECISION = "ntfy-choice-protection";

export type Decision = "D1" | "D2" | "D3" | "D4";

export interface CoreProbeOpts extends ProbeOpts {
  /** Directory holding one sub-directory per trace (runner layout). */
  tracesDir: string;
  /** Label prefix for topic names (must differ from other phases). */
  label: string;
  /**
   * Attempt suffix for the trace directory (`<traceId><attemptSuffix>`).
   * Retries write to their own directory so flake screenshots are never
   * overwritten; the runner renames the accepted attempt to the canonical
   * `<traceId>` directory afterwards. The trace id itself stays canonical.
   */
  attemptSuffix?: string;
}

export interface CoreProbeResult {
  trace: Trace;
  dir: string;
  taps: number;
  oraclePass: boolean;
  detail: string;
  durationMs: number;
}

export function toCoreVariant(variant: string): Variant {
  return variant === "baseline" ? "baseline" : "candidate";
}

export function traceIdFor(decision: Decision, variant: string, rep: number): string {
  return `${CORE_DECISION}.${decision}.${variant}.${rep}`;
}

/**
 * Promote one attempt's directory to the canonical `<traceId>` directory.
 * Rejected attempts keep their `<traceId>.attempt<N>` directories, so flake
 * screenshots are retained on disk instead of being overwritten.
 */
export async function acceptAttempt(tracesDir: string, id: string, accepted: number): Promise<string> {
  const canonical = path.join(tracesDir, id);
  await rm(canonical, { recursive: true, force: true });
  await rename(path.join(tracesDir, `${id}.attempt${accepted}`), canonical);
  return canonical;
}

interface AppState {
  prefCache: unknown;
  subscriptions: unknown[];
  notifications: unknown[];
}

async function readState(page: Page): Promise<AppState> {
  const prefCache = await page
    .evaluate(() => {
      try {
        return JSON.parse(localStorage.getItem("prefcache") ?? "{}");
      } catch {
        return "unparseable";
      }
    })
    .catch(() => "unreadable");
  const subscriptions = await page
    .evaluate(
      () =>
        new Promise<unknown[]>((resolve) => {
          try {
            const req = indexedDB.open("ntfy");
            req.onsuccess = () => {
              const db = req.result;
              if (!db.objectStoreNames.contains("subscriptions")) return resolve([]);
              const tx = db.transaction("subscriptions", "readonly");
              const all = tx.objectStore("subscriptions").getAll();
              all.onsuccess = () => resolve((all.result as unknown[]).slice(0, 50));
              all.onerror = () => resolve([]);
            };
            req.onerror = () => resolve([]);
          } catch {
            resolve([]);
          }
        }),
    )
    .catch(() => []);
  const notifications = await page
    .evaluate(
      () =>
        new Promise<unknown[]>((resolve) => {
          try {
            const req = indexedDB.open("ntfy");
            req.onsuccess = () => {
              const db = req.result;
              if (!db.objectStoreNames.contains("notifications")) return resolve([]);
              const tx = db.transaction("notifications", "readonly");
              const all = tx.objectStore("notifications").getAll();
              all.onsuccess = () => resolve((all.result as unknown[]).slice(0, 60));
              all.onerror = () => resolve([]);
            };
            req.onerror = () => resolve([]);
          } catch {
            resolve([]);
          }
        }),
    )
    .catch(() => []);
  return { prefCache, subscriptions, notifications };
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

function subId(baseUrl: string, topic: string) {
  return `${baseUrl.replace(/\/$/, "")}/${topic}`;
}

/**
 * Records one pilot tap as one core step: measures the element's real
 * viewport box, performs the real interaction, captures a real screenshot,
 * then evaluates the decision's live oracle predicate (a real observation,
 * retained as the step's satisfaction flag).
 */
class Tracer {
  shotN = 0;
  steps: TraceStep[] = [];
  flags: boolean[] = [];
  taps = 0;

  constructor(
    readonly page: Page,
    readonly dir: string,
    readonly t0: number,
    readonly satisfy: () => Promise<boolean>,
  ) {}

  async snap(): Promise<Observation> {
    const file = `${String(this.shotN).padStart(3, "0")}.png`;
    this.shotN += 1;
    await this.page.screenshot({ path: path.join(this.dir, file) });
    return { url: this.page.url(), tags: [], screenshot: file };
  }

  private async record(actions: Action[], note: string): Promise<void> {
    const after = await this.snap();
    const step: TraceStep = {
      index: this.steps.length,
      tMs: Date.now() - this.t0,
      actions,
      after,
      note,
    };
    this.steps.push(step);
    let sat = false;
    try {
      sat = await this.satisfy();
    } catch {
      sat = false;
    }
    this.flags.push(sat);
    this.taps += actions.filter((a) =>
      ["click", "double_click", "drag", "keypress", "scroll", "type"].includes(a.type),
    ).length;
  }

  /** Real click at the measured center of the element's live box. */
  async clickLoc(loc: Locator, note: string, opts?: { timeout?: number }): Promise<void> {
    const first = loc.first();
    let box = await first.boundingBox().catch(() => null);
    if (!box) {
      await first.scrollIntoViewIfNeeded().catch(() => undefined);
      box = await first.boundingBox().catch(() => null);
    }
    if (!box) throw new Error(`no visible box for ${note}`);
    const action: Action = {
      type: "click",
      x: Math.round(box.x + box.width / 2),
      y: Math.round(box.y + box.height / 2),
    };
    await first.click({ timeout: opts?.timeout ?? 8000 });
    await this.record([action], note);
  }

  /** Real fill, recorded as one type action (one unit of user effort). */
  async fillLoc(loc: Locator, text: string, note: string): Promise<void> {
    await loc.first().fill(text);
    const action: Action = { type: "type", text };
    await this.record([action], note);
  }
}

async function dismissBannerIfPresent(t: Tracer) {
  await t.page.waitForTimeout(1500);
  const close = t.page.getByRole("button", { name: "Close" }).first();
  try {
    if (await close.isVisible({ timeout: 1000 })) await t.clickLoc(close, "dismiss first-run banner");
  } catch {
    /* banner absent: zero taps */
  }
}

async function subscribeUI(t: Tracer, topic: string) {
  await dismissBannerIfPresent(t);
  await t.clickLoc(t.page.getByRole("button", { name: "Subscribe to topic" }), "open subscribe dialog");
  await t.fillLoc(t.page.getByPlaceholder(/Topic name/), topic, "fill topic name");
  await t.page.waitForTimeout(400);
  const dlg = t.page.getByRole("dialog");
  await t.clickLoc(dlg.getByRole("button").last(), "confirm subscribe");
  await t.page.getByRole("button", { name: topic }).first().waitFor({ timeout: 30000 });
}

async function openTopicMenu(t: Tracer, topic: string) {
  const row = t.page.getByRole("button", { name: topic }).first();
  await row.waitFor({ timeout: 30000 });
  const inner = row.locator("button");
  if ((await inner.count()) > 0) {
    await t.clickLoc(inner.first(), "open topic menu");
  } else {
    // Frozen probe passes {button:"right"} here, but its helper only
    // forwards `timeout`, so the frozen behaviour is a plain left-click.
    await t.clickLoc(row, "open topic menu (row click)");
  }
  await t.page.getByRole("menu").waitFor({ timeout: 8000 });
}

function freshContext(browser: Browser, baseUrl: string) {
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

interface RunState {
  t: Tracer;
  dir: string;
  t0: number;
  startedAt: string;
  initialSatisfied: boolean;
  initialState: AppState;
  initialObs: Observation;
}

async function beginRun(
  browser: Browser,
  o: CoreProbeOpts,
  satisfy: (page: Page) => () => Promise<boolean>,
): Promise<{ ctx: import("playwright").BrowserContext; page: Page; st: RunState }> {
  const dir = path.join(o.tracesDir, traceIdFor(o.decision, o.variant, o.rep) + (o.attemptSuffix ?? ""));
  await mkdir(dir, { recursive: true });
  const t0 = Date.now();
  const ctx = await freshContext(browser, o.baseUrl);
  const page = await ctx.newPage();
  await page.goto(o.baseUrl, { waitUntil: "domcontentloaded" });
  const t = new Tracer(page, dir, t0, satisfy(page));
  const initialObs = await t.snap();
  const initialState = await readState(page);
  let initialSatisfied = false;
  try {
    initialSatisfied = await t.satisfy();
  } catch {
    initialSatisfied = false;
  }
  return { ctx, page, st: { t, dir, t0, startedAt: new Date(t0).toISOString(), initialSatisfied, initialState, initialObs } };
}

async function finishRun(
  o: CoreProbeOpts,
  page: Page,
  st: RunState,
  outcome: { oraclePass: boolean; detail: string; stoppedReason: Trace["stoppedReason"]; error?: string },
  durationMs: number,
): Promise<CoreProbeResult> {
  const finalState = await readState(page).catch(
    (): AppState => ({ prefCache: "unreadable", subscriptions: [], notifications: [] }),
  );
  const satisfaction = firstSatisfaction(st.t.steps, {
    initialSatisfied: st.initialSatisfied,
    satisfiedFlags: st.t.flags,
    finalPassed: outcome.oraclePass,
  });
  const trace: Trace = {
    id: traceIdFor(o.decision, o.variant, o.rep),
    decision: CORE_DECISION,
    intentId: o.decision,
    variant: toCoreVariant(o.variant),
    repeat: o.rep,
    driver: { kind: "scripted" },
    startedAt: st.startedAt,
    initial: { state: { ...st.initialState } as Record<string, unknown>, observation: st.initialObs },
    steps: st.t.steps,
    final: { state: { ...finalState } as Record<string, unknown> },
    oracle: { checked: true, passed: outcome.oraclePass },
    stoppedReason: outcome.stoppedReason,
    ...(outcome.error ? { error: outcome.error } : {}),
    ...satisfaction,
  };
  await writeFile(path.join(st.dir, "trace.json"), JSON.stringify(trace, null, 2));
  return {
    trace,
    dir: st.dir,
    taps: st.t.taps,
    oraclePass: outcome.oraclePass,
    detail: outcome.detail,
    durationMs,
  };
}

export async function coreProbeD1(browser: Browser, o: CoreProbeOpts): Promise<CoreProbeResult> {
  const started = Date.now();
  const satisfy = (page: Page) => async () => {
    const subs = (await readStore(page, "subscriptions")) as { topic: string }[];
    if (subs.some((s) => s.topic === o.topic)) return false;
    const heading = page.getByRole("heading", { name: /no subscriptions yet|don't have any subscriptions/i });
    return ((await heading.count().catch(() => 0)) ?? 0) > 0;
  };
  const { ctx, page, st } = await beginRun(browser, o, satisfy);
  try {
    await subscribeUI(st.t, o.topic);
    await openTopicMenu(st.t, o.topic);
    const unsub = page.getByRole("menuitem", { name: "Unsubscribe" });
    if ((await unsub.count()) === 0) {
      return await finishRun(o, page, st, {
        oraclePass: false,
        detail: "Unsubscribe menuitem absent",
        stoppedReason: "error",
        error: "Unsubscribe menuitem absent",
      }, Date.now() - started);
    }
    await st.t.clickLoc(unsub.first(), "unsubscribe from topic");
    await page.getByRole("heading", { name: /no subscriptions yet|don't have any subscriptions/i }).waitFor({ timeout: 10000 });
    const subs = (await readStore(page, "subscriptions")) as { topic: string; baseUrl: string }[];
    const mine = subs.filter((s) => s.topic === o.topic);
    return await finishRun(o, page, st, {
      oraclePass: mine.length === 0,
      detail: `subscriptions for topic: ${mine.length}`,
      stoppedReason: "script_done",
    }, Date.now() - started);
  } catch (e) {
    return await finishRun(o, page, st, {
      oraclePass: false,
      detail: `error: ${(e as Error).message.slice(0, 500)}`,
      stoppedReason: "error",
      error: (e as Error).message.slice(0, 500),
    }, Date.now() - started);
  } finally {
    await ctx.close();
  }
}

export async function coreProbeD2(browser: Browser, o: CoreProbeOpts): Promise<CoreProbeResult> {
  const started = Date.now();
  const satisfy = (page: Page) => async () => {
    const subs = (await readStore(page, "subscriptions")) as { topic: string; mutedUntil: number }[];
    const mine = subs.find((s) => s.topic === o.topic);
    if (!mine || !(mine.mutedUntil > 0)) return false;
    const badge = await page.locator('[aria-label*="muted" i], [title*="muted" i]').count().catch(() => 0);
    return badge > 0;
  };
  const { ctx, page, st } = await beginRun(browser, o, satisfy);
  try {
    await subscribeUI(st.t, o.topic);
    await openTopicMenu(st.t, o.topic);
    const muteItem = page.getByRole("menuitem", { name: /^(mute|unmute) notifications$/i });
    if ((await muteItem.count()) === 0) {
      return await finishRun(o, page, st, {
        oraclePass: false,
        detail: "mute menuitem absent",
        stoppedReason: "error",
        error: "mute menuitem absent",
      }, Date.now() - started);
    }
    await st.t.clickLoc(muteItem.first(), "mute notifications");
    const confirmBtn = page.getByRole("button", { name: /mute anyway/i });
    try {
      if (await confirmBtn.first().isVisible({ timeout: 2500 })) {
        await st.t.clickLoc(confirmBtn.first(), "confirm mute");
      }
    } catch {
      /* baseline: no confirm dialog */
    }
    await page.waitForTimeout(1500);
    const subs = (await readStore(page, "subscriptions")) as { topic: string; mutedUntil: number }[];
    const mine = subs.find((s) => s.topic === o.topic);
    const badge = await page.locator('[aria-label*="muted" i], [title*="muted" i]').count().catch(() => 0);
    return await finishRun(o, page, st, {
      oraclePass: !!mine && mine.mutedUntil > 0 && badge > 0,
      detail: `mutedUntil=${mine?.mutedUntil ?? "missing"} badge=${badge}`,
      stoppedReason: "script_done",
    }, Date.now() - started);
  } catch (e) {
    return await finishRun(o, page, st, {
      oraclePass: false,
      detail: `error: ${(e as Error).message.slice(0, 500)}`,
      stoppedReason: "error",
      error: (e as Error).message.slice(0, 500),
    }, Date.now() - started);
  } finally {
    await ctx.close();
  }
}

export async function coreProbeD3(browser: Browser, o: CoreProbeOpts): Promise<CoreProbeResult> {
  const started = Date.now();
  const satisfy = (page: Page) => async () => {
    const notifs = (await readStore(page, "notifications")) as { subscriptionId: string; deleted?: number }[];
    const mine = notifs.filter((n) => n.subscriptionId === subId(o.baseUrl, o.topic) && !n.deleted);
    if (mine.length !== 0) return false;
    const empty = page.getByText(/haven't received any notifications/i);
    return ((await empty.count().catch(() => 0)) ?? 0) > 0;
  };
  const seedCtx = await freshContext(browser, o.baseUrl);
  const page0 = await seedCtx.newPage();
  try {
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
    await seedCtx.close();
    return {
      trace: emptyTrace(o, started, (e as Error).message.slice(0, 500)),
      dir: path.join(o.tracesDir, traceIdFor(o.decision, o.variant, o.rep) + (o.attemptSuffix ?? "")),
      taps: 0,
      oraclePass: false,
      detail: `error: ${(e as Error).message.slice(0, 500)}`,
      durationMs: Date.now() - started,
    };
  }
  await page0.close();
  await seedCtx.close();
  const { ctx, page, st } = await beginRun(browser, o, satisfy);
  try {
    await subscribeUI(st.t, o.topic);
    await page.getByText(/trial message 2/i).first().waitFor({ timeout: 30000 });
    await openTopicMenu(st.t, o.topic);
    const clearItem = page.getByRole("menuitem", { name: /clear all notifications/i });
    if ((await clearItem.count()) === 0) {
      return await finishRun(o, page, st, {
        oraclePass: false,
        detail: "clear menuitem absent",
        stoppedReason: "error",
        error: "clear menuitem absent",
      }, Date.now() - started);
    }
    await st.t.clickLoc(clearItem.first(), "clear all notifications");
    const confirmInput = page.getByRole("dialog").getByLabel(/topic name confirmation/i);
    try {
      if (await confirmInput.first().isVisible({ timeout: 2500 })) {
        await st.t.fillLoc(confirmInput.first(), o.topic, "type topic name confirmation");
        await st.t.clickLoc(page.getByRole("dialog").getByRole("button", { name: /clear everything/i }), "confirm clear");
      }
    } catch {
      /* baseline: no confirm dialog */
    }
    await page.getByText(/haven't received any notifications/i).first().waitFor({ timeout: 10000 });
    const notifs = (await readStore(page, "notifications")) as { subscriptionId: string; deleted?: number }[];
    const mine = notifs.filter((n) => n.subscriptionId === subId(o.baseUrl, o.topic) && !n.deleted);
    return await finishRun(o, page, st, {
      oraclePass: mine.length === 0,
      detail: `visible notifications for topic: ${mine.length}`,
      stoppedReason: "script_done",
    }, Date.now() - started);
  } catch (e) {
    return await finishRun(o, page, st, {
      oraclePass: false,
      detail: `error: ${(e as Error).message.slice(0, 500)}`,
      stoppedReason: "error",
      error: (e as Error).message.slice(0, 500),
    }, Date.now() - started);
  } finally {
    await ctx.close();
  }
}

export async function coreProbeD4(browser: Browser, o: CoreProbeOpts): Promise<CoreProbeResult> {
  const started = Date.now();
  const satisfy = (page: Page) => async () =>
    (await page
      .evaluate(() => {
        try {
          return JSON.parse(localStorage.getItem("prefcache") ?? "{}").deleteAfter;
        } catch {
          return "unparseable";
        }
      })
      .catch(() => "unreadable")) === 10800;
  const { ctx, page, st } = await beginRun(browser, o, satisfy);
  try {
    await dismissBannerIfPresent(st.t);
    await st.t.clickLoc(page.getByRole("button", { name: "Settings" }), "open settings");
    await page.getByText("Delete notifications").first().waitFor({ timeout: 10000 });
    const combo = page.locator('div[role="combobox"]', { hasText: "After one week" });
    if ((await combo.count()) === 0) {
      return await finishRun(o, page, st, {
        oraclePass: false,
        detail: "delete-after control absent",
        stoppedReason: "error",
        error: "delete-after control absent",
      }, Date.now() - started);
    }
    await st.t.clickLoc(combo.first(), "open delete-after options");
    const opt = page.getByRole("option", { name: /after three hours/i });
    const optCount = await opt.count().catch(() => 0);
    if (optCount === 0) {
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
        return await finishRun(o, page, st, {
          oraclePass: false,
          detail: `three-hour option absent; options=[${raw.join("|")}]`,
          stoppedReason: "error",
          error: "three-hour option absent",
        }, Date.now() - started);
      }
    }
    await st.t.clickLoc(opt.first(), "pick after three hours");
    await page.waitForTimeout(1000);
    const pref = await page.evaluate(() => {
      try {
        return JSON.parse(localStorage.getItem("prefcache") ?? "{}").deleteAfter;
      } catch {
        return "unparseable";
      }
    });
    return await finishRun(o, page, st, {
      oraclePass: pref === 10800,
      detail: `deleteAfter=${pref}`,
      stoppedReason: "script_done",
    }, Date.now() - started);
  } catch (e) {
    return await finishRun(o, page, st, {
      oraclePass: false,
      detail: `error: ${(e as Error).message.slice(0, 500)}`,
      stoppedReason: "error",
      error: (e as Error).message.slice(0, 500),
    }, Date.now() - started);
  } finally {
    await ctx.close();
  }
}

function emptyTrace(o: CoreProbeOpts, started: number, error: string): Trace {
  return {
    id: traceIdFor(o.decision, o.variant, o.rep),
    decision: CORE_DECISION,
    intentId: o.decision,
    variant: toCoreVariant(o.variant),
    repeat: o.rep,
    driver: { kind: "scripted" },
    startedAt: new Date(started).toISOString(),
    initial: { observation: { url: o.baseUrl, tags: [], screenshot: "" } },
    steps: [],
    final: {},
    oracle: { checked: true, passed: false },
    stoppedReason: "error",
    error,
  };
}

export async function runCoreProbe(browser: Browser, o: CoreProbeOpts): Promise<CoreProbeResult> {
  switch (o.decision) {
    case "D1":
      return coreProbeD1(browser, o);
    case "D2":
      return coreProbeD2(browser, o);
    case "D3":
      return coreProbeD3(browser, o);
    case "D4":
      return coreProbeD4(browser, o);
  }
}
