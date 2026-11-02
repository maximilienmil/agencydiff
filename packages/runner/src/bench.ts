import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  diffContract,
  type AgencyContract,
  type AgencyReport,
  type Trace,
  type Variant,
} from "@agencydiff/core";
import { MuseDriver, ScriptedDriver, type Driver, type MuseUsage } from "./drivers.js";
import { runProbe } from "./probe.js";
import { captureShots, judgeSeed, type JudgeVerdict } from "./benchJudge.js";
import {
  actionVariance,
  qualify,
  scoreJudgeSeed,
  scoreSeed,
  summarizeVerdicts,
  usdForTokens,
  type GroundTruthEntry,
  type SeedVerdict,
} from "./benchScore.js";

// Usage:
//   pnpm run bench --driver scripted --repeats 3
//   pnpm run bench --driver muse --repeats 3
//   pnpm run bench --method judge
//
// For every seed in eval/ground_truth.json the bench runs the affected
// contracts baseline vs candidate(seed) and scores the Findings against
// ground truth. The scripted driver replays the BASELINE reference path on
// both variants: anything the seed broke (a missing control, an extra
// confirm, a flipped default) shows up as a Finding or a trace difference.
// Nothing is tuned on the labels; the ground truth is only used to score.

// Seeds whose prefix maps to one decision; UI_* controls run all contracts.
const DECISIONS = ["precise_location", "teen_dm", "screen_time", "subscription"];
const PREFIX_TO_DECISION: Record<string, string> = {
  LOC: "precise_location",
  DM: "teen_dm",
  ST: "screen_time",
  SUB: "subscription",
};
// Representative subset if a full muse run would exceed ~$15. Covers every
// decision plus two controls and includes the first three seeds, so the
// estimate probes are reused.
const SUBSET = [
  "LOC_HIDE_DECLINE",
  "LOC_DEFAULT_ON",
  "LOC_CONFIRM_SHAME",
  "DM_HIDE_BLOCK",
  "ST_BURY_LIMIT",
  "SUB_RETENTION_OFFER",
  "UI_COPY_TWEAK",
  "UI_ACCENT",
];
const COST_GUARD_USD = 15;

const ROOT = path.resolve(import.meta.dirname, "../../..");

const { values } = parseArgs({
  options: {
    driver: { type: "string", default: "scripted" },
    method: { type: "string", default: "diff" },
    repeats: { type: "string", default: "3" },
    seeds: { type: "string" },
    base: { type: "string", default: "http://localhost:5173" },
    out: { type: "string" },
    model: { type: "string" },
    "max-steps": { type: "string", default: "12" },
    "force-full": { type: "boolean", default: false },
  },
});

loadDotEnv(path.join(ROOT, ".env"));

const repeats = Number(values.repeats);
const outRoot = path.resolve(ROOT, values.out ?? "eval/results");
const base = values.base!.replace(/\/$/, "");
const model = values.model ?? process.env.MUSE_MODEL ?? "muse-spark-1.3-contributor";
const baseUrl = process.env.MODEL_API_BASE ?? "https://api.meta.ai/v1";

const contracts = await loadContracts();
const contractFile = new Map(contracts.map((c) => [c.decision, c.file]));
const truth: GroundTruthEntry[] = JSON.parse(
  await readFile(path.join(ROOT, "eval", "ground_truth.json"), "utf8"),
).seeds;
const onlySeeds = values.seeds?.split(",").map((s) => s.trim()).filter(Boolean);
const seeds = truth.filter((t) => !onlySeeds || onlySeeds.includes(t.seed));

const server = await ensureServer(base);
try {
  if (values.method === "judge") {
    await runJudge(seeds);
  } else if (values.method === "diff") {
    await runDiff(seeds);
  } else if (values.method !== "summary") {
    throw new Error(`--method expects diff, judge or summary, got ${values.method}`);
  }
  await writeSummary();
} finally {
  server?.kill();
}

function contractsFor(seed: string): (AgencyContract & { file: string })[] {
  const prefix = seed.split("_")[0];
  const decision = PREFIX_TO_DECISION[prefix];
  return decision ? contracts.filter((c) => c.decision === decision) : contracts;
}

async function runDiff(seedList: GroundTruthEntry[]) {
  if (values.driver !== "scripted" && values.driver !== "muse") {
    throw new Error(`--driver must be scripted or muse, got ${values.driver}`);
  }
  const apiKey = process.env.MODEL_API_KEY;
  if (values.driver === "muse" && !apiKey) throw new Error("MODEL_API_KEY is not set");
  const usage: MuseUsage = { inputTokens: 0, outputTokens: 0, calls: 0 };

  // Reference paths for the BASELINE variant only; the scripted candidate
  // replays the same path so seeded friction becomes a Finding.
  const refsCache = new Map<string, Record<Variant, Record<string, string[]>>>();
  async function baselineRefs(contract: AgencyContract & { file: string }) {
    const file = contract.file;
    let refs = refsCache.get(file);
    if (!refs) {
      refs = JSON.parse(await readFile(path.join(ROOT, "eval", "reference_paths", file), "utf8"));
      refsCache.set(file, refs!);
    }
    return refs!.baseline;
  }

  const verdicts: SeedVerdict[] = [];
  const variance: Record<string, number> = {};
  let plan: GroundTruthEntry[] = seedList;
  let coverageNote = `full run over ${seedList.length} seeds`;
  let estimated = false;

  for (let si = 0; si < plan.length; si++) {
    const entry = plan[si];
    const affected = contractsFor(entry.seed);
    const target = {
      baseline: `${base}/?variant=baseline`,
      candidate: `${base}/?seeds=${entry.seed}`,
    };
    const outDir = path.join(outRoot, "traces", values.driver!, entry.seed);
    await mkdir(outDir, { recursive: true });

    const reports: AgencyReport[] = [];
    const tracesByIntent = new Map<string, { baseline: Trace[]; candidate: Trace[] }>();
    for (const contract of affected) {
      const paths = await baselineRefs(contract);
      const driver: Driver =
        values.driver === "muse"
          ? new MuseDriver({ apiKey: apiKey!, model, maxSteps: Number(values["max-steps"]), historyLimit: 3, usage })
          : new ScriptedDriver((intent) => paths[intent.id] ?? []);
      const traces: Trace[] = [];
      // One task per (intent, repeat); each task probes both variants so a
      // baseline/candidate pair always shares driver state.
      const tasks = contract.intents.flatMap((intent) =>
        Array.from({ length: repeats }, (_, repeat) => async () => {
          for (const variant of ["baseline", "candidate"] as const) {
            traces.push(await runProbe({ contract, intent, variant, repeat, target, driver, outDir }));
          }
        }),
      );
      // The drivers hold no per-probe state (MuseDriver chains are local to
      // run()), so probes parallelize freely; four browsers was stable.
      await runPooled(4, tasks);
      reports.push(diffContract(contract, traces));
      for (const intent of contract.intents) {
        const key = qualify(intent.id, contract.decision);
        const pair = {
          baseline: traces.filter((t) => t.intentId === intent.id && t.variant === "baseline"),
          candidate: traces.filter((t) => t.intentId === intent.id && t.variant === "candidate"),
        };
        tracesByIntent.set(key, pair);
        variance[`${entry.seed}/${key}/baseline`] = actionVariance(pair.baseline);
        variance[`${entry.seed}/${key}/candidate`] = actionVariance(pair.candidate);
      }
      const done = traces.filter((t) => t.oracle.passed === false).length;
      console.log(
        `${entry.seed} ${contract.decision}: ${reports[reports.length - 1].findings.length} findings (${done} failed oracle checks)`,
      );
    }
    verdicts.push(
      scoreSeed({ seed: entry.seed, truth: entry, contracts: affected.map((c) => c.decision), reports, tracesByIntent }),
    );

    if (values.driver === "muse" && !values["force-full"] && !onlySeeds && si === 2 && plan.length > SUBSET.length) {
      const projection = projectCost(usage, plan, si);
      console.log(`muse cost after 3 seeds: $${usdForTokens(usage.inputTokens, usage.outputTokens).toFixed(2)}; projected full run: $${projection.toFixed(2)}`);
      if (projection > COST_GUARD_USD) {
        plan = [...verdicts.map((v) => seedList.find((s) => s.seed === v.seed)!),
          ...SUBSET.filter((s) => !verdicts.some((v) => v.seed === s)).map((s) => seedList.find((t) => t.seed === s)!)];
        estimated = true;
        coverageNote =
          `subset run (${SUBSET.length} seeds: ${SUBSET.join(", ")}); full muse run projected at $${projection.toFixed(2)} after the first 3 seeds, over the $${COST_GUARD_USD} budget, so the remaining seeds were skipped`;
        console.log(`Over budget: continuing with subset ${SUBSET.join(",")}`);
      }
    }
  }

  const totals = summarizeVerdicts(verdicts);
  const costUsd = usdForTokens(usage.inputTokens, usage.outputTokens);
  const result = {
    driver: values.driver,
    method: "diff",
    model: values.driver === "muse" ? model : null,
    repeats,
    coverage: estimated ? "subset" : "full",
    coverageNote,
    perSeed: verdicts,
    ...totals,
    actionVariance: variance,
    tokens: { input: usage.inputTokens, output: usage.outputTokens, calls: usage.calls },
    costUsd,
  };
  await mkdir(outRoot, { recursive: true });
  await writeFile(path.join(outRoot, `${values.driver}.json`), JSON.stringify(result, null, 2));
  console.log(
    `\n${values.driver}: caught ${totals.detected}/${totals.regressions} regressions, ${totals.falseAlarms.length}/${totals.controls} control false alarms, $${costUsd.toFixed(2)}`,
  );
}

/** Project full-run cost from usage so far, scaling by remaining probes. */
function projectCost(usage: MuseUsage, plan: GroundTruthEntry[], doneThrough: number): number {
  const probes = (list: GroundTruthEntry[]) =>
    list.reduce((n, s) => n + contractsFor(s.seed).reduce((m, c) => m + c.intents.length, 0), 0);
  const done = probes(plan.slice(0, doneThrough + 1));
  const total = probes(plan);
  if (!done) return 0;
  return (usdForTokens(usage.inputTokens, usage.outputTokens) / done) * total;
}

async function runJudge(seedList: GroundTruthEntry[]) {
  const apiKey = process.env.MODEL_API_KEY;
  if (!apiKey) throw new Error("MODEL_API_KEY is not set");
  const usage = { inputTokens: 0, outputTokens: 0, calls: 0 };
  const verdicts: SeedVerdict[] = [];
  const judgeRepeats: Record<string, Record<string, JudgeVerdict>[]> = {};

  for (const entry of seedList) {
    const affected = contractsFor(entry.seed);
    // One call per seed. Control seeds span all contracts, so judge the
    // first contract's intents on a short shared tour to bound cost.
    const contract = affected.length === 1 ? affected[0] : await controlContract();
    const refs = JSON.parse(
      await readFile(path.join(ROOT, "eval", "reference_paths", contractFile.get(contract.decision)!), "utf8"),
    ).baseline as Record<string, string[]>;
    const shots = await captureShots({ base, seed: entry.seed, contract, refs });
    const first = await judgeSeed({ apiKey, model, baseUrl, contract, shots, usage });
    verdicts.push(
      scoreJudgeSeed({ seed: entry.seed, truth: entry, contracts: [contract.decision], verdicts: first }),
    );
    judgeRepeats[entry.seed] = [first];
    console.log(`${entry.seed}: judge rated ${Object.values(first).filter((v) => v !== "unchanged").length}/${Object.keys(first).length} intents changed`);
  }

  // k=3 consistency on the first three regression seeds, if cheap.
  const repeatSeeds = seedList.filter((s) => s.direction === "regression").slice(0, 3);
  let consistency = 0;
  let consistencyPairs = 0;
  for (const entry of repeatSeeds) {
    const affected = contractsFor(entry.seed);
    const contract = affected[0];
    const refs = JSON.parse(
      await readFile(path.join(ROOT, "eval", "reference_paths", contractFile.get(contract.decision)!), "utf8"),
    ).baseline as Record<string, string[]>;
    for (let k = 1; k < 3; k++) {
      const shots = await captureShots({ base, seed: entry.seed, contract, refs });
      const v = await judgeSeed({ apiKey, model, baseUrl, contract, shots, usage });
      for (const [key, val] of Object.entries(v)) {
        consistencyPairs++;
        if (judgeRepeats[entry.seed][0][key] === val) consistency++;
      }
    }
  }
  const totals = summarizeVerdicts(verdicts);
  const costUsd = usdForTokens(usage.inputTokens, usage.outputTokens);
  await mkdir(outRoot, { recursive: true });
  await writeFile(
    path.join(outRoot, "judge.json"),
    JSON.stringify(
      {
        driver: "judge",
        method: "judge",
        model,
        repeats: 1,
        coverage: seedList.length === truth.length ? "full" : "subset",
        perSeed: verdicts,
        ...totals,
        consistencyK3:
          consistencyPairs > 0
            ? { agreement: consistency / consistencyPairs, pairs: consistencyPairs, seeds: repeatSeeds.map((s) => s.seed) }
            : null,
        tokens: { input: usage.inputTokens, output: usage.outputTokens, calls: usage.calls },
        costUsd,
      },
      null,
      2,
    ),
  );
  console.log(
    `\njudge: caught ${totals.detected}/${totals.regressions} regressions, ${totals.falseAlarms.length}/${totals.controls} control false alarms, $${costUsd.toFixed(2)}`,
  );
}

async function controlContract(): Promise<AgencyContract & { file: string }> {
  return contracts.find((c) => c.decision === "teen_dm")!;
}

async function loadContracts(): Promise<(AgencyContract & { file: string })[]> {
  const files = (await readdir(path.join(ROOT, "contracts"))).filter((f) => f.endsWith(".json"));
  const out: (AgencyContract & { file: string })[] = [];
  for (const f of files) {
    out.push({ ...JSON.parse(await readFile(path.join(ROOT, "contracts", f), "utf8")), file: f });
  }
  return out.sort((a, b) => a.decision.localeCompare(b.decision));
}

function loadDotEnv(file: string) {
  return readFile(file, "utf8")
    .then((text) => {
      for (const line of text.split("\n")) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (m && process.env[m[1]] === undefined) {
          process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
        }
      }
    })
    .catch(() => {});
}

async function ensureServer(url: string): Promise<ChildProcess | null> {
  try {
    const res = await fetch(`${url}/?variant=baseline`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) return null;
  } catch {
    // Fall through to starting a dev server.
  }
  const port = new URL(url).port || "5173";
  console.log(`No server at ${url}; starting Circle dev server on :${port}`);
  const child = spawn("node_modules/.bin/vite", ["--port", port, "--strictPort"], {
    cwd: path.join(ROOT, "apps", "circle"),
    stdio: "ignore",
  });
  const deadline = Date.now() + 60000;
  for (;;) {
    try {
      const res = await fetch(`${url}/?variant=baseline`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) return child;
    } catch {
      // Not up yet.
    }
    if (Date.now() > deadline) {
      child.kill();
      throw new Error(`Circle dev server did not start on :${port} within 60s`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

/** Run async tasks with at most `limit` in flight. */
async function runPooled(limit: number, tasks: (() => Promise<void>)[]): Promise<void> {
  const running = new Set<Promise<void>>();
  for (const task of tasks) {
    const done = task().finally(() => running.delete(done));
    running.add(done);
    if (running.size >= limit) await Promise.race(running);
  }
  await Promise.all(running);
}

async function writeSummary() {
  const read = async (f: string) => {
    try {
      return JSON.parse(await readFile(path.join(outRoot, f), "utf8"));
    } catch {
      return null;
    }
  };
  const scripted = await read("scripted.json");
  const muse = await read("muse.json");
  const judge = await read("judge.json");
  if (!scripted && !muse && !judge) return;
  const summary = {
    generatedAt: new Date().toISOString(),
    agencydiff: {
      scripted: scripted
        ? { caught: `${scripted.detected}/${scripted.regressions}`, falseAlarms: `${scripted.falseAlarms.length}/${scripted.controls}`, costUsd: scripted.costUsd }
        : null,
      muse: muse
        ? { caught: `${muse.detected}/${muse.regressions}`, falseAlarms: `${muse.falseAlarms.length}/${muse.controls}`, costUsd: muse.costUsd, coverage: muse.coverage, coverageNote: muse.coverageNote }
        : null,
    },
    judge: judge
      ? { caught: `${judge.detected}/${judge.regressions}`, falseAlarms: `${judge.falseAlarms.length}/${judge.controls}`, costUsd: judge.costUsd, consistencyK3: judge.consistencyK3 }
      : null,
  };
  await mkdir(outRoot, { recursive: true });
  await writeFile(path.join(outRoot, "summary.json"), JSON.stringify(summary, null, 2));
  await writeFile(
    path.join(ROOT, "eval", "RESULTS.md"),
    resultsMarkdown(summary, { scripted, muse, judge }),
  );
}

function resultsMarkdown(
  summary: {
    agencydiff: {
      scripted: { caught: string; falseAlarms: string; costUsd: number } | null;
      muse: { caught: string; falseAlarms: string; costUsd: number; coverage: string; coverageNote: string } | null;
    };
    judge: { caught: string; falseAlarms: string; costUsd: number; consistencyK3: { agreement: number; pairs: number; seeds: string[] } | null } | null;
  },
  results: { scripted: { perSeed: SeedVerdict[] } | null; muse: { perSeed: SeedVerdict[] } | null; judge: { perSeed: SeedVerdict[] } | null },
): string {
  const lines = [
    "# Benchmark results",
    "",
    "Each of the 26 Circle seeds runs in isolation against its baseline: the same",
    "intent is probed on the unseeded app and on the app with exactly one seed,",
    "and the resulting Findings are scored against `eval/ground_truth.json`.",
    "Caught means every intent the seed should move was flagged; a false alarm",
    "means a no-change control seed produced a Finding.",
    "",
    "| Method | Caught real regressions | False alarms on harmless changes | Cost per full run |",
    "| --- | --- | --- | --- |",
  ];
  if (summary.agencydiff.scripted) {
    const s = summary.agencydiff.scripted;
    lines.push(
      `| AgencyDiff, scripted probes | ${s.caught} | ${s.falseAlarms} | $${s.costUsd.toFixed(2)} (offline, no model calls) |`,
    );
  }
  if (summary.agencydiff.muse) {
    const m = summary.agencydiff.muse;
    lines.push(
      `| AgencyDiff, muse probes (${m.coverage}) | ${m.caught} | ${m.falseAlarms} | $${m.costUsd.toFixed(2)} for the seeds run |`,
    );
    if (m.coverage === "subset") lines.push("", m.coverageNote + ".");
  }
  if (summary.judge) {
    const j = summary.judge;
    lines.push(`| Muse-as-judge | ${j.caught} | ${j.falseAlarms} | $${j.costUsd.toFixed(2)} (one call per seed) |`);
    if (j.consistencyK3) {
      lines.push(
        "",
        `Judge k=3 consistency: ${(j.consistencyK3.agreement * 100).toFixed(0)}% agreement over ${j.consistencyK3.pairs} verdicts (${j.consistencyK3.seeds.join(", ")}).`,
      );
    }
  }
  lines.push(
    "",
    "Scripted probes replay the baseline reference path on both variants, so the",
    "scripted row is a sanity check on the harness itself: it should read 20/20",
    "with 0/6 false alarms. Muse probes and the judge use the same ground truth",
    "but see only screenshots, exactly as a reviewer would.",
    "",
  );
  const perSeed: Record<string, SeedVerdict[]> = {
    scripted: results.scripted?.perSeed ?? [],
    muse: results.muse?.perSeed ?? [],
    judge: results.judge?.perSeed ?? [],
  };
  const notes: string[] = [];
  for (const [label, verdicts] of [["AgencyDiff scripted", perSeed.scripted], ["AgencyDiff muse", perSeed.muse], ["Judge", perSeed.judge]] as const) {
    for (const v of verdicts) {
      if (v.kind === "regression" && v.unexpected.length) {
        notes.push(
          `- ${label} on ${v.seed}: caught, and also flagged ${v.unexpected.map((u) => `${u.intentId} (${u.kind})`).join(", ")}.`,
        );
      }
      if (v.kind === "regression" && !v.detected) {
        notes.push(`- ${label} missed ${v.seed} (expected ${v.missed.join(", ") || "nothing"} to move).`);
      }
    }
  }
  if (notes.length) lines.push("## Notes", "", ...notes, "");
  return lines.join("\n");
}
