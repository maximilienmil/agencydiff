import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { diffContract, type AgencyContract, type AgencyReport, type Trace, type Variant } from "@agencydiff/core";
import { MuseDriver, ScriptedDriver, type Driver } from "./drivers.js";
import { runProbe } from "./probe.js";
import { buildEntry, mergeRuns, type RunIndexEntry } from "./reportExport.js";

// Usage:
//   pnpm diff --contract contracts/location.json --driver scripted
//   MODEL_API_KEY=... pnpm diff --contract contracts/location.json --driver muse --repeats 3

const ROOT = path.resolve(import.meta.dirname, "../../..");

const { values } = parseArgs({
  options: {
    contract: { type: "string", default: "contracts/location.json" },
    baseline: { type: "string", default: "http://localhost:5173/?variant=baseline" },
    candidate: { type: "string", default: "http://localhost:5173/?variant=candidate" },
    driver: { type: "string", default: "scripted" },
    model: { type: "string" },
    repeats: { type: "string", default: "1" },
    intents: { type: "string" },
    out: { type: "string" },
    export: { type: "boolean", default: true },
  },
});

const contractPath = path.resolve(ROOT, values.contract!);
const contract: AgencyContract = JSON.parse(await readFile(contractPath, "utf8"));
const outDir = path.resolve(
  ROOT,
  values.out ?? path.join("runs", `${new Date().toISOString().replace(/[:.]/g, "-")}-${contract.decision}`),
);
await mkdir(outDir, { recursive: true });

async function makeDriver(variant: Variant): Promise<Driver> {
  if (values.driver === "muse") {
    const apiKey = process.env.MODEL_API_KEY;
    if (!apiKey) throw new Error("MODEL_API_KEY is not set");
    return new MuseDriver({ apiKey, model: values.model ?? process.env.MUSE_MODEL });
  }
  const refPath = path.join(ROOT, "eval", "reference_paths", path.basename(contractPath));
  const refs: Record<Variant, Record<string, string[]>> = JSON.parse(await readFile(refPath, "utf8"));
  return new ScriptedDriver((intent) => refs[variant][intent.id] ?? []);
}

const only = values.intents?.split(",");
const intents = contract.intents.filter((i) => !only || only.includes(i.id));
const repeats = Number(values.repeats);
const target = { baseline: values.baseline!, candidate: values.candidate! };
const traces: Trace[] = [];

for (const variant of ["baseline", "candidate"] as const) {
  const driver = await makeDriver(variant);
  for (const intent of intents) {
    for (let repeat = 0; repeat < repeats; repeat++) {
      const t = await runProbe({ contract, intent, variant, repeat, target, driver, outDir });
      traces.push(t);
      const mark = t.oracle.passed === false ? "✗" : t.oracle.passed ? "✓" : "?";
      console.log(`${mark} ${variant.padEnd(9)} ${intent.id.padEnd(10)} #${repeat} ${t.steps.length} steps (${t.stoppedReason})`);
    }
  }
}

const report = diffContract({ ...contract, intents }, traces);
await writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
printReport(report);
console.log(`\ntraces + report: ${path.relative(process.cwd(), outDir)}`);
if (values.export) await exportToReportApp({ contract, report, outDir, target });
process.exitCode = report.passed ? 0 : 1;

function printReport(r: AgencyReport) {
  console.log(`\n${r.passed ? "PASS" : "FAIL"}  ${r.decision}: ${r.promise}`);
  for (const f of r.findings) {
    console.log(`  [${f.severity.toUpperCase()}] ${f.title}: ${fmt(f.baseline)} → ${fmt(f.candidate)}`);
  }
}

function fmt(v: unknown): string {
  return typeof v === "number" && !Number.isInteger(v) ? v.toFixed(2) : String(v);
}

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
