import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { diffContract, type AgencyContract, type AgencyReport, type Trace, type Variant } from "@agencydiff/core";
import { MuseDriver, ScriptedDriver, type Driver } from "@agencydiff/runner/src/drivers.js";
import { runProbe } from "@agencydiff/runner/src/probe.js";
import {
  qualify,
  scoreSeed,
  summarizeVerdicts,
  type GroundTruthEntry,
  type SeedVerdict,
} from "@agencydiff/runner/src/benchScore.js";
import { findDataDir } from "../engine.js";

const PREFIX_TO_DECISION: Record<string, string> = {
  LOC: "precise_location",
  DM: "teen_dm",
  ST: "screen_time",
  SUB: "subscription",
};

export async function benchCommand(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    options: {
      base: { type: "string" },
      driver: { type: "string", default: "scripted" },
      model: { type: "string" },
      repeats: { type: "string", default: "1" },
      seeds: { type: "string" },
      out: { type: "string" },
    },
    args: argv,
  });
  if (values.driver !== "scripted" && values.driver !== "muse") {
    throw new Error(`--driver must be scripted or muse, got ${values.driver}`);
  }
  const dataDir = await findDataDir();
  const groundPath = path.join(dataDir, "ground_truth.json");
  let truth: GroundTruthEntry[];
  try {
    truth = JSON.parse(await readFile(groundPath, "utf8")).seeds;
  } catch {
    throw new Error(
      `No bench data found (looked for ${groundPath}). bench ships with the Circle benchmark; run it from a checkout or a packed install.`,
    );
  }
  const base = (values.base ?? "http://localhost:5173").replace(/\/$/, "");
  const repeats = Number(values.repeats);
  const only = values.seeds?.split(",").map((s) => s.trim()).filter(Boolean);
  const seeds = truth.filter((t) => !only || only.includes(t.seed));
  if (seeds.length === 0) throw new Error("No seeds selected");

  const contracts = await loadBundledContracts(dataDir);
  const refs = await loadBundledRefs(dataDir);
  const apiKey = process.env.MODEL_API_KEY;
  if (values.driver === "muse" && !apiKey) throw new Error("MODEL_API_KEY is not set");

  const outRoot = path.resolve(values.out ?? path.join("runs", `${new Date().toISOString().replace(/[:.]/g, "-")}-bench`));
  const verdicts: SeedVerdict[] = [];
  for (const entry of seeds) {
    const affected = contractsFor(entry.seed, contracts);
    const target = { baseline: `${base}/?variant=baseline`, candidate: `${base}/?seeds=${entry.seed}` };
    const outDir = path.join(outRoot, "traces", entry.seed);
    await mkdir(outDir, { recursive: true });
    const reports: AgencyReport[] = [];
    const tracesByIntent = new Map<string, { baseline: Trace[]; candidate: Trace[] }>();
    for (const contract of affected) {
      const driver: Driver =
        values.driver === "muse"
          ? new MuseDriver({ apiKey: apiKey!, model: values.model ?? process.env.MUSE_MODEL })
          : new ScriptedDriver((intent) => refs[contract.file]?.baseline?.[intent.id] ?? []);
      const traces: Trace[] = [];
      for (const intent of contract.intents) {
        for (let repeat = 0; repeat < repeats; repeat++) {
          for (const variant of ["baseline", "candidate"] as const) {
            traces.push(await runProbe({ contract, intent, variant, repeat, target, driver, outDir }));
          }
        }
      }
      reports.push(diffContract(contract, traces));
      for (const intent of contract.intents) {
        tracesByIntent.set(qualify(intent.id, contract.decision), {
          baseline: traces.filter((t) => t.intentId === intent.id && t.variant === "baseline"),
          candidate: traces.filter((t) => t.intentId === intent.id && t.variant === "candidate"),
        });
      }
    }
    const verdict = scoreSeed({
      seed: entry.seed,
      truth: entry,
      contracts: affected.map((c) => c.decision),
      reports,
      tracesByIntent,
    });
    verdicts.push(verdict);
    console.log(`${entry.seed}: ${verdict.detected ? "caught" : verdict.kind === "control" ? (verdict.falseAlarm ? "FALSE ALARM" : "clean") : "MISSED"}`);
  }
  const totals = summarizeVerdicts(verdicts);
  await mkdir(outRoot, { recursive: true });
  await writeFile(path.join(outRoot, "bench.json"), JSON.stringify({ driver: values.driver, repeats, perSeed: verdicts, ...totals }, null, 2));
  console.log(`\ncaught ${totals.detected}/${totals.regressions} regressions, ${totals.falseAlarms.length}/${totals.controls} control false alarms`);
  console.log(`bench: ${path.relative(process.cwd(), outRoot)}`);
  if (totals.detected < totals.regressions) process.exitCode = 1;
}

type BundledContract = AgencyContract & { file: string };

function contractsFor(seed: string, contracts: BundledContract[]): BundledContract[] {
  const decision = PREFIX_TO_DECISION[seed.split("_")[0]];
  return decision ? contracts.filter((c) => c.decision === decision) : contracts;
}

async function loadBundledContracts(dataDir: string): Promise<BundledContract[]> {
  const dir = await dataContractsDir(dataDir);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  const out: BundledContract[] = [];
  for (const f of files) {
    out.push({ ...JSON.parse(await readFile(path.join(dir, f), "utf8")), file: f });
  }
  return out.sort((a, b) => a.decision.localeCompare(b.decision));
}

async function dataContractsDir(dataDir: string): Promise<string> {
  const direct = path.join(dataDir, "contracts");
  try {
    await readdir(direct);
    return direct;
  } catch {
    return dataDir;
  }
}

async function loadBundledRefs(dataDir: string): Promise<Record<string, Record<Variant, Record<string, string[]>>>> {
  const dirs = [path.join(dataDir, "reference_paths"), path.join(dataDir, "eval", "reference_paths")];
  for (const d of dirs) {
    try {
      const files = (await readdir(d)).filter((f) => f.endsWith(".json"));
      const out: Record<string, Record<Variant, Record<string, string[]>>> = {};
      for (const f of files) out[f] = JSON.parse(await readFile(path.join(d, f), "utf8"));
      if (files.length > 0) return out;
    } catch {
      /* next */
    }
  }
  return {};
}
