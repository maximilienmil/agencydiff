import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { diffContract, type AgencyContract, type Trace } from "@agencydiff/core";
import { buildEntry, mergeRuns, type RunIndexEntry } from "../src/reportExport.js";

// Usage: tsx scripts/export-traces.ts <run-dir> <contract> <baseline-url> <candidate-url>
// Rebuilds report.json from the Trace files already in <run-dir> and exports
// the run into apps/report/public/data, exactly as the CLI does on a live run.
const [runDirArg, contractArg, baseline, candidate] = process.argv.slice(2);
if (!runDirArg || !contractArg || !baseline || !candidate) {
  throw new Error("usage: export-traces.ts <run-dir> <contract> <baseline-url> <candidate-url>");
}
const ROOT = path.resolve(import.meta.dirname, "../../..");
const runDir = path.resolve(ROOT, runDirArg);
const contract: AgencyContract = JSON.parse(
  await readFile(path.resolve(ROOT, contractArg), "utf8"),
);

const traces: Trace[] = [];
for (const name of (await readdir(runDir)).sort()) {
  try {
    traces.push(JSON.parse(await readFile(path.join(runDir, name, "trace.json"), "utf8")));
  } catch {
    // not a trace directory
  }
}
if (traces.length === 0) throw new Error(`no traces in ${runDirArg}`);

const report = diffContract(contract, traces);
await writeFile(path.join(runDir, "report.json"), JSON.stringify(report, null, 2));

const dataDir = path.join(ROOT, "apps/report/public/data");
const id = path.basename(runDir);
const dest = path.join(dataDir, id);
await mkdir(dataDir, { recursive: true });
await cp(runDir, dest, { recursive: true });
await writeFile(path.join(dest, "contract.json"), JSON.stringify(contract, null, 2));
const target = { baseline, candidate };
await writeFile(
  path.join(dest, "meta.json"),
  JSON.stringify({ id, decision: contract.decision, date: new Date().toISOString(), driver: "muse", target }, null, 2),
);

let runs: RunIndexEntry[] = [];
try {
  runs = JSON.parse(await readFile(path.join(dataDir, "index.json"), "utf8")).runs ?? [];
} catch {
  runs = [];
}
runs = mergeRuns(runs, buildEntry({ id, report, driver: "muse", target }));
await writeFile(path.join(dataDir, "index.json"), JSON.stringify({ runs }, null, 2));
console.log(`${id}: ${traces.length} traces, passed=${report.passed}, findings=${report.findings.length}`);
