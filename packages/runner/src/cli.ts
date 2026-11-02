import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { diffContract, type AgencyContract, type AgencyReport, type Trace, type Variant } from "@agencydiff/core";
import { MuseDriver, ScriptedDriver, type Driver } from "./drivers.js";
import { runProbe } from "./probe.js";
import { loadTargetConfig, assertDiffOracle } from "./targets.js";
import { buildEntry, mergeRuns, type RunIndexEntry } from "./reportExport.js";

// Usage:
//   pnpm diff --contract contracts/location.json --driver scripted
//   pnpm diff --target targets/circle-pr.json --baseline <base-url> --candidate <head-url> \
//     --driver scripted --scripted-from baseline --out runs/ci-... --report-url <run-url>
//   MODEL_API_KEY=... pnpm diff --contract contracts/location.json --driver muse --repeats 3
//
// Exit code is non-zero when any contract fails, so the same command works as a CI gate.

const ROOT = path.resolve(import.meta.dirname, "../../..");

const { values } = parseArgs({
  options: {
    contract: { type: "string", default: "contracts/location.json" },
    target: { type: "string" },
    baseline: { type: "string", default: "http://localhost:5173/?variant=baseline" },
    candidate: { type: "string", default: "http://localhost:5173/?variant=candidate" },
    driver: { type: "string", default: "scripted" },
    model: { type: "string" },
    repeats: { type: "string", default: "1" },
    intents: { type: "string" },
    out: { type: "string" },
    export: { type: "boolean", default: true },
    // Node's parseArgs has no automatic --no- negation, so declare it.
    "no-export": { type: "boolean", default: false },
    /** Which variant's reference path the scripted driver replays on both
     *  builds. "baseline" turns a moved control into a failed finding on a
     *  real candidate build, not just under ?seeds= flags. */
    "scripted-from": { type: "string", default: "each" },
    /** Link to the full report (workflow run URL), embedded in comment.md. */
    "report-url": { type: "string" },
    /** Marker identifying the sticky PR comment. Defaults to "agencydiff". */
    marker: { type: "string", default: "agencydiff" },
    "base-ref": { type: "string" },
    "head-ref": { type: "string" },
    /** Production-safe probing: allow-listed settings only, restore after. */
    "prod-safe": { type: "boolean", default: false },
    /** storageState session file; overrides the target's auth declaration. */
    "storage-state": { type: "string" },
    // Like --no-export: Node's parseArgs has no automatic --no- negation.
    "no-restore": { type: "boolean", default: false },
  },
});

if (values["no-export"]) values.export = false;

const scriptedFrom = values["scripted-from"];
if (scriptedFrom !== "each" && scriptedFrom !== "baseline" && scriptedFrom !== "candidate") {
  throw new Error(`--scripted-from must be each, baseline or candidate (got ${scriptedFrom})`);
}

async function makeDriver(contractPath: string, variant: Variant): Promise<Driver> {
  if (values.driver === "muse") {
    const apiKey = process.env.MODEL_API_KEY;
    if (!apiKey) throw new Error("MODEL_API_KEY is not set");
    return new MuseDriver({
      apiKey,
      model: values.model ?? process.env.MUSE_MODEL,
      prodSafe: values["prod-safe"] === true,
    });
  }
  const refPath = path.join(ROOT, "eval", "reference_paths", path.basename(contractPath));
  const refs: Record<Variant, Record<string, string[]>> = JSON.parse(await readFile(refPath, "utf8"));
  const from = scriptedFrom === "each" ? variant : (scriptedFrom as Variant);
  return new ScriptedDriver((intent) => refs[from]?.[intent.id] ?? []);
}

async function runOneContract(
  contractPath: string,
  outDir: string,
): Promise<{ contract: AgencyContract; report: AgencyReport; outDir: string }> {
  const abs = path.resolve(ROOT, contractPath);
  const contract: AgencyContract = JSON.parse(await readFile(abs, "utf8"));
  const dir = path.join(outDir, contract.decision);
  await mkdir(dir, { recursive: true });

  const only = values.intents?.split(",");
  const intents = contract.intents.filter((i) => !only || only.includes(i.id));
  const repeats = Number(values.repeats);
  const target = { baseline: values.baseline!, candidate: values.candidate! };
  const traces: Trace[] = [];
  const storageState = values["storage-state"] ? path.resolve(ROOT, values["storage-state"]) : undefined;
  // An explicit CLI flag overrides the target file's auth declaration.
  const auth = storageState ?? targetAuth?.storageState;
  const prodSafe = values["prod-safe"] === true
    ? { allowedTags: contract.prodSafe?.allowedTags, restore: values["no-restore"] !== true }
    : undefined;

  for (const variant of ["baseline", "candidate"] as const) {
    const driver = await makeDriver(contractPath, variant);
    for (const intent of intents) {
      for (let repeat = 0; repeat < repeats; repeat++) {
        const t = await runProbe({
          contract,
          intent,
          variant,
          repeat,
          target,
          driver,
          outDir: dir,
          ...(auth ? { auth: { storageState: auth } } : {}),
          ...(prodSafe ? { prodSafe } : {}),
        });
        traces.push(t);
        const mark = t.oracle.passed === false ? "✗" : t.oracle.passed ? "✓" : "?";
        console.log(
          `${mark} ${contract.decision} ${variant.padEnd(9)} ${intent.id.padEnd(12)} #${repeat} ${t.steps.length} steps (${t.stoppedReason})`,
        );
      }
    }
  }

  const report = diffContract({ ...contract, intents }, traces);
  await writeFile(path.join(dir, "report.json"), JSON.stringify(report, null, 2));
  printReport(report);
  if (values.export) await exportToReportApp({ contract, report, outDir: dir, target });
  return { contract, report, outDir: dir };
}

function printReport(r: AgencyReport) {
  console.log(`\n${r.passed ? "PASS" : "FAIL"}  ${r.decision}: ${r.promise}`);
  for (const f of r.findings) {
    console.log(`  [${f.severity.toUpperCase()}] ${f.title}: ${fmt(f.baseline)} → ${fmt(f.candidate)}`);
  }
}

function fmt(v: unknown): string {
  return typeof v === "number" && !Number.isInteger(v) ? v.toFixed(2) : String(v);
}

/** Plain-language PR comment / job summary: one intent table per contract. */
function renderComment(results: { contract: AgencyContract; report: AgencyReport }[]): string {
  const passed = results.every((r) => r.report.passed);
  const lines = [
    `<!-- ${values.marker} -->`,
    `## AgencyDiff ${passed ? "passed" : "found regressions"}`,
    "",
  ];
  if (values["base-ref"] || values["head-ref"]) {
    lines.push(`Compared \`${values["base-ref"] ?? "?"}\` (baseline) against \`${values["head-ref"] ?? "?"}\` (candidate) with the ${values.driver} driver.`);
    lines.push("");
  }
  for (const { contract, report } of results) {
    lines.push(`### ${report.passed ? "PASS" : "FAIL"} — ${contract.decision}: ${contract.promise}`);
    lines.push("");
    const possibleHeader = values.driver === "scripted" ? "Baseline path still works" : "Still possible";
    lines.push(`| Intent | Steps needed | Visible on first screen | ${possibleHeader} | Severity |`);
    lines.push("| --- | --- | --- | --- | --- |");
    for (const intent of contract.intents) {
      const agg = (v: Variant) => report.aggregates.find((a) => a.intentId === intent.id && a.variant === v);
      const b = agg("baseline");
      const c = agg("candidate");
      const steps = `${b?.actionCount ?? "—"} → ${c?.actionCount ?? "—"}`;
      const vis = (a?: { initiallyVisible?: boolean }) =>
        a?.initiallyVisible === undefined ? "n/a" : a.initiallyVisible ? "yes" : "no";
      const possible = (a?: { successRate: number }) =>
        a === undefined ? "n/a" : a.successRate >= 1 ? "yes" : a.successRate <= 0 ? "no" : `${Math.round(a.successRate * 100)}%`;
      const sev = report.findings.filter((f) => f.intentId === intent.id).map((f) => f.severity);
      const worst = sev.includes("high") ? "high" : sev.includes("medium") ? "medium" : sev.includes("low") ? "low" : "—";
      lines.push(`| ${intent.goal} | ${steps} | ${vis(b)} → ${vis(c)} | ${possible(b)} → ${possible(c)} | ${worst} |`);
    }
    lines.push("");
    for (const f of report.findings) {
      lines.push(`- **[${f.severity}]** ${f.title}: ${fmt(f.baseline)} → ${fmt(f.candidate)}`);
    }
    if (report.findings.length > 0) lines.push("");
    const asym = report.asymmetry.filter((a) => a.baseline !== undefined || a.candidate !== undefined);
    const ratio = (v: number | undefined) => (v === undefined ? "n/a" : `${v.toFixed(1)}x`);
    for (const a of asym) {
      lines.push(
        `- Asymmetry (${a.accept} vs ${a.reject}): ${ratio(a.baseline)} → ${ratio(a.candidate)} cost of saying no vs saying yes`,
      );
    }
    if (asym.length > 0) lines.push("");
  }
  if (values["report-url"]) {
    lines.push(`Full traces and screenshots: [workflow run artifact](${values["report-url"]}).`);
    lines.push("");
  }
  if (values.driver === "scripted") {
    lines.push("_Scripted check: the candidate replays the baseline's recorded path. A broken path means a control moved or disappeared; add the `agencydiff:muse` label to have Muse probes search for the new path and measure its cost._");
  }
  lines.push("_Numbers come from recorded probe traces checked against final app state, never from a model's claim._");
  return lines.join("\n") + "\n";
}

const outDir = path.resolve(
  ROOT,
  values.out ?? path.join("runs", `${new Date().toISOString().replace(/[:.]/g, "-")}-diff`),
);
await mkdir(outDir, { recursive: true });

const contractPaths: string[] = [];
let targetAuth: { storageState?: string } | undefined;
if (values.target) {
  const targetFile = path.resolve(ROOT, values.target);
  const { config, dir } = await loadTargetConfig(targetFile);
  assertDiffOracle(config, values.target);
  if (config.auth?.storageState) {
    targetAuth = { storageState: path.resolve(dir, config.auth.storageState) };
  }
  const given = (flag: string) =>
    process.argv.some((a) => a === `--${flag}` || a.startsWith(`--${flag}=`));
  // Explicit CLI flags override the target file's URLs; otherwise use the file.
  if (!given("baseline") && config.urls.baseline) values.baseline = config.urls.baseline;
  if (!given("candidate") && config.urls.candidate) values.candidate = config.urls.candidate;
  for (const c of config.contracts) contractPaths.push(path.relative(ROOT, path.resolve(dir, c)));
} else {
  contractPaths.push(values.contract!);
}

const results = [];
for (const c of contractPaths) results.push(await runOneContract(c, outDir));

const comment = renderComment(results);
await writeFile(path.join(outDir, "comment.md"), comment);
console.log(`\ntraces + reports: ${path.relative(process.cwd(), outDir)}`);
console.log(`comment: ${path.relative(process.cwd(), path.join(outDir, "comment.md"))}`);

process.exitCode = results.every((r) => r.report.passed) ? 0 : 1;

/**
 * Copy a finished run into the report app's static data folder so the
 * viewer works with no backend. Skipped when the report app is absent
 * (other checkouts) or with --no-export.
 */
async function exportToReportApp(opts: {
  contract: AgencyContract;
  report: AgencyReport;
  outDir: string;
  target: { baseline: string; candidate: string };
}): Promise<void> {
  const dataDir = path.join(ROOT, "apps", "report", "public", "data");
  try {
    await readdir(path.join(ROOT, "apps", "report"));
  } catch {
    return;
  }
  const id = path.basename(opts.outDir);
  const dest = path.join(dataDir, id);
  await mkdir(dataDir, { recursive: true });
  await cp(opts.outDir, dest, { recursive: true });
  await writeFile(path.join(dest, "contract.json"), JSON.stringify(opts.contract, null, 2));
  await writeFile(
    path.join(dest, "meta.json"),
    JSON.stringify(
      {
        id,
        decision: opts.contract.decision,
        date: new Date().toISOString(),
        driver: values.driver,
        target: opts.target,
      },
      null,
      2,
    ),
  );

  let runs: RunIndexEntry[] = [];
  try {
    runs = JSON.parse(await readFile(path.join(dataDir, "index.json"), "utf8")).runs ?? [];
  } catch {
    runs = [];
  }
  const entry = buildEntry({
    id,
    report: opts.report,
    driver: String(values.driver),
    target: opts.target,
  });
  runs = mergeRuns(runs, entry);
  await writeFile(path.join(dataDir, "index.json"), JSON.stringify({ runs }, null, 2));
  console.log(`report data: ${path.relative(process.cwd(), dest)}`);
}
