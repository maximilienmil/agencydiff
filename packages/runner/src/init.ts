// `agencydiff init --url <url> ...`: explore a web app read-only, draft an
// Agency Contract per consequential Decision, validate it k=1, and write the
// contract plus a human review summary. Exploration always runs with the
// audit guard on: submits, credentials and purchase navigation are refused
// at the browser layer, and nothing is ever typed.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { checkDomAssertions, type AgencyContract } from "@agencydiff/core";
import { MuseDriver } from "./drivers.js";
import { BrowserEnv } from "./env.js";
import {
  applyValidation,
  draftContracts,
  isGrounded,
  normalizeModelContracts,
  renderInitReview,
  type Exploration,
  type InitScreen,
  type ValidationOutcome,
} from "./initLib.js";
import { runProbe } from "./probe.js";

const ROOT = path.resolve(import.meta.dirname, "../../..");

// --- DOM census ----------------------------------------------------------

interface CensusControl {
  selector: string;
  tag?: string;
  kind: "button" | "link" | "toggle" | "field" | "other";
  text: string;
  checked?: boolean;
  covered?: boolean;
  value?: string;
  inputType?: string;
  href?: string;
  target?: string;
}

interface Census {
  screen: string;
  title: string;
  text: string;
  controls: CensusControl[];
}

/** Visible interactive controls plus the screen's text, read in-page. */
// The callback stays arrow-only: the tsx loader breaks named functions here.
export async function collectCensus(page: BrowserEnv["page"]): Promise<Census> {
  // Single flat arrow with no nested function declarations: like env.ts,
  // only inline callbacks passed straight to array methods survive the
  // loader's serialization into the browser.
  return page.evaluate(() => {
    const scope = [
      ...document.querySelectorAll('a[href], button, input, select, textarea, [role="button"], [data-agency]'),
    ];
    const controls: CensusControl[] = [];
    for (const el of scope) {
      const html = el as HTMLElement;
      const tag = el.tagName.toLowerCase();
      if (tag === "input" && (el as HTMLInputElement).type === "hidden") continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") continue;
      const role = el.getAttribute("role");
      const type = (el as HTMLInputElement).type;
      const lowType = type ? type.toLowerCase() : "";
      const kind =
        lowType === "checkbox" || lowType === "radio" || lowType === "switch" || role === "switch"
          ? "toggle"
          : tag === "a"
            ? "link"
            : tag === "input" || tag === "select" || tag === "textarea"
              ? "field"
              : tag === "button" || role === "button" || !!html.dataset.agency
                ? "button"
                : "other";
      const aria = el.getAttribute("aria-label") ?? "";
      let text: string;
      if (tag === "input" || tag === "select" || tag === "textarea") {
        const f = el as HTMLInputElement;
        text = aria || f.getAttribute("placeholder") || f.getAttribute("name") || "";
      } else {
        text = html.innerText || aria;
      }
      text = text.replace(/\s+/g, " ").trim().slice(0, 120);
      if (kind === "field" && !text) continue;
      const value =
        kind === "field" ? ((el as HTMLInputElement).value ?? "").slice(0, 120) : undefined;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const top =
        cx >= 0 && cy >= 0 && cx < window.innerWidth && cy < window.innerHeight
          ? document.elementFromPoint(cx, cy)
          : null;
      const covered = !!top && !(el === top || el.contains(top) || (top as Element).contains(el));
      let selector: string;
      if (html.dataset.agency) {
        selector = `[data-agency="${html.dataset.agency}"]`;
      } else if (el.id) {
        selector = `#${CSS.escape(el.id)}`;
      } else if (aria) {
        selector = `${tag}[aria-label="${CSS.escape(aria)}"]`;
      } else if (el.getAttribute("name")) {
        selector = `${tag}[name="${CSS.escape(el.getAttribute("name") ?? "")}"]`;
      } else {
        const parts: string[] = [];
        let cur: Element | null = el;
        let depth = 0;
        while (cur && cur !== document.body && depth < 6) {
          let idx = 1;
          let sib = cur.previousElementSibling;
          while (sib) {
            if (sib.tagName === cur.tagName) idx += 1;
            sib = sib.previousElementSibling;
          }
          parts.unshift(`${cur.tagName.toLowerCase()}:nth-of-type(${idx})`);
          cur = cur.parentElement;
          depth += 1;
        }
        parts.unshift("body");
        selector = parts.join(" > ");
      }
      const href = tag === "a" ? el.getAttribute("href") : null;
      controls.push({
        selector,
        tag: html.dataset.agency || undefined,
        kind: kind as CensusControl["kind"],
        text,
        checked: kind === "toggle" ? !!(el as HTMLInputElement).checked : undefined,
        covered: covered || undefined,
        value: value || undefined,
        inputType: kind === "field" ? lowType || undefined : undefined,
        href: href || undefined,
        target: tag === "a" ? el.getAttribute("target") || undefined : undefined,
      });
    }
    const screenEl = document.querySelector("[data-screen]") as HTMLElement | null;
    return {
      screen: screenEl && screenEl.dataset.screen ? screenEl.dataset.screen : "",
      title: document.title,
      text: ((document.body as HTMLElement).innerText ?? "").replace(/[ \t]+/g, " ").slice(0, 4000),
      controls,
    };
  });
}

/** Expansion order: instrumented (`data-agency`) navigation first, then
 *  other navigation-like controls; toggles sort last because they usually
 *  only flip state in place instead of opening new screens. */
function navRank(c: CensusControl): number {
  if (c.kind === "toggle") return 3;
  if (c.tag) return 0;
  if (c.kind === "link") return 1;
  if (/›|→|>|more|settings|options|manage|details$/i.test(c.text)) return 1;
  return 2;
}

/** Back buttons only return to a recorded screen, so the crawl skips them. */
function isBackAffordance(tag: string | undefined, text: string): boolean {
  if (tag && /(^|\.)back$/.test(tag)) return true;
  return /^(‹|←|back|‹ back|go back)$/i.test(text.trim());
}

function screenKey(c: Census, url: string): string {
  if (c.screen) return c.screen;
  try {
    const u = new URL(url);
    return `${c.title || u.pathname || "home"}`;
  } catch {
    return c.title || "home";
  }
}

// --- Audit-guarded census crawl ------------------------------------------

export interface CrawlOpts {
  maxSteps?: number;
  outDir?: string;
}

/** Systematic read-only exploration: breadth-first clicks through the app
 *  with the audit guard on, replaying each path from a fresh load so every
 *  visit starts from identical state. Deterministic and offline. */
export async function crawlExploration(url: string, opts?: CrawlOpts): Promise<Exploration> {
  const maxSteps = opts?.maxSteps ?? 40;
  const dir = opts?.outDir ?? path.join(ROOT, "runs", `init-crawl-${Date.now()}`);
  const env = await BrowserEnv.open(url, dir, { audit: true });
  // Local-only exploration: arrivals off the entry origin are never
  // recorded or followed. (`data:` entries have a `null` origin and skip
  // the check.)
  const entryOrigin = new URL(url).origin;
  const sameOrigin = (pageUrl: string): boolean =>
    entryOrigin === "null" || new URL(pageUrl).origin === entryOrigin;
  const screens = new Map<string, InitScreen>();
  const seenPaths = new Set<string>([""]);
  const queue: { path: string[]; rank: number }[] = [{ path: [], rank: 0 }];
  let steps = 0;

  const clickAt = async (sel: string): Promise<void> => {
    const box = await env.page.locator(sel).first().boundingBox({ timeout: 3000 }).catch(() => null);
    if (!box) throw new Error(`crawl control gone: ${sel}`);
    await env.execute([
      { type: "click", x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) },
    ]);
  };

  const visit = async (clickPath: string[]): Promise<{ census: Census; key: string }> => {
    await env.page.goto(url, { waitUntil: "networkidle" });
    // Settle before clicking too: replayed clicks otherwise land on the
    // pre-hydration DOM and silently miss (ntfy's drawer never opened).
    await env.page.waitForTimeout(1000);
    for (const sel of clickPath) {
      await clickAt(sel);
      // Let transitions (drawer slides, dialogs) land before the next click.
      await env.page.waitForTimeout(300);
    }
    // ... and after the last click, for overlays and late controls.
    // Discovery text is restored by the caller (ensurePrefill), which knows
    // the arrival screen's record.
    await env.page.waitForTimeout(750);
    const census = await collectCensus(env.page);
    return { census, key: screenKey(census, env.page.url()) };
  };

  /** Untagged controls re-render under shifting positional selectors
   *  (drawers, dialogs): collapse same-text dupes so each logical control
   *  expands once. Tagged controls are always kept. */
  const dedupeKey = (c: CensusControl): string => c.tag ?? `${c.kind}|${c.text}`;
  const mergeControls = (rec: InitScreen, controls: CensusControl[]): CensusControl[] => {
    const known = new Set(rec.controls.map((c) => c.selector));
    const seen = new Set(rec.controls.map(dedupeKey));
    const fresh: CensusControl[] = [];
    for (const c of controls) {
      if (known.has(c.selector)) continue;
      const k = dedupeKey(c);
      if (!c.tag && seen.has(k)) continue;
      seen.add(k);
      rec.controls.push({ ...c });
      known.add(c.selector);
      fresh.push(c);
    }
    return fresh;
  };

  /** Fill the screen's single empty text field with discovery text, once per
   *  visit. Multi-field screens (logins) are left alone, and the audit guard
   *  still refuses credential fields. Returns a fresh census when text was
   *  typed, else null. */
  const ensurePrefill = async (rec: InitScreen, applied: Set<string>): Promise<Census | null> => {
    if (applied.has(rec.key)) return null;
    const fields = rec.controls.filter(
      (c) => c.kind === "field" && (c.value ?? "") === "" && ["text", "search"].includes(c.inputType ?? "text"),
    );
    const buttons = rec.controls.filter((c) => c.kind === "button" && !c.covered);
    if (fields.length !== 1 || buttons.length === 0) return null;
    if (!rec.prefill) rec.prefill = { selector: fields[0].selector, text: "test" };
    applied.add(rec.key);
    try {
      const cur = (await collectCensus(env.page)).controls.find((c) => c.selector === rec.prefill!.selector);
      if (cur && (cur.value ?? "") === "") {
        await clickAt(rec.prefill.selector);
        await env.execute([{ type: "type", text: rec.prefill.text }]);
      }
    } catch {
      rec.prefill = undefined;
      return null;
    }
    return collectCensus(env.page);
  };

  /** True when this control can never teach us about the local app. */
  const isDeadEnd = (c: CensusControl): boolean => {
    if (c.kind === "field" || c.covered || isBackAffordance(c.tag, c.text)) return true;
    // External links and new-tab links leave the local app alone. An href
    // that does not resolve (relative link on a data: entry) is unusable.
    if (c.kind === "link") {
      if (c.target === "_blank") return true;
      if (c.href) {
        try {
          if (!sameOrigin(new URL(c.href, url).href)) return true;
        } catch {
          return true;
        }
      }
    }
    return false;
  };

  // Two passes over the same queue: first every screen opener (rank 0-1),
  // then state-flipping controls with whatever budget remains. Eager leaf
  // clicks would otherwise eat the step cap before deep screens are reached.
  const expanded = new Set<string>();
  const drain = async (navOnly: boolean): Promise<void> => {
    while (queue.length > 0 && steps < maxSteps) {
      let take = 0;
      for (let i = 1; i < queue.length; i++) {
        if (queue[i].rank < queue[take].rank) take = i;
      }
      const clickPath = queue.splice(take, 1)[0].path;
      let arrived: { census: Census; key: string };
      try {
        arrived = await visit(clickPath);
      } catch {
        continue;
      }
      if (!sameOrigin(env.page.url())) continue;
      let { census, key } = arrived;
      let rec = screens.get(key);
      if (!rec) {
        rec = {
          key,
          url: env.page.url(),
          title: census.title,
          text: census.text,
          controls: [],
          transitions: [],
          path: [...clickPath],
        };
        screens.set(key, rec);
      }
      mergeControls(rec, census.controls);
      // One expansion per screen per pass: replays are deterministic from a
      // fresh load, so a second path to the same screen would retry the same
      // controls under longer prefixes and burn the budget.
      const expansionKey = `${navOnly ? "nav" : "all"}:${key}`;
      if (expanded.has(expansionKey)) continue;
      expanded.add(expansionKey);
      const applied = new Set<string>();
      const filled = await ensurePrefill(rec, applied).catch(() => null);
      if (filled) {
        census = filled;
        mergeControls(rec, census.controls);
      }
      // Worklist, not a snapshot: controls revealed mid-visit (drawers,
      // dialogs) join the same visit instead of waiting for a replay. Each
      // entry carries its full click path, including the revealer prefix.
      const pending: { c: CensusControl; path: string[] }[] = census.controls.map((c) => ({
        c,
        path: clickPath,
      }));
      const done = new Set<string>();
      const rankEntry = (a: { c: CensusControl }, b: { c: CensusControl }): number =>
        navRank(a.c) - navRank(b.c);
      pending.sort(rankEntry);
      while (pending.length > 0 && steps < maxSteps) {
        const { c, path: base } = pending.shift()!;
        if (done.has(c.selector)) continue;
        done.add(c.selector);
        if (isDeadEnd(c)) continue;
        if (navOnly && navRank(c) > 1) continue;
        // A transition to an already-recorded screen teaches nothing new.
        const knownTo = rec.transitions?.find((t) => t.selector === c.selector)?.to;
        if (knownTo && screens.has(knownTo)) continue;
        const next = [...base, c.selector];
        const id = next.join("\n");
        if (seenPaths.has(id)) continue;
        seenPaths.add(id);
        let there: { census: Census; key: string };
        try {
          there = await visit(next);
          steps += 1;
        } catch {
          continue;
        }
        if (!sameOrigin(env.page.url())) continue;
        if (there.key !== key) {
          if (!rec.transitions?.some((t) => t.selector === c.selector)) {
            rec.transitions?.push({ selector: c.selector, to: there.key });
          }
          if (!screens.has(there.key)) queue.push({ path: next, rank: navRank(c) });
        } else {
          // Same screen, new controls (drawer, dialog): record and expand
          // them now, while the visit that revealed them is still live.
          // Their replay path extends through this click. New arrivals may
          // complete a single-field screen, so re-check the prefill too.
          const fresh = mergeControls(rec, there.census.controls);
          applied.delete(key);
          const refilled = await ensurePrefill(rec, applied).catch(() => null);
          const extra = refilled ? mergeControls(rec, refilled.controls) : [];
          for (const n of [...fresh, ...extra]) {
            if (!done.has(n.selector)) pending.push({ c: n, path: next });
          }
          pending.sort(rankEntry);
        }
        if (steps >= maxSteps) break;
      }
    }
  };

  try {
    await drain(true);
    // Second pass revisits every recorded screen: leaf controls on early
    // screens were skipped above and would otherwise never get a turn.
    for (const s of screens.values()) {
      queue.push({ path: s.path ?? [], rank: 0 });
    }
    seenPaths.clear();
    await drain(false);
  } finally {
    await env.close();
  }
  return { url, startedAt: new Date().toISOString(), steps, screens: [...screens.values()] };
}

// --- Muse exploration ----------------------------------------------------

export interface MuseExploreOpts {
  apiKey: string;
  model?: string;
  maxSteps?: number;
  outDir?: string;
}

/** One audit-guarded computer-use pass that records the screens it saw.
 *  Control text comes from the instrumented census on the same screens
 *  (the agent itself sees screenshots only). */
export async function museExploration(
  url: string,
  crawl: Exploration,
  opts: MuseExploreOpts,
): Promise<{ screens: string[]; steps: number }> {
  const driver = new MuseDriver({
    apiKey: opts.apiKey,
    model: opts.model ?? process.env.MUSE_MODEL ?? "muse-spark-1.3-contributor",
    audit: true,
    maxSteps: opts.maxSteps ?? 40,
    tolerateBlocked: true,
  });
  const dir = opts.outDir ?? path.join(ROOT, "runs", `init-muse-${Date.now()}`);
  const env = await BrowserEnv.open(url, dir, { audit: true });
  try {
    const initial = await env.observe();
    const result = await driver.run(
      {
        id: "explore",
        goal:
          "Explore this app read-only. Visit every screen, open every settings, privacy, " +
          "notification, subscription and account section, and read what each offers. " +
          "Do not submit any form, enter any credentials, or buy anything.",
        polarity: "neutral",
        mustSucceed: false,
      },
      env,
      Date.now(),
      initial.png,
    );
    const seen = new Set<string>();
    if (initial.observation.screen) seen.add(initial.observation.screen);
    for (const s of result.steps) if (s.after.screen) seen.add(s.after.screen);
    // The crawl is the control record; the Muse pass proves which of its
    // screens a real probe reaches on its own.
    const reached = [...seen].filter((k) => crawl.screens.some((s) => s.key === k));
    return { screens: reached, steps: result.steps.length };
  } finally {
    await env.close();
  }
}

// --- Structured-output draft ---------------------------------------------

export interface ModelDraftOpts {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

/** The single structured-output call: draft contracts from an exploration
 *  record. Anything the model cites that was not observed is repaired to
 *  a needsReview flag, never trusted. */
export async function draftWithModel(
  exploration: Exploration,
  promiseText: string | undefined,
  opts: ModelDraftOpts,
): Promise<{ contracts: AgencyContract[]; repaired: number }> {
  const slim = {
    screens: exploration.screens.map((s) => ({
      key: s.key,
      title: s.title,
      text: s.text.slice(0, 1500),
      controls: s.controls.map((c) => ({
        selector: c.selector,
        tag: c.tag,
        kind: c.kind,
        text: c.text,
      })),
      transitions: s.transitions ?? [],
    })),
  };
  const body = {
    model: opts.model ?? process.env.MUSE_MODEL ?? "muse-spark-1.3-contributor",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              "Draft Agency Contracts from this read-only web-app exploration.",
              "Rules: one contract per consequential decision (privacy, contact, notifications,",
              "subscription/cancel, data sharing, account deletion, time limits). Each decision needs",
              "opposing intent pairs (accept/reject, plus revoke and inspect where they exist),",
              "plain-language goals, and dom oracles built ONLY from the selectors and text below;",
              "every oracle carries the screen key it was observed on. Mark every contract and",
              "intent draft:true.",
              promiseText ? `Product promise: ${promiseText}` : "No product promise was given.",
              "Map each promise sentence to intents; list sentences with no UI match in",
              "unmappedPromises as 'promise not found in product: ...'.",
              "Reply with exactly one JSON array of contracts and no other text.",
              `Exploration: ${JSON.stringify(slim)}`,
            ].join("\n"),
          },
        ],
      },
    ],
  };
  const res = await fetch(`${opts.baseUrl ?? "https://api.meta.ai/v1"}/responses`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${opts.apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Muse draft ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { output?: { content?: { text?: string }[] }[] };
  const text = json.output?.flatMap((o) => o.content ?? []).map((c) => c.text ?? "").join("\n") ?? "";
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const parsed = JSON.parse((fence ? fence[1] : text).trim()) as AgencyContract[];
  const list = Array.isArray(parsed) ? parsed : [parsed];
  const repaired = normalizeModelContracts(list, exploration);
  return { contracts: list, repaired };
}

// --- Validation ----------------------------------------------------------

export interface ValidateOpts {
  outDir: string;
  driver: "muse" | "scripted";
  apiKey?: string;
  model?: string;
}

/** Run every drafted intent k=1 against the same URL with the dom adapter.
 *  Scripted replays the exploration click path (offline, deterministic);
 *  muse sends the real computer-use probe (needs MODEL_API_KEY). */
export async function validateContracts(
  contracts: AgencyContract[],
  exploration: Exploration,
  url: string,
  opts: ValidateOpts,
): Promise<Map<string, ValidationOutcome>> {
  const outcomes = new Map<string, ValidationOutcome>();
  const apiKey = opts.apiKey ?? process.env.MODEL_API_KEY;
  const byScreen = new Map(exploration.screens.map((s) => [s.key, s]));

  for (const contract of contracts) {
    const dir = path.join(opts.outDir, contract.decision);
    for (const intent of contract.intents) {
      const key = `${contract.decision}.${intent.id}`;
      try {
        if (opts.driver === "muse") {
          if (!apiKey) throw new Error("MODEL_API_KEY is not set");
          const driver = new MuseDriver({
            apiKey,
            model: opts.model ?? process.env.MUSE_MODEL ?? "muse-spark-1.3-contributor",
            audit: true,
            maxSteps: 20,
            tolerateBlocked: true,
          });
          const trace = await runProbe({
            contract,
            intent,
            variant: "baseline",
            repeat: 0,
            target: { baseline: url, candidate: url },
            driver,
            outDir: dir,
            oracle: { adapter: "dom", audit: true },
          });
          const done = trace.stoppedReason === "agent_done" || trace.stoppedReason === "satisfied";
          outcomes.set(key, {
            agentSucceeded: done && (trace.final.agentMessage?.startsWith("DONE") ?? done),
            oraclePassed: trace.oracle.passed,
          });
        } else {
          // Offline replay: walk the recorded click path to the intent's
          // screen, actuate its control, and check the dom oracle there.
          const screen = intent.sourceScreen ? byScreen.get(intent.sourceScreen) : undefined;
          const targetSel =
            (intent.target && screen?.controls.find((c) => c.tag === intent.target)?.selector) ??
            intent.domOracle?.flatMap(function flat(a): string[] {
              return a.kind === "anyOf" ? a.assertions.flatMap(flat) : [a.selector];
            }).find((s) => s !== "body");
          // Inspect intents check state in place: actuating their control
          // would navigate away from the screen the oracle describes.
          const outcome = await replayCheck(
            url,
            screen?.path ?? [],
            intent.id === "inspect" ? undefined : targetSel,
            intent,
            dir,
            key,
            screen?.prefill,
          );
          outcomes.set(key, outcome);
        }
      } catch {
        outcomes.set(key, { agentSucceeded: false, oraclePassed: false });
      }
    }
  }
  return outcomes;
}

async function replayCheck(
  url: string,
  clickPath: string[],
  targetSel: string | undefined,
  intent: AgencyContract["intents"][number],
  dir: string,
  key: string,
  prefill?: { selector: string; text: string },
): Promise<ValidationOutcome> {
  const env = await BrowserEnv.open(url, path.join(dir, key), { audit: true });
  try {
    // Path clicks first (they open the screen the prefill belongs to),
    // then discovery text, then the target control.
    for (const sel of clickPath) {
      const box = await env.page.locator(sel).first().boundingBox({ timeout: 3000 }).catch(() => null);
      if (!box) return { agentSucceeded: false };
      await env.execute([
        { type: "click", x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) },
      ]);
    }
    if (prefill) {
      const box = await env.page.locator(prefill.selector).first().boundingBox({ timeout: 3000 }).catch(() => null);
      if (!box) return { agentSucceeded: false };
      try {
        await env.execute([
          { type: "click", x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) },
        ]);
        await env.execute([{ type: "type", text: prefill.text }]);
      } catch {
        return { agentSucceeded: false };
      }
    }
    if (targetSel && targetSel !== "body") {
      const box = await env.page.locator(targetSel).first().boundingBox({ timeout: 3000 }).catch(() => null);
      if (!box) return { agentSucceeded: false };
      try {
        await env.execute([
          { type: "click", x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) },
        ]);
      } catch {
        return { agentSucceeded: false };
      }
    }
    const selectors = [
      ...new Set(
        (intent.domOracle ?? []).flatMap(function flat(a): string[] {
          return a.kind === "anyOf" ? a.assertions.flatMap(flat) : [a.selector];
        }),
      ),
    ];
    const passed = checkDomAssertions(intent.domOracle, await env.collectDomFacts(selectors));
    return { agentSucceeded: true, oraclePassed: passed ?? false };
  } finally {
    await env.close();
  }
}

// --- CLI -----------------------------------------------------------------

async function readPromise(raw: string | undefined): Promise<string | undefined> {
  if (!raw) return undefined;
  if (raw.endsWith(".md")) return readFile(path.resolve(ROOT, raw), "utf8");
  if (raw.endsWith(".pdf")) {
    try {
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const run = promisify(execFile);
      const { stdout } = await run("pdftotext", [path.resolve(ROOT, raw), "-"]);
      return stdout;
    } catch {
      throw new Error("Reading a .pdf promise needs the `pdftotext` binary; pass text or a .md file instead");
    }
  }
  try {
    const st = await import("node:fs/promises").then((fs) => fs.stat(path.resolve(ROOT, raw)));
    if (st.isFile()) return readFile(path.resolve(ROOT, raw), "utf8");
  } catch {
    /* not a path: treat as inline text */
  }
  return raw;
}

export const isInitMain = process.argv[1] === new URL(import.meta.url).pathname;

const { values } = parseArgs({
  // Non-strict: importing this module under vitest must not choke on the
  // test runner's own flags; the CLI validates what it needs when main.
  strict: false,
  options: {
    url: { type: "string" },
    promise: { type: "string" },
    out: { type: "string" },
    driver: { type: "string", default: "auto" },
    "max-steps": { type: "string", default: "40" },
    "model-draft": { type: "boolean", default: false },
    validate: { type: "string", default: "static" },
    model: { type: "string" },
  },
});

if (isInitMain && !values.url) throw new Error("--url <app url> is required");
if (isInitMain) {
  const driver = String(values.driver ?? "auto");
  const validateMode = String(values.validate ?? "static");
  if (!["auto", "census", "muse"].includes(driver)) throw new Error("--driver must be auto, census or muse");
  if (!["static", "muse", "off"].includes(validateMode)) throw new Error("--validate must be static, muse or off");
  const entryUrl = String(values.url ?? "");
  const modelName = values.model === true ? undefined : (values.model as string | undefined);

  const apiKey = process.env.MODEL_API_KEY;
  const useMuseExplore = driver === "muse" || (driver === "auto" && !!apiKey);
  if (driver === "muse" && !apiKey) throw new Error("--driver muse needs MODEL_API_KEY");
  if (validateMode === "muse" && !apiKey) throw new Error("--validate muse needs MODEL_API_KEY");

  const outPath = path.resolve(ROOT, typeof values.out === "string" ? values.out : `contracts/init-${new URL(entryUrl).hostname}.json`);
  const base = outPath.replace(/\.json$/, "");
  const maxSteps = Number(values["max-steps"]);

  console.log(`init: exploring ${entryUrl} (${useMuseExplore ? "muse audit + census" : "census"}, audit guard on, cap ${maxSteps})`);
  const exploration = await crawlExploration(entryUrl, { maxSteps });
  if (useMuseExplore) {
    const seen = await museExploration(entryUrl, exploration, {
      apiKey: apiKey!,
      model: modelName,
      maxSteps,
    });
    console.log(`init: muse audit pass saw ${seen.screens.length} screen(s): ${seen.screens.join(", ")}`);
  }
  console.log(
    `init: ${exploration.screens.length} screen(s), ${exploration.screens.reduce((n, s) => n + s.controls.length, 0)} control(s)`,
  );

  const promiseText = await readPromise(typeof values.promise === "string" ? values.promise : undefined);
  let contracts: AgencyContract[];
  let modelDraft = false;
  if (values["model-draft"]) {
    if (!apiKey) throw new Error("--model-draft needs MODEL_API_KEY");
    const drafted = await draftWithModel(exploration, promiseText, { apiKey, model: modelName });
    contracts = drafted.contracts;
    modelDraft = true;
    console.log(`init: model draft (${drafted.repaired} oracle(s) repaired to needsReview)`);
  } else {
    contracts = draftContracts(exploration, promiseText);
  }
  if (contracts.length === 0) throw new Error("init: no decisions found; the app exposed no draftable controls");

  let counts;
  if (validateMode !== "off") {
    const runDir = path.join(path.dirname(base), `.init-runs-${Date.now()}`);
    const outcomes = await validateContracts(contracts, exploration, entryUrl, {
      outDir: runDir,
      driver: validateMode === "muse" ? "muse" : "scripted",
      apiKey: apiKey || undefined,
      model: modelName,
    });
    counts = applyValidation(contracts, outcomes);
    console.log(`init: validation (k=1, ${validateMode}): ${counts.kept} kept, ${counts.flagged} flagged`);
  }

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(contracts.length === 1 ? contracts[0] : contracts, null, 2));
  await writeFile(`${base}.exploration.json`, JSON.stringify(exploration, null, 2));
  const review = renderInitReview({ url: entryUrl, exploration, contracts, counts, modelDraft });
  await writeFile(`${base}.review.md`, review);
  console.log(`init: wrote ${path.relative(ROOT, outPath)}, ${path.relative(ROOT, `${base}.exploration.json`)}, ${path.relative(ROOT, `${base}.review.md`)}`);
  console.log("");
  console.log(review);
}
