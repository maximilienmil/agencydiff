import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  findDataDir,
  loadContract,
  loadRefs,
  runDiff,
  type DriverName,
} from "../engine.js";
import { findConfigFile, loadConfig } from "../config.js";
import { loadTargetConfig, assertDiffOracle } from "@agencydiff/runner/src/targets.js";

export async function diffCommand(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    options: {
      baseline: { type: "string" },
      candidate: { type: "string" },
      contract: { type: "string" },
      target: { type: "string" },
      driver: { type: "string", default: "scripted" },
      model: { type: "string" },
      repeats: { type: "string", default: "1" },
      intents: { type: "string" },
      out: { type: "string" },
      config: { type: "string" },
      "scripted-from": { type: "string", default: "each" },
    },
    args: argv,
  });
  if (values.driver !== "scripted" && values.driver !== "muse") {
    throw new Error(`--driver must be scripted or muse, got ${values.driver}`);
  }
  const from = values["scripted-from"];
  if (from !== "each" && from !== "baseline" && from !== "candidate") {
    throw new Error(`--scripted-from must be each, baseline or candidate (got ${from})`);
  }
  const dataDir = await findDataDir();
  const repeats = Number(values.repeats);

  // Config file supplies defaults; explicit flags win.
  const configFile = values.config ?? (await findConfigFile(process.cwd()));
  const cfg = configFile ? (await loadConfig(configFile)).config : {};
  const driver = (values.driver ?? cfg.driver ?? "scripted") as DriverName;
  const baseline = values.baseline ?? cfg.targets?.baseline;
  const candidate = values.candidate ?? cfg.targets?.candidate;

  const contracts: string[] = [];
  if (values.target) {
    const { config, dir } = await loadTargetConfig(path.resolve(values.target));
    assertDiffOracle(config, values.target);
    if (!values.baseline && config.urls.baseline) cfg.targets = { ...cfg.targets, baseline: config.urls.baseline };
    if (!values.candidate && config.urls.candidate) {
      cfg.targets = { ...cfg.targets, candidate: config.urls.candidate };
    }
    for (const c of config.contracts) contracts.push(path.resolve(dir, c));
  } else if (values.contract) {
    contracts.push(values.contract);
  } else if (cfg.contracts?.length) {
    const base = configFile ? path.dirname(path.resolve(configFile)) : process.cwd();
    for (const c of cfg.contracts) contracts.push(path.isAbsolute(c) ? c : path.resolve(base, c));
  } else if (cfg.targetFiles?.length) {
    const base = configFile ? path.dirname(path.resolve(configFile)) : process.cwd();
    for (const t of cfg.targetFiles) {
      const { config, dir } = await loadTargetConfig(path.resolve(base, t));
      assertDiffOracle(config, t);
      if (config.urls.baseline && !cfg.targets?.baseline) {
        cfg.targets = { ...cfg.targets, baseline: config.urls.baseline };
      }
      if (config.urls.candidate && !cfg.targets?.candidate) {
        cfg.targets = { ...cfg.targets, candidate: config.urls.candidate };
      }
      for (const c of config.contracts) contracts.push(path.resolve(dir, c));
    }
  }
  if (contracts.length === 0) {
    throw new Error("No contract: pass --contract <file|decision>, --target <file>, or add contracts to agencydiff.config.json");
  }
  const base = baseline ?? cfg.targets?.baseline;
  const cand = candidate ?? cfg.targets?.candidate;
  if (!base || !cand) {
    throw new Error("No baseline/candidate URLs: pass --baseline/--candidate or set targets in agencydiff.config.json");
  }

  const outRoot = path.resolve(values.out ?? cfg.out ?? path.join("runs", `${new Date().toISOString().replace(/[:.]/g, "-")}-diff`));
  let failed = false;
  for (const ref of contracts) {
    const { contract, label, fileBase } = await loadContract(ref, dataDir);
    const refs = await loadRefs(dataDir, fileBase, contract.decision);
    const outDir = path.join(outRoot, contract.decision);
    await mkdir(outDir, { recursive: true });
    console.log(`contract: ${label}`);
    const { report } = await runDiff({
      contract,
      contractLabel: label,
      refs,
      baselineUrl: base,
      candidateUrl: cand,
      driver,
      model: values.model ?? cfg.model,
      repeats: Number.isFinite(repeats) ? repeats : (cfg.repeats ?? 1),
      intents: values.intents?.split(","),
      outDir,
      scriptedFrom: from as "each" | "baseline" | "candidate",
    });
    await writeFile(path.join(outDir, "comment.md"), commentFor(contract.decision, report.passed, report.findings.length));
    if (!report.passed) failed = true;
  }
  console.log(`\nreports: ${path.relative(process.cwd(), outRoot)}`);
  process.exitCode = failed ? 1 : 0;
}

function commentFor(decision: string, passed: boolean, findingCount: number): string {
  return [`## AgencyDiff ${passed ? "passed" : "found regressions"}`, "", `${decision}: ${findingCount} finding(s).`, ""].join("\n");
}
