import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  ROOT,
  buildCandidate,
  costForTokens,
  loadApiKey,
  loadResults,
  measureMuse,
  pickMuseSpotTargets,
  runMuseConfirmFocused,
  runOneAttempt,
  runOneCleanAttempt,
  runPool,
  saveResults,
  serveDir,
  sh,
  writeGateWrapper,
  writeReport,
  writeReport18b,
  type HarnessOpts,
  type ResultsFile,
  type TaskDef,
} from "../../packages/runner/src/agentPrs.js";

const { values } = parseArgs({
  options: {
    arm: { type: "string", default: "both" },
    attempts: { type: "string", default: "3" },
    tasks: { type: "string" },
    "out-root": { type: "string", default: path.join(ROOT, "eval/agent-prs") },
    "muse-spot": { type: "boolean", default: false },
    report: { type: "boolean", default: false },
    "dev-port-base": { type: "string", default: "5241" },
    clean: { type: "boolean", default: false },
    "muse-confirm": { type: "boolean", default: false },
    "sample-seed": { type: "string", default: "18" },
  },
});

const outRoot = path.resolve(values["out-root"] as string);
const clean = values.clean as boolean;

if (values.report) {
  const existing = await loadResults(outRoot);
  if (clean || existing?.kind === "clean-18b") {
    console.log(await writeReport18b(outRoot));
  } else {
    console.log(await writeReport(outRoot));
  }
  process.exit(0);
}

const apiKey = await loadApiKey();
const baseRef = (await sh(ROOT, "git", ["rev-parse", "HEAD"])).trim();
const allTasks: TaskDef[] = JSON.parse(
  await readFile(path.join(outRoot, "tasks.json"), "utf8"),
).tasks;
const only = (values.tasks as string | undefined)?.split(",");
const tasks = allTasks.filter((t) => !only || only.includes(t.id));
const attempts = Number(values.attempts);
const arms = values.arm === "both" ? ["a", "b"] : [values.arm as "a" | "b"];

const DEVIATIONS = [
  `No main branch exists in this repo; baseline is trunk HEAD ${baseRef} (recorded as baseRef).`,
  "MCP server (agencydiff_check) does not exist on main yet; arm B used the AgencyDiff CLI gate only.",
  "All coding-agent runs used model muse-spark-1.3-contributor at reasoning effort low (not default high) to hold the ~$25 budget.",
  "Scripted driver ran at repeats=1 (deterministic: identical inputs give identical traces) instead of k=3.",
  "Muse driver ran at k=1 on 4 spot-check contract-runs (first regressing attempt per task/arm on regressed contracts + 2 clean controls), not k=3 on all 4 contracts per attempt.",
  "Muse driver at k=3 completed for 1 spot target (a/onboard/0 location: still FAIL, same visibility signature); the 3 subscription k=3 reruns were stopped for time after a partial run, so the k=1 control false-alarms stand as a documented noise floor, not as verdicts.",
  "Task-done judge is one text-only call per attempt (model muse-spark-1.3), reported separately from regressions.",
  "Agents were forbidden from reading contracts/, eval/, packages/ in the prompt; compliance checked via git status plus exec-log scan (reading leaves no other trace).",
  "Arm B additionally passes --disable-sandbox: with the sandbox on, the agent cannot bind the dev-server port or run the gate CLI (verified: sandboxed probe curls 502, unsandboxed 200). File scope still enforced by prompt + git-status check.",
];

const CLEAN_DEVIATIONS = [
  `No main branch exists in this repo; baseline is trunk HEAD ${baseRef} (recorded as baseRef), rebuilt from a pristine worktree for this run (clean main build).`,
  "AgencyDiff MCP server does not exist; arm B gates through the black-box agencydiff-check wrapper at /tmp/agencydiff-check, which prints only the PR-comment markdown and exits non-zero on FAIL. Contract files never enter the agent workspace.",
  "All coding-agent runs used model muse-spark-1.3-contributor at reasoning effort low, same as T18 for comparability.",
  "Same 6 frozen tasks as T18 (tasks.json unchanged), 5 attempts per task per arm (60 attempts).",
  "Scripted driver ran at repeats=1 (deterministic: identical inputs give identical traces).",
  "No noise-aware finding rule exists on main, so muse k=3 confirmations use the separated-ranges rule (candidate min > baseline max on the finding's metric; baseline 3/3 plus at least one candidate failure for goal_unreachable). A regression is confirmed only if muse k=3 agrees.",
  "Muse k=3 ran focused per intent, not per full contract: every scripted-flagged finding is confirmed on its own intent (both variants, k=3), and the seeded noise sample (seed 18, 6 valid unflagged attempts per arm) probes the intents where scripted flagged anything. Reason: the screenshot-only driver costs ~4 min per probe on this UI (20-step budget, vision calls), so full-contract k=3 on every target would take days and break the budget; a full-contract confirm run was started, measured, and replaced after one partial run (kept out of the results). Up to 3 confirm targets run concurrently; muse spend is capped at $8.",
  "The screenshot-only driver is a noisy instrument on multi-screen flows (it failed even some baseline probes within the 20-step budget); separated ranges make confirmation conservative, and cross-kind agreements are noted qualitatively, not counted.",
  "Task-done judge is one text-only call per attempt (model muse-spark-1.3), reported separately from regressions.",
  "Agent worktrees held only the Circle app: seeds.ts removed, all seed branches resolved to baseline, apparatus prose and package identifiers neutralized, contracts/eval/packages/docs and sibling apps removed. Equivalence verified before the run: the stripped build measures 0 findings against the pristine baseline on all 4 contracts. File scope checked via git status on apps/circle/src plus a per-worktree banned-term grep (0 hits required).",
  "Arm B additionally passes --disable-sandbox: with the sandbox on, the agent cannot bind the dev-server port or run the gate wrapper (verified in T18: sandboxed probe curls 502, unsandboxed 200).",
];

let results = (await loadResults(outRoot)) ?? {
  baseRef,
  agentModel: "muse-spark-1.3-contributor",
  effort: "low",
  frozenTasks: "eval/agent-prs/tasks.json",
  scriptedRepeats: 1,
  museRepeats: 1,
  deviations: clean ? CLEAN_DEVIATIONS : DEVIATIONS,
  attempts: [],
  museSpot: [],
  costUsd: { judge: 0, museSpot: 0, agentRuns: null, note: "muse exec cost is unreported by the harness; judge + muse-spot tracked from API usage" },
} satisfies ResultsFile;
if (clean && results.kind !== "clean-18b") {
  results = {
    baseRef,
    agentModel: "muse-spark-1.3-contributor",
    effort: "low",
    frozenTasks: "eval/agent-prs/tasks.json",
    scriptedRepeats: 1,
    museRepeats: 3,
    deviations: CLEAN_DEVIATIONS,
    attempts: [],
    museSpot: [],
    costUsd: { judge: 0, museSpot: 0, agentRuns: null, note: "muse exec cost is unreported by the harness; judge + muse-confirm tracked from API usage" },
    kind: "clean-18b",
    sampleSeed: Number(values["sample-seed"]),
    gateWrapper: "/tmp/agencydiff-check",
    museConfirm: [],
  } satisfies ResultsFile;
}
results.baseRef = baseRef;
if (clean || results.kind !== "clean-18b") {
  results.deviations = clean ? CLEAN_DEVIATIONS : DEVIATIONS;
}

// Baseline dist: pristine worktree build of baseRef (clean main build).
// In clean mode always rebuild so the baseline cannot carry agent edits.
const baselineDist = path.join(outRoot, "dist-base");
if (clean) {
  const wt = "/tmp/ad-prs/baseline-src";
  await sh(ROOT, "git", ["worktree", "remove", "--force", wt]).catch(() => {});
  await sh(ROOT, "git", ["worktree", "add", "--detach", wt, baseRef]);
  try {
    await sh(wt, "pnpm", ["install", "--frozen-lockfile", "--prefer-offline"]);
    await buildCandidate(wt, baselineDist);
    console.log("clean baseline dist rebuilt from pristine worktree");
  } finally {
    await sh(ROOT, "git", ["worktree", "remove", "--force", wt]).catch(() => {});
  }
} else {
  try {
    await readFile(path.join(baselineDist, "index.html"), "utf8");
    console.log("baseline dist exists, reusing");
  } catch {
    const wt = "/tmp/ad-prs/baseline-src";
    await sh(ROOT, "git", ["worktree", "add", "--detach", wt, baseRef]).catch(() => {});
    try {
      await sh(wt, "pnpm", ["install", "--frozen-lockfile", "--prefer-offline"]);
      await buildCandidate(wt, baselineDist);
      console.log("baseline dist built");
    } finally {
      await sh(ROOT, "git", ["worktree", "remove", "--force", wt]).catch(() => {});
    }
  }
}
const baseline = await serveDir(baselineDist, 5191);
console.log(`baseline: ${baseline.url}`);

if (clean) {
  await writeGateWrapper("/tmp/agencydiff-check", { repoRoot: ROOT, baselineUrl: baseline.url });
  console.log("black-box gate wrapper written to /tmp/agencydiff-check");
}

/** Intents where scripted measurement flagged anything: the noise-check probes these. */
function noiseIntentsFor(r: ResultsFile): string[] {
  const out = new Set<string>();
  for (const a of r.attempts) {
    for (const label of a.regressions) {
      const mm = label.match(/^([^.]+)\.(.+) \[/);
      if (mm) out.add(`${mm[1]}.${mm[2]}`);
    }
  }
  return [...out].sort();
}

if (values["muse-confirm"]) {
  const noiseIntents = noiseIntentsFor(results);
  console.log(`noise-check intents: ${noiseIntents.join(", ")}`);
  const { targets, confirmedAttempts, capped } = await runMuseConfirmFocused({
    outRoot,
    apiKey,
    baselineUrl: baseline.url,
    sampleSeed: results.sampleSeed ?? 18,
    noiseIntents,
    workers: 3,
    costCapUsd: 8,
    log: (m) => console.log(m),
  });
  await baseline.close();
  console.log(await writeReport18b(outRoot));
  console.log(`muse-confirm done: ${targets} runs, ${confirmedAttempts} attempts confirmed${capped ? " (CAPPED)" : ""}`);
  process.exit(0);
}

if (values["muse-spot"]) {
  const repeats = 3;
  const targets = pickMuseSpotTargets(results);
  console.log(`${targets.length} muse spot targets at k=${repeats}`);
  for (const t of targets) {
    const dir = path.join(outRoot, "traces", t.arm, t.task, `attempt-${t.attempt}`);
    const cand = await serveDir(path.join(dir, "dist-candidate"));
    try {
      const m = await measureMuse({
        apiKey,
        baselineUrl: baseline.url,
        candidateUrl: cand.url,
        outDir: path.join(dir, "muse-spot"),
        contractPath: t.contractPath,
        repeats,
      });
      results.museRepeats = repeats;
      results.museSpot = results.museSpot.filter(
        (x) => !(x.arm === t.arm && x.task === t.task && x.attempt === t.attempt && x.contractPath === t.contractPath && x.repeats === repeats),
      );
      results.museSpot.push({
        arm: t.arm, task: t.task, attempt: t.attempt,
        contractPath: t.contractPath, repeats, passed: m.report.passed,
        findings: m.report.findings, inputTokens: m.inputTokens, outputTokens: m.outputTokens,
      });
      results.costUsd.museSpot += costForTokens(m.inputTokens, m.outputTokens);
      console.log(`muse ${t.arm}/${t.task}/${t.attempt} ${t.contractPath}: ${m.report.passed ? "PASS" : "FAIL"} ($${costForTokens(m.inputTokens, m.outputTokens).toFixed(3)})`);
    } finally {
      await cand.close();
    }
    await saveResults(outRoot, results);
  }
  await baseline.close();
  console.log("muse-spot done");
  process.exit(0);
}

const harnessBase: HarnessOpts = {
  baseRef,
  baselineUrl: baseline.url,
  apiKey,
  outRoot,
  attempts,
  devPortBase: Number(values["dev-port-base"]),
};

let jobCounter = 0;
const jobs: (() => Promise<void>)[] = [];
for (const arm of arms) {
  for (const task of tasks) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      const exists = results.attempts.some(
        (a) => a.arm === arm && a.task === task.id && a.attempt === attempt && !a.invalidReason && a.scripted,
      );
      if (exists) {
        console.log(`skip ${arm}/${task.id}/${attempt} (already complete)`);
        continue;
      }
      const n = jobCounter++;
      jobs.push(async () => {
        const devPort = harnessBase.devPortBase + (n % 3);
        console.log(`start ${arm}/${task.id}/${attempt} (dev port ${devPort})`);
        const r = clean
          ? await runOneCleanAttempt({ ...harnessBase, arm, task, attempt, devPort })
          : await runOneAttempt({ ...harnessBase, arm, task, attempt, devPort });
        if (r.judgeUsage) results.costUsd.judge += costForTokens(r.judgeUsage.in, r.judgeUsage.out);
        results.attempts = results.attempts.filter(
          (a) => !(a.arm === arm && a.task === task.id && a.attempt === attempt),
        );
        results.attempts.push(r);
        await saveResults(outRoot, results);
        console.log(
          `done ${arm}/${task.id}/${attempt}: ${r.invalidReason ? `INVALID ${r.invalidReason}` : `${r.regressions.length} regressions, taskDone=${r.taskDone?.addressed}`} (${r.execSeconds}s)`,
        );
      });
    }
  }
}
await runPool(jobs, 3);
if (clean) {
  const fresh = (await loadResults(outRoot)) ?? results;
  const noiseIntents = noiseIntentsFor(fresh);
  console.log(`noise-check intents: ${noiseIntents.join(", ")}`);
  const { targets, confirmedAttempts, capped } = await runMuseConfirmFocused({
    outRoot,
    apiKey,
    baselineUrl: baseline.url,
    sampleSeed: fresh.sampleSeed ?? 18,
    noiseIntents,
    workers: 3,
    costCapUsd: 8,
    log: (m) => console.log(m),
  });
  await baseline.close();
  console.log(`muse-confirm done: ${targets} runs, ${confirmedAttempts} attempts confirmed${capped ? " (CAPPED)" : ""}`);
  console.log(await writeReport18b(outRoot));
  console.log(`clean run done: ${results.attempts.length} attempts recorded`);
  process.exit(0);
}
await baseline.close();
await saveResults(outRoot, results);
console.log(`all arms done: ${results.attempts.length} attempts recorded`);
