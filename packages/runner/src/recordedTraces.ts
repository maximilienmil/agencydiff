import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { AgencyContract, Trace, Variant } from "@agencydiff/core";

const VARIANTS: Variant[] = ["baseline", "candidate"];
const STOPPED = ["agent_done", "script_done", "step_budget", "satisfied", "error"] as const;

/** Where a trace.json was found: the file plus its directory (screenshot base). */
interface Located {
  file: string;
  dir: string;
}

async function collectTraceFiles(dir: string, out: Located[]): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (e) {
    throw new Error(`Traces dir not readable: ${dir} (${(e as Error).message})`);
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    let st: Awaited<ReturnType<typeof stat>>;
    try {
      st = await stat(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      const candidate = path.join(full, "trace.json");
      try {
        await stat(candidate);
        out.push({ file: candidate, dir: full });
      } catch {
        // Not a trace dir: recurse one level for nested layouts.
        await collectTraceFiles(full, out);
      }
    } else if (entry === "trace.json") {
      out.push({ file: full, dir });
    }
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Structural check that a parsed trace.json is a spec-compliant Trace.
 *  This guards shape only; provenance (real device screenshots, live
 *  oracle reads) is established by the adapter and documented, not
 *  re-derived here. */
function checkShape(t: unknown, file: string): asserts t is Trace {
  if (!isRecord(t)) throw new Error(`Invalid trace ${file}: not a JSON object`);
  for (const k of ["id", "decision", "intentId", "variant", "repeat", "driver", "startedAt", "initial", "steps", "final", "oracle", "stoppedReason"]) {
    if (!(k in t)) throw new Error(`Invalid trace ${file}: missing "${k}"`);
  }
  if (typeof t.id !== "string" || t.id.length === 0) throw new Error(`Invalid trace ${file}: bad "id"`);
  if (!VARIANTS.includes(t.variant as Variant)) {
    throw new Error(`Invalid trace ${file}: "variant" must be baseline or candidate`);
  }
  if (!isRecord(t.driver) || (t.driver.kind !== "scripted" && t.driver.kind !== "muse")) {
    throw new Error(`Invalid trace ${file}: bad "driver.kind"`);
  }
  if (!isRecord(t.oracle) || typeof t.oracle.checked !== "boolean") {
    throw new Error(`Invalid trace ${file}: bad "oracle.checked"`);
  }
  if (t.oracle.checked && typeof t.oracle.passed !== "boolean") {
    throw new Error(`Invalid trace ${file}: checked oracle needs a boolean "passed"`);
  }
  if (!Array.isArray(t.steps)) throw new Error(`Invalid trace ${file}: "steps" must be an array`);
  if (!(STOPPED as readonly string[]).includes(t.stoppedReason as string)) {
    throw new Error(`Invalid trace ${file}: bad "stoppedReason"`);
  }
  if (!isRecord(t.initial) || !isRecord((t.initial as Record<string, unknown>).observation)) {
    throw new Error(`Invalid trace ${file}: bad "initial.observation"`);
  }
  for (const [i, s] of (t.steps as unknown[]).entries()) {
    if (!isRecord(s) || !Array.isArray((s as Record<string, unknown>).actions) || !isRecord((s as Record<string, unknown>).after)) {
      throw new Error(`Invalid trace ${file}: step ${i} needs "actions" and "after"`);
    }
    for (const a of (s as { actions: unknown[] }).actions) {
      if (!isRecord(a) || typeof a.type !== "string") throw new Error(`Invalid trace ${file}: step ${i} has a malformed action`);
      if ((a.type === "click" || a.type === "double_click") && (typeof a.x !== "number" || typeof a.y !== "number" || !Number.isFinite(a.x) || !Number.isFinite(a.y))) {
        throw new Error(`Invalid trace ${file}: step ${i} click needs finite x/y coordinates`);
      }
      if (a.type === "type" && typeof a.text !== "string") {
        throw new Error(`Invalid trace ${file}: step ${i} type action needs "text"`);
      }
    }
  }
}

/** Every screenshot a trace references must exist next to it and be non-empty.
 *  References are bare filenames (runner layout); absolute paths and parent
 *  traversal are rejected so a trace bundle cannot point outside itself. */
export async function assertTraceEvidence(trace: Trace, dir: string, file: string): Promise<void> {
  const shots = [trace.initial.observation.screenshot, ...trace.steps.map((s) => s.after.screenshot)];
  for (const shot of shots) {
    if (typeof shot !== "string" || shot.length === 0) {
      throw new Error(`Missing evidence in ${file}: trace ${trace.id} has an empty screenshot reference`);
    }
    if (path.isAbsolute(shot) || shot.split(path.sep).includes("..")) {
      throw new Error(`Missing evidence in ${file}: trace ${trace.id} references screenshot outside its dir: ${shot}`);
    }
    const full = path.join(dir, shot);
    let st: Awaited<ReturnType<typeof stat>>;
    try {
      st = await stat(full);
    } catch {
      throw new Error(`Missing evidence in ${file}: trace ${trace.id} references absent screenshot ${shot}`);
    }
    if (!st.isFile() || st.size === 0) {
      throw new Error(`Missing evidence in ${file}: trace ${trace.id} screenshot ${shot} is empty`);
    }
  }
}

/** Load + validate every trace.json under a directory (runner layout:
 *  one sub-directory per trace holding trace.json and its PNG shots).
 *  Throws on the first missing or invalid piece of evidence: a recorded
 *  run never scores as a silent pass. */
export async function loadRecordedTraces(tracesDir: string, contract?: AgencyContract): Promise<Trace[]> {
  const abs = path.resolve(tracesDir);
  const located: Located[] = [];
  await collectTraceFiles(abs, located);
  if (located.length === 0) throw new Error(`No trace.json found under ${abs}`);
  const traces: Trace[] = [];
  for (const { file, dir } of located.sort((a, b) => a.file.localeCompare(b.file))) {
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(file, "utf8"));
    } catch (e) {
      throw new Error(`Invalid trace ${file}: not parseable JSON (${(e as Error).message})`);
    }
    checkShape(raw, file);
    if (contract && raw.decision !== contract.decision) {
      throw new Error(`Trace ${file} is for decision "${raw.decision}", not "${contract.decision}"`);
    }
    await assertTraceEvidence(raw, dir, file);
    traces.push(raw);
  }
  return traces;
}

/** Every contract intent selected needs at least one baseline and one
 *  candidate trace, or the diff would report a silent pass on no data. */
export function assertTraceCoverage(
  traces: Trace[],
  contract: AgencyContract,
  intents: string[] = contract.intents.map((i) => i.id),
): void {
  const missing: string[] = [];
  for (const id of intents) {
    for (const v of VARIANTS) {
      if (!traces.some((t) => t.intentId === id && t.variant === v)) missing.push(`${id}/${v}`);
    }
  }
  if (missing.length > 0) {
    throw new Error(`Missing recorded evidence for: ${missing.join(", ")} (no silent pass on missing data)`);
  }
}
