import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { sha256File } from "./bundle.js";
import type { AgencyContract, Trace } from "@agencydiff/core";
import { ScriptedDriver } from "../drivers.js";
import { runProbe } from "../probe.js";
import type { MatchedCase } from "./cases.js";

export const ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");

/** Collect scripted repeats=1 traces for one case into caseDir/traces. Deterministic. */
export async function collectCaseEvidence(opts: {
  caseDir: string;
  c: MatchedCase;
  contract: AgencyContract & { file: string };
  base: string;
}): Promise<Trace[]> {
  const refs = JSON.parse(
    await readFile(path.join(ROOT, "eval", "reference_paths", opts.contract.file), "utf8"),
  ).baseline as Record<string, string[]>;
  const driver = new ScriptedDriver((intent) => refs[intent.id] ?? []);
  const outDir = path.join(opts.caseDir, "traces");
  await mkdir(outDir, { recursive: true });
  const traces: Trace[] = [];
  for (const intent of opts.contract.intents) {
    for (const variant of ["baseline", "candidate"] as const) {
      const target = {
        baseline: `${opts.base}/?variant=baseline`,
        candidate: `${opts.base}/?seeds=${opts.c.seed}`,
      };
      traces.push(await runProbe({ contract: opts.contract, intent, variant, repeat: 0, target, driver, outDir }));
    }
  }
  return traces;
}

/** Write a sha256 manifest of every file under the case dir (PNGs included). */
export async function writeCaseManifest(caseDir: string): Promise<Record<string, string>> {
  const manifest: Record<string, string> = {};
  async function walk(dir: string): Promise<void> {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.name !== "manifest.json") manifest[path.relative(caseDir, full)] = await sha256File(full);
    }
  }
  await walk(caseDir);
  await writeFile(path.join(caseDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}

/** Load frozen traces back from disk (score/review phases never re-probe). */
export async function loadCaseTraces(caseDir: string): Promise<Trace[]> {
  const entries = await readdir(path.join(caseDir, "traces"));
  const traces: Trace[] = [];
  for (const e of entries) {
    const f = path.join(caseDir, "traces", e, "trace.json");
    if (existsSync(f)) traces.push(JSON.parse(await readFile(f, "utf8")));
  }
  return traces.sort((a, b) => a.id.localeCompare(b.id));
}

export async function loadContract(file: string): Promise<AgencyContract & { file: string }> {
  return { ...JSON.parse(await readFile(path.join(ROOT, "contracts", file), "utf8")), file };
}

export async function writeCaseIndex(outDir: string, cases: MatchedCase[]): Promise<void> {
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "cases.json"), JSON.stringify(cases, null, 2));
}
