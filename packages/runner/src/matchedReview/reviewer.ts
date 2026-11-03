import { readFile } from "node:fs/promises";
import { usdForTokens } from "../benchScore.js";
import { renderBundleText, type CaseBundle } from "./bundle.js";

export type ReviewVerdict = "harder" | "easier" | "unchanged" | "uncertain";

export interface ReviewResult {
  verdicts: Record<string, ReviewVerdict>;
  citations: Record<string, string>;
  notes: string;
  raw: string;
  inputTokens: number;
  outputTokens: number;
  calls: number;
  costUsd: number;
  parseRetried: boolean;
}

const INSTRUCTIONS = `You compare two variants of the same app screen by screen: BASELINE (before a change) and CANDIDATE (after). For each listed user intention you receive the recorded scripted path (controls tapped in order), tap counts, screens visited, the final-state oracle outcome (PASS means the app's own state shows the intention fulfilled), and first/final screenshots for both variants.

For each intention, decide whether the change made that intention harder, easier, or left it unchanged. "Harder" means more taps, deeper navigation, a new confirmation or dialog, a worse default, the option disappearing, or the oracle flipping to FAIL. "Easier" is the reverse. Return "uncertain" only when the supplied evidence genuinely does not let you decide; do not guess.

Reply with a single JSON object and nothing else:
{"verdicts": {"<decision>.<intent>": "harder|easier|unchanged|uncertain"}, "citations": {"<decision>.<intent>": "screens: <what differs>; actions: <what differs>; oracle: <what differs>"}, "notes": "<one line>"}
Every intention listed must appear in both maps, with a non-empty citation.`;

const ALLOWED: ReviewVerdict[] = ["harder", "easier", "unchanged", "uncertain"];

/** Strict parse: every in-scope intent present, values from the allowed set. */
export function parseReviewReply(text: string, intents: string[]): Omit<ReviewResult, "inputTokens" | "outputTokens" | "calls" | "costUsd" | "parseRetried" | "raw"> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error(`No JSON object in reply: ${text.slice(0, 200)}`);
  const parsed = JSON.parse(text.slice(start, end + 1)) as {
    verdicts?: Record<string, string>;
    citations?: Record<string, string>;
    notes?: string;
  };
  if (!parsed.verdicts || typeof parsed.verdicts !== "object") throw new Error("Reply has no verdicts map");
  const verdicts: Record<string, ReviewVerdict> = {};
  for (const intent of intents) {
    const bare = intent.split(".").slice(1).join(".");
    const v = parsed.verdicts[intent] ?? parsed.verdicts[bare];
    if (!ALLOWED.includes(v as ReviewVerdict)) throw new Error(`Bad verdict ${JSON.stringify(v)} for ${intent}`);
    verdicts[intent] = v as ReviewVerdict;
  }
  const citations: Record<string, string> = {};
  for (const intent of intents) {
    const bare = intent.split(".").slice(1).join(".");
    const c = parsed.citations?.[intent] ?? parsed.citations?.[bare] ?? "";
    if (!c.trim()) throw new Error(`Missing citation for ${intent}`);
    citations[intent] = c;
  }
  return { verdicts, citations, notes: typeof parsed.notes === "string" ? parsed.notes : "" };
}

export async function callReviewer(opts: {
  apiKey: string;
  baseUrl: string;
  model: string;
  caseDir: string;
  bundle: CaseBundle;
  images: { intent: string; label: string; file: string }[];
  stoppedText?: string;
}): Promise<ReviewResult> {
  const intents = opts.bundle.intents.map((e) => e.intent);
  const dataUrl = (png: Buffer) => `data:image/png;base64,${png.toString("base64")}`;
  const prompt = renderBundleText(opts.bundle) + (opts.stoppedText ? `\nScript completion:\n${opts.stoppedText}` : "");
  const content: Record<string, unknown>[] = [{ type: "input_text", text: prompt }];
  for (const img of opts.images) {
    content.push({ type: "input_text", text: `${img.intent} ${img.label}:` });
    content.push({ type: "input_image", image_url: dataUrl(await readFile(img.file)) });
  }
  let inputTokens = 0;
  let outputTokens = 0;
  let calls = 0;
  let raw = "";
  let parseRetried = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${opts.baseUrl}/responses`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${opts.apiKey}` },
      body: JSON.stringify({ model: opts.model, instructions: INSTRUCTIONS, input: [{ role: "user", content }] }),
    });
    if (!res.ok) throw new Error(`Reviewer ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as {
      output?: { content?: { text?: string }[] }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    inputTokens += body.usage?.input_tokens ?? 0;
    outputTokens += body.usage?.output_tokens ?? 0;
    calls += 1;
    raw = body.output?.flatMap((o) => o.content ?? []).map((c) => c.text ?? "").join("\n") ?? "";
    try {
      const parsed = parseReviewReply(raw, intents);
      const costUsd = usdForTokens(inputTokens, outputTokens);
      return { ...parsed, raw, inputTokens, outputTokens, calls, costUsd, parseRetried };
    } catch (e) {
      parseRetried = true;
      if (attempt === 1) throw e;
    }
  }
  throw new Error("unreachable");
}

/** Majority verdict over repeats; ties collapse to uncertain. */
export function majorityVerdict(votes: ReviewVerdict[]): ReviewVerdict {
  const counts = new Map<ReviewVerdict, number>();
  for (const v of votes) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: ReviewVerdict = "uncertain";
  let bestN = -1;
  let tied = false;
  for (const [v, n] of counts) {
    if (n > bestN) {
      best = v;
      bestN = n;
      tied = false;
    } else if (n === bestN) {
      tied = true;
    }
  }
  return tied ? "uncertain" : best;
}
