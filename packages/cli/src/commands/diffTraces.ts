import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { findDataDir, loadContract, runDiffRecorded } from "../engine.js";
import { findConfigFile, loadConfig } from "../config.js";

export async function diffTracesCommand(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    options: {
      contract: { type: "string" },
      traces: { type: "string" },
      intents: { type: "string" },
      out: { type: "string" },
      config: { type: "string" },
    },
    args: argv,
  });
  const dataDir = await findDataDir();
  const configFile = values.config ?? (await findConfigFile(process.cwd()));
  const cfg = configFile ? (await loadConfig(configFile)).config : {};
  const ref = values.contract ?? cfg.contracts?.[0];
  if (!ref) {
    throw new Error("No contract: pass --contract <file|decision|json> or add contracts to agencydiff.config.json");
  }
  const tracesDir = values.traces ? path.resolve(values.traces) : null;
  if (!tracesDir) throw new Error("No traces: pass --traces <dir> holding one sub-directory per recorded trace");
  const { contract, label } = await loadContract(ref, dataDir);
  const outDir = path.resolve(values.out ?? cfg.out ?? path.join("runs", `${new Date().toISOString().replace(/[:.]/g, "-")}-diff-traces`, contract.decision));
  await mkdir(outDir, { recursive: true });
  console.log(`contract: ${label}`);
  console.log(`traces: ${tracesDir} (recorded-trace scoring: no browser, no model calls)`);
  const { report } = await runDiffRecorded({
    contract,
    contractLabel: label,
    tracesDir,
    intents: values.intents?.split(","),
    outDir,
  });
  await writeFile(path.join(outDir, "comment.md"), commentFor(contract.decision, report.passed, report.findings.length));
  console.log(`\nreports: ${path.relative(process.cwd(), outDir)}`);
  process.exitCode = report.passed ? 0 : 1;
}

function commentFor(decision: string, passed: boolean, findingCount: number): string {
  return [`## AgencyDiff ${passed ? "passed" : "found regressions"}`, "", `${decision}: ${findingCount} finding(s) (recorded traces).`, ""].join("\n");
}
