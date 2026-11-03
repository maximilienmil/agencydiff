import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  auditContract,
  diffContract,
  type AgencyContract,
  type AgencyReport,
  type AuditReport,
  type Trace,
  type Variant,
} from "@agencydiff/core";
import { MuseDriver, ScriptedDriver, type Driver } from "@agencydiff/runner/src/drivers.js";
import { runProbe } from "@agencydiff/runner/src/probe.js";
import { assertTraceCoverage, loadRecordedTraces } from "@agencydiff/runner/src/recordedTraces.js";

export type DriverName = "scripted" | "muse";

export interface DiffOptions {
  contract: AgencyContract;
  contractLabel: string;
  refs: Record<Variant, Record<string, string[]>> | null;
  baselineUrl: string;
  candidateUrl: string;
  driver: DriverName;
  model?: string;
  repeats: number;
  intents?: string[];
  outDir: string;
  scriptedFrom?: "each" | "baseline" | "candidate";
}

export interface AuditOptions {
  contract: AgencyContract;
  refs: Record<Variant, Record<string, string[]>> | null;
  url: string;
  driver: DriverName;
  model?: string;
  repeats: number;
  intents?: string[];
  outDir: string;
}

/** Where the bundled data lives: packages/cli/data in dev, dist/../data packed. */
export async function findDataDir(): Promise<string> {
  const here = path.resolve(import.meta.dirname);
  const candidates = [
    path.join(here, "..", "data"),
    path.join(here, "..", "..", "packages", "cli", "data"),
    path.join(here, "..", "..", "..", "packages", "cli", "data"),
  ];
  for (const c of candidates) {
    try {
      await readdir(path.join(c, "contracts"));
      return c;
    } catch {
      /* next */
    }
  }
  // Last resort: walk up from cwd to a checkout root carrying contracts/.
  let dir = process.cwd();
  for (;;) {
    try {
      await readdir(path.join(dir, "contracts"));
      return dir;
    } catch {
      /* keep walking */
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return candidates[0];
}

export async function bundledContractFile(dataDir: string, decision: string): Promise<string | null> {
  let files: string[] = [];
  try {
    files = (await readdir(path.join(dataDir, "contracts"))).filter((f) => f.endsWith(".json"));
  } catch {
    return null;
  }
  for (const f of files) {
    try {
      const c = JSON.parse(await readFile(path.join(dataDir, "contracts", f), "utf8"));
      if (c.decision === decision) return path.join(dataDir, "contracts", f);
    } catch {
      /* skip unreadable */
    }
  }
  return null;
}

/** Accept a file path, a bundled Circle decision name, or inline contract JSON. */
export async function loadContract(
  ref: string,
  dataDir: string,
): Promise<{ contract: AgencyContract; label: string; fileBase: string }> {
  const asPath = path.isAbsolute(ref) ? ref : path.resolve(process.cwd(), ref);
  try {
    const contract = JSON.parse(await readFile(asPath, "utf8")) as AgencyContract;
    return { contract, label: asPath, fileBase: path.basename(asPath) };
  } catch {
    /* not a readable file */
  }
  const bundled = await bundledContractFile(dataDir, ref);
  if (bundled) {
    const contract = JSON.parse(await readFile(bundled, "utf8")) as AgencyContract;
    return { contract, label: `bundled:${ref}`, fileBase: path.basename(bundled) };
  }
  try {
    const contract = JSON.parse(ref) as AgencyContract;
    if (contract && typeof contract === "object" && Array.isArray(contract.intents)) {
      return { contract, label: "inline contract", fileBase: "" };
    }
  } catch {
    /* not inline JSON */
  }
  throw new Error(
    `Cannot resolve contract "${ref}": not a file, not a bundled decision, not JSON.`,
  );
}

export async function loadRefs(
  dataDir: string,
  fileBase: string,
  decision?: string,
): Promise<Record<Variant, Record<string, string[]>> | null> {
  const bases = [fileBase];
  // A renamed copy of a bundled contract still matches by decision.
  if (decision) {
    try {
      for (const f of await readdir(path.join(dataDir, "contracts"))) {
        if (!f.endsWith(".json")) continue;
        try {
          const c = JSON.parse(await readFile(path.join(dataDir, "contracts", f), "utf8"));
          if (c.decision === decision) bases.push(f);
        } catch {
          /* skip unreadable */
        }
      }
    } catch {
      /* no bundled contracts */
    }
  }
  const dirs = [path.join(dataDir, "reference_paths"), path.join(dataDir, "eval", "reference_paths")];
  for (const b of bases) {
    if (!b) continue;
    for (const d of dirs) {
      try {
        return JSON.parse(await readFile(path.join(d, b), "utf8"));
      } catch {
        /* next */
      }
    }
  }
  return null;
}

function makeDriver(kind: DriverName, model: string | undefined, refs: DiffOptions["refs"], variant: Variant, from: "each" | "baseline" | "candidate"): Driver {
  if (kind === "muse") {
    const apiKey = process.env.MODEL_API_KEY;
    if (!apiKey) throw new Error("MODEL_API_KEY is not set (needed for --driver muse)");
    return new MuseDriver({ apiKey, model: model ?? process.env.MUSE_MODEL });
  }
  if (!refs) {
    throw new Error(
      "No scripted reference paths for this contract; use --driver muse, or a bundled Circle contract.",
    );
  }
  const use = from === "each" ? variant : from;
  return new ScriptedDriver((intent) => refs[use]?.[intent.id] ?? []);
}

export async function runDiff(opts: DiffOptions): Promise<{ report: AgencyReport; outDir: string }> {
  const only = opts.intents;
  const intents = opts.contract.intents.filter((i) => !only || only.includes(i.id));
  if (intents.length === 0) throw new Error("No intents selected");
  const from = opts.scriptedFrom ?? "each";
  const target = { baseline: opts.baselineUrl, candidate: opts.candidateUrl };
  const traces: Trace[] = [];
  for (const variant of ["baseline", "candidate"] as const) {
    const driver = makeDriver(opts.driver, opts.model, opts.refs, variant, from);
    for (const intent of intents) {
      for (let repeat = 0; repeat < opts.repeats; repeat++) {
        const t = await runProbe({
          contract: opts.contract,
          intent,
          variant,
          repeat,
          target,
          driver,
          outDir: opts.outDir,
        });
        traces.push(t);
        const mark = t.oracle.passed === false ? "✗" : t.oracle.passed ? "✓" : "?";
        console.error(`${mark} ${opts.contract.decision} ${variant.padEnd(9)} ${intent.id.padEnd(12)} #${repeat} ${t.steps.length} steps (${t.stoppedReason})`);
      }
    }
  }
  const report = diffContract({ ...opts.contract, intents }, traces);
  await mkdir(opts.outDir, { recursive: true });
  await writeFile(path.join(opts.outDir, "report.json"), JSON.stringify(report, null, 2));
  printReport(report);
  return { report, outDir: opts.outDir };
}

export interface DiffRecordedOptions {
  contract: AgencyContract;
  contractLabel: string;
  tracesDir: string;
  intents?: string[];
  outDir: string;
}

/** Deterministic diff over pre-recorded Traces: no browser, no model, no
 *  state server. The traces carry their own variant labels; the same
 *  unmodified diffContract scores them. Recorded-trace scoring answers
 *  "do these two recorded runs differ" — it does not re-probe the app,
 *  so it is not live probing and not an Action deployment. */
export async function runDiffRecorded(opts: DiffRecordedOptions): Promise<{ report: AgencyReport; outDir: string }> {
  const only = opts.intents;
  const intents = opts.contract.intents.filter((i) => !only || only.includes(i.id));
  if (intents.length === 0) throw new Error("No intents selected");
  const traces = (await loadRecordedTraces(opts.tracesDir, opts.contract)).filter(
    (t) => intents.some((i) => i.id === t.intentId),
  );
  assertTraceCoverage(traces, { ...opts.contract, intents });
  const report = diffContract({ ...opts.contract, intents }, traces);
  await mkdir(opts.outDir, { recursive: true });
  await writeFile(path.join(opts.outDir, "report.json"), JSON.stringify(report, null, 2));
  printReport(report);
  return { report, outDir: opts.outDir };
}

export async function runAudit(opts: AuditOptions): Promise<{ report: AuditReport; outDir: string }> {
  const only = opts.intents;
  const intents = opts.contract.intents.filter((i) => !only || only.includes(i.id));
  if (intents.length === 0) throw new Error("No intents selected");
  const apiKey = process.env.MODEL_API_KEY;
  const driver: Driver =
    opts.driver === "muse"
      ? (() => {
          if (!apiKey) throw new Error("MODEL_API_KEY is not set (needed for --driver muse)");
          return new MuseDriver({ apiKey, model: opts.model ?? process.env.MUSE_MODEL, audit: true });
        })()
      : (() => {
          if (!opts.refs) {
            throw new Error(
              "No scripted reference paths for this contract; use --driver muse, or a bundled Circle contract.",
            );
          }
          return new ScriptedDriver((intent) => opts.refs!.baseline?.[intent.id] ?? []);
        })();
  const target = { baseline: opts.url, candidate: opts.url } as Record<Variant, string>;
  const traces: Trace[] = [];
  for (const intent of intents) {
    for (let repeat = 0; repeat < opts.repeats; repeat++) {
      const t = await runProbe({
        contract: opts.contract,
        intent,
        variant: "baseline",
        repeat,
        target,
        driver,
        outDir: opts.outDir,
        oracle: { adapter: "state-hook", audit: true },
      });
      traces.push(t);
      const mark = t.oracle.passed === false ? "✗" : t.oracle.passed ? "✓" : "?";
      console.error(`${mark} ${intent.id.padEnd(12)} #${repeat} ${t.steps.length} steps (${t.stoppedReason})`);
    }
  }
  const report = auditContract(opts.contract, "baseline", opts.url, traces, false);
  await mkdir(opts.outDir, { recursive: true });
  await writeFile(path.join(opts.outDir, "audit.json"), JSON.stringify(report, null, 2));
  console.error(`\nAUDIT ${report.decision}: cost ${report.cost.totalActions} actions across ${report.cost.traces} traces`);
  return { report, outDir: opts.outDir };
}

function printReport(r: AgencyReport) {
  console.error(`\n${r.passed ? "PASS" : "FAIL"}  ${r.decision}`);
  for (const f of r.findings) {
    console.error(`  [${f.severity.toUpperCase()}] ${f.title}: ${fmt(f.baseline)} → ${fmt(f.candidate)}`);
  }
}

function fmt(v: unknown): string {
  return typeof v === "number" && !Number.isInteger(v) ? v.toFixed(2) : String(v);
}
