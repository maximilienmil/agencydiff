import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import type { IntentSpec, TagBox } from "@agencydiff/core";
import { MuseDriver, type MuseUsage } from "./drivers.js";
import { BrowserEnv, VIEWPORT, DEVICE_SCALE_FACTOR } from "./env.js";
import { pngDimensions, toCssPixels } from "./coordinates.js";
import { usdForTokens } from "./benchScore.js";

const ROOT = path.resolve(import.meta.dirname, "../../..");

// Usage:
//   MODEL_API_KEY=... pnpm --filter @agencydiff/runner exec tsx src/tapAccuracy.ts \
//     [--variant baseline|size|verify|both] [--buttons 20] [--repeats 3] [--out results.json]
//     [--viewport 430x860] [--dsf 1]
// Clicks arrive in screenshot pixels and are converted to CSS pixels for
// scoring, so non-1 deviceScaleFactors score fairly.
//
// Static page of N labelled buttons. The agent is asked to tap each one by
// name; the first click of every run is scored against the target TagBox from
// the initial observation. Reports hit rate and the offset distribution, so a
// systematic shift (a coordinate bug) shows up as a non-zero mean offset.

const { values } = parseArgs({
  options: {
    variant: { type: "string", default: "baseline" },
    buttons: { type: "string", default: "20" },
    repeats: { type: "string", default: "3" },
    out: { type: "string", default: "eval/tap_accuracy/results_baseline.json" },
    model: { type: "string" },
    viewport: { type: "string" },
    dsf: { type: "string" },
  },
});

function parseViewport(raw: string | undefined): { width: number; height: number } {
  if (!raw) return VIEWPORT;
  const m = raw.match(/^(\d+)x(\d+)$/);
  if (!m) throw new Error(`--viewport must look like 430x860, got ${raw}`);
  return { width: Number(m[1]), height: Number(m[2]) };
}

const viewport = parseViewport(values.viewport);
const deviceScaleFactor = values.dsf === undefined ? DEVICE_SCALE_FACTOR : Number(values.dsf);
if (!Number.isFinite(deviceScaleFactor) || deviceScaleFactor <= 0) {
  throw new Error(`--dsf must be a positive number, got ${values.dsf}`);
}

function sizeNote(): string {
  return (
    `The screenshot you receive is exactly ${viewport.width * deviceScaleFactor} pixels wide and ` +
    `${viewport.height * deviceScaleFactor} pixels tall. Click coordinates use the same pixels: ` +
    `x runs 0-${viewport.width * deviceScaleFactor - 1} left to right, ` +
    `y runs 0-${viewport.height * deviceScaleFactor - 1} top to bottom.`
  );
}

const VARIANTS: Record<string, string | undefined> = {
  baseline: undefined,
  size: sizeNote(),
  verify: `After each click, look at the new screenshot and check the tap landed on the intended control before replying DONE. If it missed, tap again at the corrected position.`,
  both: `${sizeNote()} After each click, look at the new screenshot and check the tap landed on the intended control before replying DONE. If it missed, tap again at the corrected position.`,
};

const variant = values.variant!;
if (!(variant in VARIANTS)) throw new Error(`--variant must be one of ${Object.keys(VARIANTS).join("|")}`);
const maxButtons = Number(values.buttons);
const repeats = Number(values.repeats);
const apiKey = process.env.MODEL_API_KEY;
if (!apiKey) throw new Error("MODEL_API_KEY is not set");
const model = values.model ?? process.env.MUSE_MODEL ?? "muse-spark-1.3-contributor";
const baseUrl = process.env.MODEL_API_BASE ?? "https://api.meta.ai/v1";

const html = await readFile(path.join(ROOT, "eval", "tap_accuracy", "page.html"), "utf8");
const server = createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html" });
  res.end(html);
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const port = (server.address() as { port: number }).port;
const url = `http://127.0.0.1:${port}/`;

export interface TapProbe {
  button: string;
  label: string;
  repeat: number;
  /** Decoded size of the screenshot the model grounded against. */
  png: { width: number; height: number };
  /** First click in CSS pixels (the scored space). */
  click: { x: number; y: number } | null;
  /** First click as the model reported it, in screenshot pixels. */
  rawClick: { x: number; y: number } | null;
  box: [number, number, number, number] | null;
  boxHeight: number | null;
  hit: boolean;
  /** Every click in the run, in order, each scored against the target box. */
  clicks: { x: number; y: number; hit: boolean }[];
  /** True when any click in the run hit the target (self-correction counts). */
  eventualHit: boolean;
  /** Click minus box center; null when there was no click or no box. */
  dx: number | null;
  dy: number | null;
  /** Tag the click actually landed in, if any. */
  landedIn: string | null;
  error?: string;
  calls: number;
}

function boxOf(tags: TagBox[], tag: string): TagBox | undefined {
  return tags.find((t) => t.tag === tag);
}

function landedTag(tags: TagBox[], x: number, y: number): string | null {
  for (const t of tags) {
    const [bx, by, bw, bh] = t.box;
    if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) return t.tag;
  }
  return null;
}

async function runTap(button: string, label: string, repeat: number, usage: MuseUsage): Promise<TapProbe> {
  const dir = await mkdtemp(path.join(tmpdir(), "tap-"));
  const env = await BrowserEnv.open(url, dir, { viewport, deviceScaleFactor });
  try {
    const initial = await env.observe();
    const shot = pngDimensions(initial.png);
    const box = boxOf(initial.observation.tags, button);
    // Per-probe usage: the shared accumulator moves under concurrent runs.
    const local: MuseUsage = { inputTokens: 0, outputTokens: 0, calls: 0 };
    const driver = new MuseDriver({
      apiKey: apiKey!,
      model,
      baseUrl,
      maxSteps: 4,
      instructionsExtra: VARIANTS[variant],
      usage: local,
    });
    const intent = { goal: `Tap the "${label}" button, then reply DONE.` } as IntentSpec;
    const result = await driver.run(intent, env, Date.now(), initial.png);
    usage.inputTokens += local.inputTokens;
    usage.outputTokens += local.outputTokens;
    usage.calls += local.calls;
    const taps = result.steps
      .flatMap((s) => s.actions)
      .filter((a) => a.type === "click" || a.type === "double_click") as { x: number; y: number }[];
    if (!taps.length || !box) {
      return {
        button, label, repeat,
        png: shot,
        click: null,
        rawClick: null,
        box: box?.box ?? null,
        boxHeight: box ? box.box[3] : null,
        hit: false,
        clicks: [],
        eventualHit: false,
        dx: null, dy: null,
        landedIn: null,
        error: result.error ?? (!box ? `no TagBox for ${button}` : "agent never clicked"),
        calls: local.calls,
      };
    }
    // Tags barely shift when #result updates, but score against the freshest
    // boxes: re-observe is cheap and local.
    const after = await env.observe();
    const fresh = boxOf(after.observation.tags, button) ?? box;
    const [fx, fy, fw, fh] = fresh.box;
    // Clicks arrive in screenshot pixels; boxes are CSS pixels. Convert
    // before scoring so higher deviceScaleFactors score fairly.
    const css = taps.map((t) => toCssPixels(t.x, t.y, deviceScaleFactor));
    const inBox = (x: number, y: number) => x >= fx && x <= fx + fw && y >= fy && y <= fy + fh;
    const clicks = css.map((c) => ({ x: c.x, y: c.y, hit: inBox(c.x, c.y) }));
    const [click] = css;
    const [raw] = taps;
    return {
      button, label, repeat,
      png: shot,
      click: { x: click.x, y: click.y },
      rawClick: { x: raw.x, y: raw.y },
      box: fresh.box,
      boxHeight: fh,
      hit: clicks[0].hit,
      clicks,
      eventualHit: clicks.some((c) => c.hit),
      dx: click.x - (fx + fw / 2),
      dy: click.y - (fy + fh / 2),
      landedIn: landedTag(after.observation.tags, click.x, click.y),
      calls: local.calls,
    };
  } finally {
    await env.close().catch(() => {});
    server.closeIdleConnections?.();
  }
}

async function runPooled<T>(limit: number, tasks: (() => Promise<T>)[]): Promise<T[]> {
  const out: T[] = new Array(tasks.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      while (next < tasks.length) {
        const i = next++;
        out[i] = await tasks[i]();
      }
    }),
  );
  return out;
}

// Button labels come from the page itself, so the script cannot drift from it.
const probeDir = await mkdtemp(path.join(tmpdir(), "tap-labels-"));
const probeEnv = await BrowserEnv.open(url, probeDir, { viewport, deviceScaleFactor });
const labels = await probeEnv.page.evaluate(() =>
  [...document.querySelectorAll<HTMLButtonElement>("button.tap")].map((b) => ({
    tag: b.dataset.agency!,
    label: b.textContent!.trim(),
  })),
);
await probeEnv.close().catch(() => {});
const targets = labels.slice(0, maxButtons);

const usage: MuseUsage = { inputTokens: 0, outputTokens: 0, calls: 0 };
const tasks = targets.flatMap(({ tag, label }) =>
  Array.from({ length: repeats }, (_, repeat) => () => runTap(tag, label, repeat, usage)),
);
const probes = await runPooled(4, tasks);
server.close();

const scored = probes.filter((p) => p.dx !== null);
const hits = probes.filter((p) => p.hit).length;
const eventualHits = probes.filter((p) => p.eventualHit).length;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const summary = {
  variant,
  model,
  viewport,
  deviceScaleFactor,
  screenshot: { width: viewport.width * deviceScaleFactor, height: viewport.height * deviceScaleFactor },
  coordinateConvention: "native computer tool: pixels of the last screenshot sent, (0,0) top-left",
  probes: probes.length,
  hits,
  hitRate: hits / probes.length,
  eventualHits,
  eventualRate: eventualHits / probes.length,
  meanDx: scored.length ? mean(scored.map((p) => p.dx!)) : null,
  meanDy: scored.length ? mean(scored.map((p) => p.dy!)) : null,
  meanAbsDx: scored.length ? mean(scored.map((p) => Math.abs(p.dx!))) : null,
  meanAbsDy: scored.length ? mean(scored.map((p) => Math.abs(p.dy!))) : null,
  errors: probes.filter((p) => p.error).length,
  tokens: usage,
  costUsd: usdForTokens(usage.inputTokens, usage.outputTokens),
};
const outPath = path.resolve(ROOT, values.out!);
await writeFile(outPath, JSON.stringify({ summary, probes }, null, 2));
console.log(JSON.stringify(summary, null, 2));
