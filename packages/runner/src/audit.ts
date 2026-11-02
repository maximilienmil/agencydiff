import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  auditContract,
  type AgencyContract,
  type AuditReport,
  type Trace,
  type Variant,
} from "@agencydiff/core";
import { MuseDriver, ScriptedDriver, type Driver } from "./drivers.js";
import { judgeScreenshot } from "./judge.js";
import { runProbe } from "./probe.js";
import { assertDiffOracle, loadTargetConfig } from "./targets.js";

// Usage:
//   pnpm audit --target targets/circle.json --driver scripted
//   MODEL_API_KEY=... pnpm audit --target targets/shop.json --driver muse
//
// Audit probes a single Variant with read-only discovery intents and reports
// cost + Asymmetry only. The browser refuses non-search submits, credential
// entry and purchase navigation; the agent instructions say the same.
// The per-Probe step budget defaults to 25 (--max-steps, or MUSE_MAX_STEPS).

const ROOT = path.resolve(import.meta.dirname, "../../..");

const { values } = parseArgs({
  options: {
    target: { type: "string" },
    variant: { type: "string" },
    driver: { type: "string", default: "scripted" },
    model: { type: "string" },
    repeats: { type: "string", default: "1" },
    intents: { type: "string" },
    out: { type: "string" },
    "max-steps": { type: "string" },
  },
});

if (!values.target) throw new Error("--target <target.json> is required");

// Resolve from the repo root like --contract/--out, since pnpm runs this
// from the package directory.
const { config, dir } = await loadTargetConfig(path.resolve(ROOT, values.target));
// Audits never run a two-Variant Diff, so this only guards future callers
// that would feed a model-judged target into pnpm diff.
assertDiffOracle(config, values.target);

const variant = (values.variant ?? config.auditVariant ?? "baseline") as Variant;
const url = config.urls[variant];
if (!url) throw new Error(`Target has no URL for variant "${variant}"`);

const apiKey = process.env.MODEL_API_KEY;
const needsJudge = config.oracle === "model-judged" && values.driver === "muse";
if (config.oracle === "model-judged" && !apiKey) throw new Error("MODEL_API_KEY is not set");

/** Real sites take longer to explore than the sandbox: 25 steps per Probe,
 *  raised or lowered with --max-steps (or MUSE_MAX_STEPS). */
export const DEFAULT_AUDIT_MAX_STEPS = 25;

async function makeMuseDriver(): Promise<Driver> {
  if (!apiKey) throw new Error("MODEL_API_KEY is not set");
  const maxSteps = Number(values["max-steps"] ?? process.env.MUSE_MAX_STEPS ?? DEFAULT_AUDIT_MAX_STEPS);
  return new MuseDriver({
    apiKey,
    model: values.model ?? process.env.MUSE_MODEL,
    audit: true,
    maxSteps,
  });
}

const outDir = path.resolve(
  ROOT,
  values.out ?? path.join("runs", `audit-${Date.now()}-${config.oracle}`),
);
await mkdir(outDir, { recursive: true });

const only = values.intents?.split(",");
const repeats = Number(values.repeats);
const reports: AuditReport[] = [];

// Scripted paths are per-contract reference files; resolve lazily per contract.
const refsCache = new Map<string, Record<Variant, Record<string, string[]>>>();
async function scriptedFor(contractPath: string, v: Variant): Promise<ScriptedDriver> {
  let refs = refsCache.get(contractPath);
  if (!refs) {
    try {
      refs = JSON.parse(
        await readFile(path.join(ROOT, "eval", "reference_paths", path.basename(contractPath)), "utf8"),
      ) as Record<Variant, Record<string, string[]>>;
    } catch {
      throw new Error(
        `No reference paths for ${path.basename(contractPath)}; audit of non-Circle targets needs --driver muse`,
      );
    }
    refsCache.set(contractPath, refs);
  }
  return new ScriptedDriver((intent) => refs[v]?.[intent.id] ?? []);
}

for (const contractRel of config.contracts) {
  const contractPath = path.resolve(dir, contractRel);
  const contract: AgencyContract = JSON.parse(await readFile(contractPath, "utf8"));
  const intents = contract.intents.filter((i) => !only || only.includes(i.id));
  const driver =
    values.driver === "muse"
      ? await makeMuseDriver()
      : await scriptedFor(contractPath, variant);
  const traces: Trace[] = [];
  const target = { baseline: url, candidate: url } as Record<Variant, string>;

  for (const intent of intents) {
    for (let repeat = 0; repeat < repeats; repeat++) {
      const t = await runProbe({
        contract,
        intent,
        variant,
        repeat,
        target,
        driver,
        outDir: path.join(outDir, contract.decision),
        oracle: {
          adapter: config.oracle,
          audit: true,
          judge: needsJudge
            ? (png) =>
                judgeScreenshot({
                  apiKey: apiKey!,
                  model: values.model ?? process.env.MUSE_MODEL,
                  goal: intent.goal,
                  png,
                })
            : undefined,
        },
      });
      traces.push(t);
      const mark = t.modelJudged ? "◉" : t.oracle.passed === false ? "✗" : t.oracle.passed ? "✓" : "?";
      console.log(`${mark} ${variant.padEnd(9)} ${intent.id.padEnd(10)} #${repeat} ${t.steps.length} steps (${t.stoppedReason})`);
    }
  }

  const judged = config.oracle === "model-judged";
  const report = auditContract(contract, variant, url, traces, judged);
  await mkdir(path.join(outDir, contract.decision), { recursive: true });
  await writeFile(
    path.join(outDir, contract.decision, "audit.json"),
    JSON.stringify(report, null, 2),
  );
  reports.push(report);
  printAudit(report);
}

console.log(`\naudits: ${path.relative(process.cwd(), outDir)}`);

function printAudit(r: AuditReport) {
  console.log(`\nAUDIT ${r.decision} (${r.variant}${r.modelJudged ? ", model-judged" : ""}): ${r.promise}`);
  for (const a of r.aggregates) {
    console.log(`  ${a.intentId}: success ${a.successRate} · to-fact ${a.actionsToSatisfy ?? "—"} · actions ${a.actionCount ?? "—"} · depth ${a.navigationDepth ?? "—"}`);
  }
  for (const a of r.asymmetry) {
    console.log(`  asymmetry ${a.accept}/${a.reject}: ${a.ratio === undefined ? "—" : `${a.ratio.toFixed(2)}x`}`);
  }
  console.log(`  cost: ${r.cost.totalActions} actions / ${r.cost.totalSteps} steps across ${r.cost.traces} traces`);
}
