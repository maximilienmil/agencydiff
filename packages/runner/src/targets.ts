import { readFile } from "node:fs/promises";
import path from "node:path";
import type { OracleAdapter, TargetConfig } from "@agencydiff/core";

const ADAPTERS: OracleAdapter[] = ["state-hook", "dom", "model-judged"];

export interface ResolvedTarget {
  config: TargetConfig;
  dir: string;
}

/** Load and validate a target config JSON file. Contract paths resolve
 *  relative to the target file. */
export async function loadTargetConfig(file: string): Promise<ResolvedTarget> {
  const abs = path.resolve(file);
  const raw = JSON.parse(await readFile(abs, "utf8")) as TargetConfig;
  if (!raw || typeof raw !== "object") throw new Error(`Invalid target config: ${file}`);
  if (!raw.urls || typeof raw.urls !== "object" || Object.keys(raw.urls).length === 0) {
    throw new Error(`Target config ${file} needs a non-empty "urls" map (Variant -> URL)`);
  }
  if (!Array.isArray(raw.contracts) || raw.contracts.length === 0) {
    throw new Error(`Target config ${file} needs a non-empty "contracts" list`);
  }
  if (!ADAPTERS.includes(raw.oracle)) {
    throw new Error(`Target config ${file} needs "oracle" to be one of ${ADAPTERS.join(", ")}`);
  }
  if (raw.auth !== undefined) {
    if (typeof raw.auth !== "object") throw new Error(`Target config ${file}: "auth" must be an object`);
    if (raw.auth.storageState !== undefined && typeof raw.auth.storageState !== "string") {
      throw new Error(`Target config ${file}: "auth.storageState" must be a path string`);
    }
    for (const k of ["usernameEnv", "passwordEnv"] as const) {
      if (raw.auth[k] !== undefined && typeof raw.auth[k] !== "string") {
        throw new Error(`Target config ${file}: "auth.${k}" must be an env var name`);
      }
    }
  }
  return { config: raw, dir: path.dirname(abs) };
}

/** Model judgement is never evidence in a two-Variant Diff; it is Audit-only. */
export function assertDiffOracle(config: TargetConfig, file: string): void {
  if (config.oracle === "model-judged") {
    throw new Error(`Target ${file}: "model-judged" is allowed only in Audit mode (pnpm audit)`);
  }
}
