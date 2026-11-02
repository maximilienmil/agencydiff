import { chromium } from "playwright";
import type { AgencyContract } from "@agencydiff/core";

export interface JudgeShot {
  variant: "baseline" | "candidate";
  screen: string;
  png: Buffer;
  /** When set, pairs baseline/candidate shots of the same intent. */
  intent?: string;
}

export type JudgeVerdict = "harder" | "easier" | "unchanged";

/** Walk each intent's baseline reference path on both variants and keep one
 *  screenshot per screen visited. The judge compares what a person would see
 *  doing the same thing before and after the change. */
export async function captureShots(opts: {
  base: string;
  seed: string;
  contract: AgencyContract;
  refs: Record<string, string[]>;
  maxShots?: number;
}): Promise<JudgeShot[]> {
  const { base, seed, contract, refs } = opts;
  const maxShots = opts.maxShots ?? 12;
  const shots: JudgeShot[] = [];
  const seen = new Set<string>();
  const browser = await chromium.launch();
  try {
    for (const variant of ["baseline", "candidate"] as const) {
      const url = variant === "baseline" ? `${base}/?variant=baseline` : `${base}/?seeds=${seed}`;
      for (const intent of contract.intents) {
        if (shots.filter((s) => s.variant === variant).length >= maxShots) break;
        const ctx = await browser.newContext({ viewport: { width: 430, height: 860 } });
        const page = await ctx.newPage();
        const fixture = intent.fixture ? `&fixture=${intent.fixture}` : "";
        await page.goto(`${url}${fixture}`, { waitUntil: "networkidle" });
        const snap = async () => {
          const screen =
            (await page.evaluate(
              () => document.querySelector("[data-screen]")?.getAttribute("data-screen"),
            )) ?? "?";
          const key = `${variant}:${screen}`;
          if (!seen.has(key)) {
            seen.add(key);
            shots.push({ variant, screen, png: await page.screenshot() });
          }
        };
        await snap();
        for (const tag of refs[intent.id] ?? []) {
          const box = await page
            .locator(`[data-agency="${tag}"]`)
            .first()
            .boundingBox({ timeout: 3000 })
            .catch(() => null);
          if (!box) break;
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          await page.waitForTimeout(250);
          await snap();
        }
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
  return shots;
}

/** One screenshot per intent per variant at the probe's start URL: what a
 *  reviewer looking at a PR screenshot would see, with no walkthrough of
 *  where each control lives. Shots pair by intent, not by screen. */
export async function captureFirstScreens(opts: {
  base: string;
  seed: string;
  contract: AgencyContract;
}): Promise<JudgeShot[]> {
  const { base, seed, contract } = opts;
  const shots: JudgeShot[] = [];
  const browser = await chromium.launch();
  try {
    for (const variant of ["baseline", "candidate"] as const) {
      const url = variant === "baseline" ? `${base}/?variant=baseline` : `${base}/?seeds=${seed}`;
      for (const intent of contract.intents) {
        const ctx = await browser.newContext({ viewport: { width: 430, height: 860 } });
        const page = await ctx.newPage();
        const fixture = intent.fixture ? `&fixture=${intent.fixture}` : "";
        await page.goto(`${url}${fixture}`, { waitUntil: "networkidle" });
        const screen =
          (await page.evaluate(
            () => document.querySelector("[data-screen]")?.getAttribute("data-screen"),
          )) ?? "?";
        shots.push({ variant, screen, png: await page.screenshot(), intent: intent.id });
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
  return shots;
}

const JUDGE_INSTRUCTIONS = `You compare two versions of the same app screen by screen: BASELINE (before a change) and CANDIDATE (after). You are given, for one screen at a time, the baseline screenshot then the candidate screenshot.

For each listed user intention, decide whether the change made that intention harder, easier, or left it unchanged. "Harder" means more taps, deeper navigation, a new confirmation or dialog, a worse default, or the option disappearing. Judge only what the screenshots show; do not guess about hidden behavior.

Reply with a single JSON object and nothing else, mapping each qualified intent id to exactly one of "harder", "easier" or "unchanged":
{"verdicts": {"<decision>.<intent>": "harder"}}`;

/** One model call per seed. Returns per-intent verdicts plus token usage. */
export async function judgeSeed(opts: {
  apiKey: string;
  model: string;
  baseUrl: string;
  contract: AgencyContract;
  shots: JudgeShot[];
  usage: { inputTokens: number; outputTokens: number; calls: number };
}): Promise<Record<string, JudgeVerdict>> {
  const { apiKey, model, baseUrl, contract, shots, usage } = opts;
  const dataUrl = (png: Buffer) => `data:image/png;base64,${png.toString("base64")}`;
  const content: Record<string, unknown>[] = [
    {
      type: "input_text",
      text: `The product promise: "${contract.promise}"\n\nIntentions to rate:\n${contract.intents
        .map((i) => `- ${contract.decision}.${i.id}: ${i.goal}`)
        .join("\n")}`,
    },
  ];
  const byScreen = new Map<string, { baseline?: Buffer; candidate?: Buffer; label: string }>();
  for (const s of shots) {
    // First-screen shots pair by intent (each intent starts in its own
    // fixture state); walkthrough shots pair by screen visited.
    const key = s.intent ?? s.screen;
    let e = byScreen.get(key);
    if (!e) {
      e = { label: s.intent ? `Start of intent "${s.intent}"` : `Screen "${s.screen}"` };
      byScreen.set(key, e);
    }
    e[s.variant] = s.png;
  }
  for (const [, pair] of byScreen) {
    const caption = pair.label;
    if (pair.baseline && pair.candidate) {
      content.push({ type: "input_text", text: `${caption} BASELINE:` });
      content.push({ type: "input_image", image_url: dataUrl(pair.baseline) });
      content.push({ type: "input_text", text: `${caption} CANDIDATE:` });
      content.push({ type: "input_image", image_url: dataUrl(pair.candidate) });
    } else if (pair.candidate) {
      content.push({ type: "input_text", text: `${caption} appears only in CANDIDATE:` });
      content.push({ type: "input_image", image_url: dataUrl(pair.candidate) });
    } else if (pair.baseline) {
      content.push({ type: "input_text", text: `${caption} appears only in BASELINE:` });
      content.push({ type: "input_image", image_url: dataUrl(pair.baseline!) });
    }
  }
  const res = await fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, instructions: JUDGE_INSTRUCTIONS, input: [{ role: "user", content }] }),
  });
  if (!res.ok) throw new Error(`Muse judge ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as {
    output?: { content?: { text?: string }[] }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  usage.inputTokens += body.usage?.input_tokens ?? 0;
  usage.outputTokens += body.usage?.output_tokens ?? 0;
  usage.calls += 1;
  const text = body.output?.flatMap((o) => o.content ?? []).map((c) => c.text ?? "").join("\n") ?? "";
  return parseJudgeVerdicts(text, contract.decision);
}

/** Extract the verdict map from a model reply; unknown ids and values throw. */
export function parseJudgeVerdicts(text: string, decision: string): Record<string, JudgeVerdict> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error(`No JSON object in judge reply: ${text.slice(0, 200)}`);
  const parsed = JSON.parse(text.slice(start, end + 1)) as {
    verdicts?: Record<string, string>;
  };
  if (!parsed.verdicts || typeof parsed.verdicts !== "object") {
    throw new Error(`Judge reply has no "verdicts" map: ${text.slice(0, 200)}`);
  }
  const out: Record<string, JudgeVerdict> = {};
  for (const [k, v] of Object.entries(parsed.verdicts)) {
    if (v !== "harder" && v !== "easier" && v !== "unchanged") {
      throw new Error(`Bad judge verdict ${JSON.stringify(v)} for ${k}`);
    }
    out[k.includes(".") ? k : `${decision}.${k}`] = v;
  }
  return out;
}
