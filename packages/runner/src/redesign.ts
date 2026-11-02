import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import type { AgencyContract } from "@agencydiff/core";
import {
  extractHtml,
  findContract,
  loadAuditRuns,
  slugify,
  summarizeIntent,
} from "./auditRun.js";

// Usage:
//   MODEL_API_KEY=... pnpm run redesign --audit audits/dmv-baseline --name dmv-renewal --facts eval/dmv/facts.json
//
// Sends an audit's Traces (screens visited, step costs, key final
// screenshots) plus the Intent goals to Muse Spark and asks for a single
// self-contained static HTML mockup of a redesigned information flow for the
// same intents. The model never sees the contract's oracles: it must answer
// each Intent from the evidence, and the same oracles re-probe both sites.

const ROOT = path.resolve(import.meta.dirname, "../../..");

const { values } = parseArgs({
  options: {
    audit: { type: "string" },
    name: { type: "string" },
    contract: { type: "string" },
    facts: { type: "string" },
    model: { type: "string" },
    out: { type: "string" },
  },
});

if (!values.audit) throw new Error("--audit <runDir> is required");

const apiKey = process.env.MODEL_API_KEY;
if (!apiKey) throw new Error("MODEL_API_KEY is not set");
const model = values.model ?? process.env.MUSE_MODEL ?? "muse-spark-1.3-contributor";

const runDir = path.resolve(ROOT, values.audit);
const audits = await loadAuditRuns(runDir);
if (audits.length === 0) throw new Error(`No audit.json found under ${runDir}`);
const decision = audits[0].decision;

const contract = values.contract
  ? (JSON.parse(await readFile(path.resolve(ROOT, values.contract), "utf8")) as AgencyContract)
  : await findContract(ROOT, decision);
// Blind to oracles: the brief below carries only Intent goals and measured
// costs, never the assertions that will re-probe the mockup.
const blind = contract
  ? { decision: contract.decision, intents: contract.intents.map((i) => ({ id: i.id, goal: i.goal })) }
  : undefined;

const brief = audits.map((a) => ({
  decision: a.decision,
  target: a.report.target,
  intentIds: a.report.aggregates.map((g) => g.intentId),
  aggregates: a.report.aggregates.map((g) => ({
    intent: g.intentId,
    successRate: g.successRate,
    medianActions: g.actionCount,
    medianDepth: g.navigationDepth,
  })),
  intents: [...new Set(a.traces.map((t) => t.trace.intentId))]
    .sort()
    .map((id) => summarizeIntent(id, a.traces.filter((t) => t.trace.intentId === id).map((t) => t.trace), blind)),
}));

// Key screenshots only: one final screenshot per intent, never full history.
const images: { intentId: string; png: Buffer }[] = [];
for (const a of audits) {
  for (const id of [...new Set(a.traces.map((t) => t.trace.intentId))].sort()) {
    if (images.length >= 4) break;
    const t = a.traces
      .filter((t) => t.trace.intentId === id && t.trace.steps.length > 0)
      .sort((x, y) => x.trace.repeat - y.trace.repeat)[0];
    if (!t) continue;
    const last = t.trace.steps.at(-1)!;
    try {
      images.push({ intentId: id, png: await readFile(path.join(t.dir, last.after.screenshot)) });
    } catch {
      /* screenshot pruned from the run; text evidence still applies */
    }
  }
}

// Ground-truth facts the redesign must convey. The redesigner sees these
// plain facts only: never the oracles, synonym lists, thresholds, or
// selectors that will re-probe the mockup.
let factsText: string | undefined;
if (values.facts) {
  const raw = await readFile(path.resolve(ROOT, values.facts), "utf8");
  factsText = JSON.stringify(JSON.parse(raw));
}

const instructions = `You are redesigning a public-service information page so people find answers faster. Be neutral about the agency: describe a clearer flow, never mock it.

Input: audit evidence from a multi-step government information task (per-Intent success rates, median action costs, screens visitors wandered through, and final screenshots), plus the plain-language goal of each Intent. Output: ONE self-contained static HTML document, a "concept redesign" information flow that answers every Intent below on a single page with anchored sections.

Rules:
- One HTML file, no external requests (no CDN, fonts, images, or fetch). Inline <style> only, system font stack.
- Mobile-first, content column around 430px. Restrained public-service look: plain background, clear heading hierarchy, real <h1>/<h2>, no gradients, no emoji icons.
- The most important answer for each Intent is visible near the top of its section. Keep copy short, fictional but faithful to the evidence; do not invent fees, fines, or legal requirements.
- Use plain, ordinary wording for each answer (official page titles, service names, and document names as a person would expect them). No exact-phrase requirements: success is checked on page facts, in whatever words state them.
- A visible banner at the top and a footer note must both say this is a "concept redesign" mockup for research, not the real agency site.
- No forms that submit, no login, no payment content. Buttons are in-page anchors only.`;

const reply = await promptModel({
  apiKey,
  model,
  instructions,
  brief:
    JSON.stringify(brief, null, 2) +
    (factsText ? `\n\nGround-truth facts (convey each in the matching section):\n${factsText}` : ""),
  images,
});
const html = extractHtml(reply);

const label = /concept redesign/i.test(html);
if (!label) throw new Error('Mockup is missing the required "concept redesign" label');

const name = values.name ?? slugify(decision);
const outDir = path.resolve(ROOT, values.out ?? path.join("apps", "redesigns", name));
await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, "index.html"), html);
await writeFile(
  path.join(outDir, "meta.json"),
  JSON.stringify(
    {
      name,
      decision,
      sourceAudit: path.relative(ROOT, runDir),
      model,
      blind: true,
      facts: values.facts ? path.relative(ROOT, path.resolve(ROOT, values.facts)) : undefined,
      oraclesWithheld: ["domOracle", "synonyms", "thresholds", "selectors"],
      createdAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);

console.log(`redesign: ${path.relative(ROOT, path.join(outDir, "index.html"))}`);
console.log(`intents: ${brief.flatMap((b) => b.intents.map((i) => i.intentId)).join(", ")}`);

async function promptModel(opts: {
  apiKey: string;
  model: string;
  instructions: string;
  brief: string;
  images: { intentId: string; png: Buffer }[];
}): Promise<string> {
  const content: unknown[] = [
    { type: "input_text", text: `${opts.instructions}\n\nAudit evidence:\n${opts.brief}` },
  ];
  for (const img of opts.images) {
    (content as unknown[]).push(
      { type: "input_text", text: `Final screenshot for intent "${img.intentId}":` },
      { type: "input_image", image_url: `data:image/png;base64,${img.png.toString("base64")}` },
    );
  }
  const res = await fetch("https://api.meta.ai/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${opts.apiKey}` },
    body: JSON.stringify({ model: opts.model, input: [{ role: "user", content }] }),
  });
  if (!res.ok) throw new Error(`Muse ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { output?: { content?: { text?: string }[] }[] };
  const text = (body.output ?? []).flatMap((o) => o.content ?? []).map((c) => c.text ?? "").join("\n").trim();
  if (!text) throw new Error("Empty model reply");
  return text;
}
