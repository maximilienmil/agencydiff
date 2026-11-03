import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { parseArgs } from "node:util";
import { diffContract, type AgencyReport } from "@agencydiff/core";
import { usdForTokens, type GroundTruthEntry } from "../benchScore.js";
import { loadApiKey } from "../agentPrs.js";
import { CASES, SMOKE_CONTRACT, SMOKE_SEED, type MatchedCase } from "./cases.js";
import { assertBundleClean, bundleImageOrder, buildCaseBundle, renderBundleText, renderStoppedLines, sha256File, sha256Hex } from "./bundle.js";
import { collectCaseEvidence, loadCaseTraces, loadContract, writeCaseManifest, ROOT } from "./evidence.js";
import { callReviewer, type ReviewResult } from "./reviewer.js";
import { scoreComparator, scoreReviewer } from "./scorer.js";

const { values } = parseArgs({
  options: {
    phase: { type: "string", default: "all" },
    port: { type: "string", default: "5321" },
    base: { type: "string" },
    out: { type: "string", default: path.join(ROOT, "eval", "followup", "matched-review") },
    cases: { type: "string" },
    smoke: { type: "boolean", default: false },
    repeats: { type: "string", default: "3" },
    model: { type: "string", default: "muse-spark-1.3-contributor" },
  },
});

const BUDGET_USD = 5;
const outDir = path.resolve(values.out as string);
const caseDir = (id: string) => path.join(outDir, "cases", id);
const only = (values.cases as string | undefined)?.split(",").map((s) => s.trim()).filter(Boolean);
const selected: MatchedCase[] = CASES.filter((c) => !only || only.includes(c.caseId));
const reviewRepeats = Number(values.repeats);

async function ensureServer(base: string, port: string): Promise<ChildProcess | null> {
  try {
    const res = await fetch(`${base}/?variant=baseline`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) return null;
  } catch {
    // Fall through to starting a dev server.
  }
  console.log(`No server at ${base}; starting Circle dev server on 127.0.0.1:${port}`);
  const child = spawn(path.join(ROOT, "apps", "circle", "node_modules", ".bin", "vite"), ["--port", port, "--strictPort", "--host", "127.0.0.1"], {
    cwd: path.join(ROOT, "apps", "circle"),
    stdio: "ignore",
  });
  const deadline = Date.now() + 60000;
  for (;;) {
    try {
      const res = await fetch(`${base}/?variant=baseline`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) return child;
    } catch {
      // Not up yet.
    }
    if (Date.now() > deadline) {
      child.kill();
      throw new Error(`Dev server on :${port} did not start in 60s`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

async function phaseEvidence(base: string): Promise<void> {
  for (const c of selected) {
    const contract = await loadContract(c.contractFile);
    const dir = caseDir(c.caseId);
    const traces = await collectCaseEvidence({ caseDir: dir, c, contract, base });
    const manifest = await writeCaseManifest(dir);
    console.log(`${c.caseId}: ${traces.length} traces, errors=${traces.filter((t) => t.stoppedReason === "error").length}, files=${Object.keys(manifest).length}`);
  }
}

async function phaseSmokeEvidence(base: string): Promise<void> {
  const contract = await loadContract(SMOKE_CONTRACT);
  const dir = path.join(outDir, "smoke");
  const fake: MatchedCase = { caseId: "SMOKE", seed: SMOKE_SEED, contractFile: SMOKE_CONTRACT, decision: contract.decision, expected: [], isControl: false };
  const traces = await collectCaseEvidence({ caseDir: dir, c: fake, contract, base });
  const bundle = await buildCaseBundle({ caseDir: dir, contract, traces });
  bundleImageOrder(dir, bundle);
  renderBundleText(bundle);
  console.log(`smoke: ${traces.length} traces, ${bundle.intents.length} intents, plumbing OK (discarded)`);
}

interface ComparatorRecord {
  identical: boolean;
  findings: AgencyReport["findings"];
  hash: string;
}

async function phaseComparator(): Promise<Record<string, ComparatorRecord>> {
  const out: Record<string, ComparatorRecord> = {};
  for (const c of selected) {
    const contract = await loadContract(c.contractFile);
    const traces = await loadCaseTraces(caseDir(c.caseId));
    const first = diffContract(contract, traces);
    const second = diffContract(contract, traces);
    const h1 = sha256Hex(JSON.stringify(first.findings));
    const h2 = sha256Hex(JSON.stringify(second.findings));
    const identical = h1 === h2;
    if (!identical) throw new Error(`Comparator non-deterministic on ${c.caseId}`);
    out[c.caseId] = { identical, findings: first.findings, hash: h1 };
    await writeFile(path.join(caseDir(c.caseId), "comparator.json"), JSON.stringify(out[c.caseId], null, 2));
    console.log(`${c.caseId}: comparator ${first.findings.length} findings, identical=${identical}`);
  }
  return out;
}

async function phaseReview(): Promise<{ results: Record<string, ReviewResult[]>; costUsd: number; tokens: { input: number; output: number; calls: number } }> {
  const apiKey = await loadApiKey();
  const baseUrl = process.env.MODEL_API_BASE ?? "https://api.meta.ai/v1";
  const model = values.model as string;
  const results: Record<string, ReviewResult[]> = {};
  let spent = 0;
  const tokens = { input: 0, output: 0, calls: 0 };
  for (const [i, c] of selected.entries()) {
    const dir = caseDir(c.caseId);
    const contract = await loadContract(c.contractFile);
    const traces = await loadCaseTraces(dir);
    const bundle = await buildCaseBundle({ caseDir: dir, contract, traces });
    const stopped: Record<string, { stoppedReason: (typeof traces)[number]["stoppedReason"]; error?: string }> = {};
    for (const t of traces) stopped[`${c.decision}.${t.intentId}.${t.variant}`] = { stoppedReason: t.stoppedReason, error: t.error };
    const stoppedText = renderStoppedLines(bundle, stopped);
    const text = renderBundleText(bundle) + `\nScript completion:\n${stoppedText}`;
    assertBundleClean(c, text + JSON.stringify(bundle.intents.map((e) => e.goal)));
    const images = bundleImageOrder(dir, bundle);
    const reps: ReviewResult[] = [];
    for (let r = 0; r < reviewRepeats; r++) {
      if (spent >= BUDGET_USD) throw new Error(`Review budget $${BUDGET_USD} exhausted at ${c.caseId} repeat ${r}; partial results kept`);
      const res = await callReviewer({ apiKey, baseUrl, model, caseDir: dir, bundle, images, stoppedText });
      reps.push(res);
      spent += res.costUsd;
      tokens.input += res.inputTokens;
      tokens.output += res.outputTokens;
      tokens.calls += res.calls;
      console.log(`${c.caseId} repeat ${r + 1}: ${JSON.stringify(res.verdicts)} ($${res.costUsd.toFixed(4)})`);
    }
    results[c.caseId] = reps;
    const repDir = path.join(dir, "review");
    await mkdir(repDir, { recursive: true });
    for (const [r, rep] of reps.entries()) {
      await writeFile(path.join(repDir, `repeat-${r}.json`), JSON.stringify({ ...rep, raw: rep.raw.slice(0, 4000) }, null, 2));
    }
    const projected = (spent / (i + 1)) * selected.length;
    if (projected > BUDGET_USD) throw new Error(`Projected review cost $${projected.toFixed(2)} exceeds $${BUDGET_USD} cap; stopping with partial results`);
  }
  return { results, costUsd: spent, tokens };
}

async function shaOf(p: string): Promise<string> {
  return existsSync(p) ? sha256File(p) : "missing";
}

async function phaseScore(comparator: Record<string, ComparatorRecord>, review: Record<string, ReviewResult[]>, reviewCost: { costUsd: number; tokens: { input: number; output: number; calls: number } }): Promise<void> {
  const truth: GroundTruthEntry[] = JSON.parse(await readFile(path.join(ROOT, "eval", "ground_truth.json"), "utf8")).seeds;
  const truthBySeed = new Map(truth.map((t) => [t.seed, t]));
  const perCase: Record<string, unknown> = {};
  const disagreements: string[] = [];
  let expTotal = 0;
  let compHits = 0;
  let revHits = 0;
  let compFalse = 0;
  let revFalse = 0;
  for (const c of selected) {
    const t = truthBySeed.get(c.seed)!;
    const expected = t.intents.filter((i) => i.startsWith(`${c.decision}.`)).map((intent) => ({ intent, metric: t.metric }));
    const contract = await loadContract(c.contractFile);
    const traces = await loadCaseTraces(caseDir(c.caseId));
    const report: AgencyReport = { decision: contract.decision, promise: contract.promise, aggregates: [], asymmetry: [], findings: comparator[c.caseId].findings, passed: true };
    const cs = scoreComparator(report, c, expected);
    const { score: rs, majority } = scoreReviewer(review[c.caseId] ?? [], c, expected);
    const excluded = expected.filter((e) => {
      const ts = traces.filter((x) => `${c.decision}.${x.intentId}` === e.intent);
      return ts.some((x) => x.stoppedReason === "error" && !(x.error ?? "").startsWith("reference tag not found:"));
    }).map((e) => e.intent);
    expTotal += expected.length;
    compHits += cs.hits.length;
    revHits += rs.hits.length;
    compFalse += cs.falseFlags.length;
    revFalse += rs.falseFlags.length;
    for (const e of expected) {
      const ch = cs.hits.includes(e.intent);
      const rh = rs.hits.includes(e.intent);
      if (ch !== rh) disagreements.push(`${c.caseId} ${e.intent}: comparator=${ch ? "hit" : "miss"}, reviewer-majority=${majority[e.intent] ?? "missing"}`);
    }
    perCase[c.caseId] = {
      seed: c.seed,
      decision: c.decision,
      isControl: c.isControl,
      expected,
      excludedErrorTraces: excluded,
      comparator: cs,
      reviewer: { ...rs, majority },
      reviewerRepeats: (review[c.caseId] ?? []).map((r) => ({ verdicts: r.verdicts, uncertain: Object.entries(r.verdicts).filter(([, v]) => v === "uncertain").map(([k]) => k), inputTokens: r.inputTokens, outputTokens: r.outputTokens, parseRetried: r.parseRetried })),
    };
  }
  const head = (await import("node:child_process")).execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT }).toString().trim();
  const raw = {
    provenance: {
      worktreeHead: head,
      baselineBehavior: "7c84640d894cf9366030c77ba36e7576b9a24a2d",
      model: values.model,
      repeats: { comparatorRuns: 2, reviewerRepeats: reviewRepeats },
      budgetUsd: BUDGET_USD,
      manifests: Object.fromEntries(
        await Promise.all(selected.map(async (c) => [c.caseId, JSON.parse(await readFile(path.join(caseDir(c.caseId), "manifest.json"), "utf8"))])),
      ),
      hashes: {
        groundTruth: await shaOf(path.join(ROOT, "eval", "ground_truth.json")),
        ...Object.fromEntries(await Promise.all(selected.map(async (c) => [`contracts/${c.contractFile}`, await shaOf(path.join(ROOT, "contracts", c.contractFile))]))),
      },
    },
    evidenceCostUsd: 0,
    reviewCostUsd: reviewCost.costUsd,
    reviewTokens: reviewCost.tokens,
    denominators: { expectedIntents: expTotal, cases: selected.length, controls: selected.filter((c) => c.isControl).length },
    totals: {
      comparator: { hits: compHits, recall: expTotal ? compHits / expTotal : null, falseFlags: compFalse },
      reviewer: { hits: revHits, recall: expTotal ? revHits / expTotal : null, falseFlags: revFalse },
    },
    disagreements,
    perCase,
  };
  await writeFile(path.join(outDir, "raw.json"), JSON.stringify(raw, null, 2));
  await writeFile(
    path.join(outDir, "summary.json"),
    JSON.stringify({ cases: selected.map((c) => c.caseId), denominators: raw.denominators, totals: raw.totals, reviewCostUsd: raw.reviewCostUsd, reviewTokens: raw.reviewTokens, disagreements }, null, 2),
  );
  console.log(`score: comparator ${compHits}/${expTotal}, reviewer ${revHits}/${expTotal}; false flags c=${compFalse} r=${revFalse}; review $${reviewCost.costUsd.toFixed(4)}`);
}

const phase = values.phase as string;
const port = values.port as string;
const base = (values.base as string | undefined)?.replace(/\/$/, "") ?? `http://127.0.0.1:${port}`;

if (!["evidence", "comparator", "review", "score", "all", "smoke"].includes(phase)) throw new Error(`--phase expects evidence|comparator|review|score|all|smoke, got ${phase}`);

let server: ChildProcess | null = null;
try {
  if (phase === "smoke") {
    server = await ensureServer(base, port);
    await phaseSmokeEvidence(base);
  } else if (phase === "evidence") {
    server = await ensureServer(base, port);
    await phaseEvidence(base);
  } else if (phase === "comparator") {
    await phaseComparator();
  } else if (phase === "review") {
    await phaseReview();
  } else if (phase === "score") {
    const comparator: Record<string, ComparatorRecord> = {};
    for (const c of selected) {
      comparator[c.caseId] = JSON.parse(await readFile(path.join(caseDir(c.caseId), "comparator.json"), "utf8"));
    }
    const review: Record<string, ReviewResult[]> = {};
    for (const c of selected) {
      const repDir = path.join(caseDir(c.caseId), "review");
      review[c.caseId] = [];
      for (let r = 0; r < reviewRepeats; r++) {
        const rep = JSON.parse(await readFile(path.join(repDir, `repeat-${r}.json`), "utf8"));
        review[c.caseId].push({ ...rep, raw: "", costUsd: usdForTokens(rep.inputTokens, rep.outputTokens) });
      }
    }
    const tokens = { input: 0, output: 0, calls: 0 };
    let cost = 0;
    for (const reps of Object.values(review)) {
      for (const r of reps) {
        tokens.input += r.inputTokens;
        tokens.output += r.outputTokens;
        tokens.calls += r.calls;
        cost += r.costUsd;
      }
    }
    await phaseScore(comparator, review, { costUsd: cost, tokens });
  } else {
    server = await ensureServer(base, port);
    await phaseEvidence(base);
    const comparator = await phaseComparator();
    const { results, costUsd, tokens } = await phaseReview();
    await phaseScore(comparator, results, { costUsd, tokens });
  }
} finally {
  server?.kill();
}
