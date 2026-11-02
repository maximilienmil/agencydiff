import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
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
import { captureFirstScreens, captureShots, judgeSeed, type JudgeVerdict } from "./benchJudge.js";
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

/** Harness bugs found while diagnosing the benchmark, fixed rather than
 *  tuned around. Extended as diagnosis finds more. Declared up here because
 *  the top-level flow calls resultsMarkdown before later declarations run. */
const BENCH_FIXES = [
  "The bench crashed on the license_renewal_info contract: it was added by a parallel ticket, has no baseline reference path and no ground-truth seeds, and the scripted driver tried to replay a path that does not exist. The bench now runs only contracts that have a baseline reference path.",
  "One dead browser killed the whole benchmark: a probe whose page died mid-run threw out of runProbe, through the pool, and out of the bench with no partial for its seed. Probes now retry with a fresh browser (3 attempts) and record an error trace instead of throwing, so infrastructure flakes cost one trace, not the run.",
];

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
    shots: { type: "string", default: "walkthrough" },
  },
});

loadDotEnv(path.join(ROOT, ".env"));

const repeats = Number(values.repeats);
const outRoot = path.resolve(ROOT, values.out ?? "eval/results");
const base = values.base!.replace(/\/$/, "");
const model = values.model ?? process.env.MUSE_MODEL ?? "muse-spark-1.3-contributor";
const baseUrl = process.env.MODEL_API_BASE ?? "https://api.meta.ai/v1";

// Only contracts with a baseline reference path run in the bench: the
// scripted driver replays that path, and unscored contracts (e.g. the
// license_renewal_info audit contract, which has no ground-truth seeds)
// would only add noise to the control seeds.
const contracts = (await loadContracts()).filter((c) =>
  existsSync(path.join(ROOT, "eval", "reference_paths", c.file)),
);
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

  // Per-seed partial results: every scored seed is saved at once, so an
  // interrupted run resumes where it stopped instead of starting over.
  const partialDir = path.join(outRoot, "per_seed");
  await mkdir(partialDir, { recursive: true });
  const modelKey = values.driver === "muse" ? model : null;
  interface SeedPartial {
    driver: string;
    repeats: number;
    model: string | null;
    seed: string;
    verdict: SeedVerdict;
    variance: Record<string, number>;
    tokens: { input: number; output: number; calls: number };
  }
  const partialFile = (seed: string) => path.join(partialDir, `${values.driver}.${seed}.json`);
  async function loadPartial(seed: string): Promise<SeedPartial | null> {
    try {
      const p = JSON.parse(await readFile(partialFile(seed), "utf8")) as SeedPartial;
      if (p.driver === values.driver && p.repeats === repeats && p.model === modelKey && p.seed === seed) {
        return p;
      }
    } catch {
      // Missing or stale partial: the seed runs below.
    }
    return null;
  }

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
  const resumedTokens = { input: 0, output: 0, calls: 0 };
  let plan: GroundTruthEntry[] = seedList;
  let coverageNote = `full run over ${seedList.length} seeds`;
  let estimated = false;

  const resumed = new Map<string, SeedPartial>();
  for (const entry of seedList) {
    const p = await loadPartial(entry.seed);
    if (p) resumed.set(entry.seed, p);
  }
  if (resumed.size) {
    console.log(`resuming: ${resumed.size} seeds already scored, skipping their probes`);
  }

  async function writeDiffResult(interim: boolean) {
    const totals = summarizeVerdicts(verdicts);
    const tokens = {
      input: usage.inputTokens + resumedTokens.input,
      output: usage.outputTokens + resumedTokens.output,
      calls: usage.calls + resumedTokens.calls,
    };
    const costUsd = usdForTokens(tokens.input, tokens.output);
    const subset = estimated || !!onlySeeds;
    if (!interim && onlySeeds && !estimated) {
      coverageNote = `subset run over ${seedList.length} seeds (--seeds ${onlySeeds.join(",")})`;
    }
    const result = {
      driver: values.driver,
      method: "diff",
      model: modelKey,
      repeats,
      coverage: subset ? "subset" : "full",
      coverageNote: interim ? `interim: ${verdicts.length}/${plan.length} seeds scored so far` : coverageNote,
      partial: interim,
      perSeed: verdicts,
      ...totals,
      actionVariance: variance,
      tokens,
      costUsd,
    };
    await mkdir(outRoot, { recursive: true });
    await writeFile(path.join(outRoot, `${values.driver}.json`), JSON.stringify(result, null, 2));
    return { totals, costUsd };
  }

  for (let si = 0; si < plan.length; si++) {
    const entry = plan[si];
    const hit = resumed.get(entry.seed);
    if (hit) {
      verdicts.push(hit.verdict);
      Object.assign(variance, hit.variance);
      resumedTokens.input += hit.tokens.input;
      resumedTokens.output += hit.tokens.output;
      resumedTokens.calls += hit.tokens.calls;
      console.log(`${entry.seed}: resumed (${hit.verdict.detected ? "caught" : hit.verdict.kind === "control" ? (hit.verdict.falseAlarm ? "false alarm" : "clean") : "missed"})`);
      await writeDiffResult(true);
      continue;
    }
    const tokensBefore = { ...usage };
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
    const verdict = scoreSeed({ seed: entry.seed, truth: entry, contracts: affected.map((c) => c.decision), reports, tracesByIntent });
    verdicts.push(verdict);
    const seedVariance = Object.fromEntries(
      Object.entries(variance).filter(([k]) => k.startsWith(`${entry.seed}/`)),
    );
    await writeFile(
      partialFile(entry.seed),
      JSON.stringify(
        {
          driver: values.driver,
          repeats,
          model: modelKey,
          seed: entry.seed,
          verdict,
          variance: seedVariance,
          tokens: {
            input: usage.inputTokens - tokensBefore.inputTokens,
            output: usage.outputTokens - tokensBefore.outputTokens,
            calls: usage.calls - tokensBefore.calls,
          },
        } satisfies SeedPartial,
        null,
        2,
      ),
    );
    await writeDiffResult(true);

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

  const { totals, costUsd } = await writeDiffResult(false);
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
  const shotsMode = values.shots === "first" ? "first" : values.shots === "walkthrough" ? "walkthrough" : null;
  if (!shotsMode) throw new Error(`--shots must be walkthrough or first, got ${values.shots}`);
  const outFile = shotsMode === "first" ? "judge_first.json" : "judge.json";
  const usage = { inputTokens: 0, outputTokens: 0, calls: 0 };
  const verdicts: SeedVerdict[] = [];
  const judgeRepeats: Record<string, Record<string, JudgeVerdict>[]> = {};

  // Screenshots per seed: the full reference tour (the judge gets a
  // human-written walkthrough of where each control lives), or only the
  // screen where each intent starts (what a PR-screenshot reviewer sees).
  async function shotsFor(entry: GroundTruthEntry, contract: AgencyContract & { file: string }) {
    if (shotsMode === "first") return captureFirstScreens({ base, seed: entry.seed, contract });
    const refs = JSON.parse(
      await readFile(path.join(ROOT, "eval", "reference_paths", contractFile.get(contract.decision)!), "utf8"),
    ).baseline as Record<string, string[]>;
    return captureShots({ base, seed: entry.seed, contract, refs });
  }

  for (const entry of seedList) {
    const affected = contractsFor(entry.seed);
    // One call per seed. Control seeds span all contracts, so judge the
    // first contract's intents on a short shared tour to bound cost.
    const contract = affected.length === 1 ? affected[0] : await controlContract();
    const shots = await shotsFor(entry, contract);
    const first = await judgeSeed({ apiKey, model, baseUrl, contract, shots, usage });
    verdicts.push(
      scoreJudgeSeed({ seed: entry.seed, truth: entry, contracts: [contract.decision], verdicts: first }),
    );
    judgeRepeats[entry.seed] = [first];
    console.log(`${entry.seed}: judge rated ${Object.values(first).filter((v) => v !== "unchanged").length}/${Object.keys(first).length} intents changed`);
  }

  // k=3 consistency on the first three regression seeds, if cheap.
  // First-screens runs stay at k=1.
  const repeatSeeds = shotsMode === "walkthrough" ? seedList.filter((s) => s.direction === "regression").slice(0, 3) : [];
  let consistency = 0;
  let consistencyPairs = 0;
  for (const entry of repeatSeeds) {
    const affected = contractsFor(entry.seed);
    const contract = affected[0];
    for (let k = 1; k < 3; k++) {
      const shots = await shotsFor(entry, contract);
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
    path.join(outRoot, outFile),
    JSON.stringify(
      {
        driver: "judge",
        method: "judge",
        shots: shotsMode,
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
    `\njudge (${shotsMode}): caught ${totals.detected}/${totals.regressions} regressions, ${totals.falseAlarms.length}/${totals.controls} control false alarms, $${costUsd.toFixed(2)}`,
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

interface TableResult {
  detected: number;
  regressions: number;
  falseAlarms: string[];
  controls: number;
  costUsd: number;
  lenientOnly?: string[];
  coverage?: string;
  coverageNote?: string;
  consistencyK3?: { agreement: number; pairs: number; seeds: string[] } | null;
  perSeed: SeedVerdict[];
}

async function writeSummary() {
  const read = async (f: string): Promise<TableResult | null> => {
    try {
      return JSON.parse(await readFile(path.join(outRoot, f), "utf8"));
    } catch {
      return null;
    }
  };
  const scripted = await read("scripted.json");
  const muse = await read("muse.json");
  const judgeWalkthrough = await read("judge.json");
  const judgeFirst = await read("judge_first.json");
  if (!scripted && !muse && !judgeWalkthrough && !judgeFirst) return;
  const row = (r: TableResult | null) =>
    r ? { caught: `${r.detected}/${r.regressions}`, falseAlarms: `${r.falseAlarms.length}/${r.controls}`, costUsd: r.costUsd } : null;
  const summary = {
    generatedAt: new Date().toISOString(),
    agencydiff: {
      scripted: row(scripted),
      muse: muse
        ? { ...row(muse)!, coverage: muse.coverage, coverageNote: muse.coverageNote }
        : null,
    },
    judge: {
      walkthrough: judgeWalkthrough
        ? { ...row(judgeWalkthrough)!, consistencyK3: judgeWalkthrough.consistencyK3 ?? null }
        : null,
      firstScreens: row(judgeFirst),
    },
  };
  await mkdir(outRoot, { recursive: true });
  await writeFile(path.join(outRoot, "summary.json"), JSON.stringify(summary, null, 2));
  await writeFile(
    path.join(ROOT, "eval", "RESULTS.md"),
    resultsMarkdown({ scripted, muse, judgeWalkthrough, judgeFirst }),
  );
}

function resultsMarkdown(results: {
  scripted: TableResult | null;
  muse: TableResult | null;
  judgeWalkthrough: TableResult | null;
  judgeFirst: TableResult | null;
}): string {
  const lines = [
    "# Benchmark results",
    "",
    "Each of the 26 Circle seeds runs in isolation against its baseline: the same",
    "intent is probed on the unseeded app and on the app with exactly one seed,",
    "and the resulting Findings are scored against `eval/ground_truth.json`.",
    "Caught means every intent the seed should move got a written Finding; a",
    "false alarm means a no-change control seed produced a Finding.",
    "",
    "| Method | Caught regressions /20 | False alarms /6 | Cost per full run |",
    "| --- | --- | --- | --- |",
  ];
  const row = (label: string, r: TableResult | null, costNote: string) =>
    r
      ? `| ${label} | ${r.detected}/${r.regressions} | ${r.falseAlarms.length}/${r.controls} | $${r.costUsd.toFixed(2)} ${costNote} |`
      : `| ${label} | not run yet | not run yet | — |`;
  lines.push(
    row("AgencyDiff, muse probes", results.muse, results.muse?.coverage === "subset" ? "for the seeds run" : "(k=3, model calls)"),
    row("Muse-as-judge, given a walkthrough (upper bound)", results.judgeWalkthrough, "(one call per seed)"),
    row("Muse-as-judge, first screens only", results.judgeFirst, "(one call per seed)"),
    row("AgencyDiff, scripted probes (sanity)", results.scripted, "(offline, no model calls)"),
    "",
  );
  if (results.muse?.coverage === "subset" && results.muse.coverageNote) {
    lines.push(results.muse.coverageNote + ".", "");
  }
  if (results.judgeWalkthrough?.consistencyK3) {
    const k3 = results.judgeWalkthrough.consistencyK3;
    lines.push(
      `Judge walkthrough k=3 consistency: ${(k3.agreement * 100).toFixed(0)}% agreement over ${k3.pairs} verdicts (${k3.seeds.join(", ")}).`,
      "",
    );
  }
  lines.push(
    "Scripted probes replay the baseline reference path on both variants, so the",
    "scripted row is a sanity check on the harness itself: it should read 19/20",
    "strict with 0/6 false alarms. The twentieth seed, DM_BURY_MESSAGES, is",
    "caught only leniently: burying Messages strands the scripted replay before",
    "it can act, while the friends_only oracle already holds in the default",
    "state, so no Finding names that intent. Muse probes and both judges see",
    "only screenshots, exactly as a reviewer would.",
    "",
    "## What each method is good and bad at",
    "",
    "AgencyDiff with muse probes drives the app like a person would, so it is",
    "the only method that produces quantified evidence: how many taps an intent",
    "takes, and traces anyone can replay. That makes it the only method that can",
    "catch a control that vanished entirely. Its weakness is noise: the same",
    "intent can take a different number of taps on each run with nothing changed,",
    "so small differences do not count (see the counting rule below), and a full",
    "run costs on the order of a dollar in model calls.",
    "",
    "The judge with a walkthrough is the upper bound for screenshot review: it",
    "is shown every screen along the reference path, which is a human-written",
    "tour of where each control lives. It is cheap (pennies per run) and good at",
    "visible changes such as moved or renamed controls, but it cannot measure",
    "effort, and it misses anything the tour does not show, such as defaults",
    "that only appear before the user has chosen anything.",
    "",
    "The judge with first screens only is what a reviewer looking at PR",
    "screenshots would see: one starting screen per intent, no tour. It is the",
    "fairest comparison for review-time usefulness, and the weakest: anything",
    "buried deeper than the first screen is invisible to it by construction.",
    "",
    "Scripted probes are not a contender. They replay a fixed path, so they",
    "cannot discover anything new; they only check that the harness itself",
    "works.",
    "",
    "## How we count a Finding from noisy probes",
    "",
    "Model probes are noisy: the same intent can take 3 taps on one run and 6",
    "on the next with nothing changed. So a cost or depth change only counts",
    "when the slowest baseline run is still faster than the fastest candidate",
    "run, and the typical (median) difference is at least one tap. A drop in",
    "success rate only counts when at least two thirds of runs flip from pass",
    "to fail. A seed counts as caught only when there is a written Finding on",
    "one of the intents it was supposed to move; a visible-but-unmeasured",
    "behaviour change counts only as a second-chance lenient score, reported",
    "separately. Any Finding on a no-change control seed is a false alarm.",
    "Single runs and scripted replays use the old rule: any median increase",
    "counts, because there is no run-to-run noise to guard against.",
    "",
    "## Harness bugs found and fixed",
    "",
    ...BENCH_FIXES.map((f) => `- ${f}`),
    "",
  );
  const perSeed: Record<string, SeedVerdict[]> = {
    scripted: results.scripted?.perSeed ?? [],
    muse: results.muse?.perSeed ?? [],
    walkthrough: results.judgeWalkthrough?.perSeed ?? [],
    first: results.judgeFirst?.perSeed ?? [],
  };
  const notes: string[] = [];
  for (
    const [label, verdicts] of [
      ["AgencyDiff scripted", perSeed.scripted],
      ["AgencyDiff muse", perSeed.muse],
      ["Judge walkthrough", perSeed.walkthrough],
      ["Judge first-screens", perSeed.first],
    ] as const
  ) {
    for (const v of verdicts) {
      if (v.kind === "regression" && v.unexpected.length) {
        notes.push(
          `- ${label} on ${v.seed}: caught, and also flagged ${v.unexpected.map((u) => `${u.intentId} (${u.kind})`).join(", ")}.`,
        );
      }
      if (v.kind === "regression" && !v.detected) {
        const lenient = v.lenientDetected ? " (caught leniently: trace difference, no Finding)" : "";
        notes.push(`- ${label} missed ${v.seed} (expected ${v.missed.join(", ") || "nothing"} to move)${lenient}.`);
      }
    }
  }
  if (notes.length) lines.push("## Notes", "", ...notes, "");
  return lines.join("\n");
}
