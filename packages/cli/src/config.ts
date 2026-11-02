import { readFile } from "node:fs/promises";
import path from "node:path";

export interface AgencyDiffConfig {
  targets?: { baseline?: string; candidate?: string };
  /** Target-config files (like targets/circle-pr.json), resolved relative to the config file. */
  targetFiles?: string[];
  contracts?: string[];
  driver?: "scripted" | "muse";
  repeats?: number;
  model?: string;
  out?: string;
}

const FILENAME = "agencydiff.config.json";

/** Walk up from cwd looking for the config file. */
export async function findConfigFile(cwd: string): Promise<string | null> {
  let dir = path.resolve(cwd);
  for (;;) {
    const candidate = path.join(dir, FILENAME);
    try {
      await readFile(candidate, "utf8");
      return candidate;
    } catch {
      /* keep walking */
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export async function loadConfig(file: string): Promise<{ config: AgencyDiffConfig; dir: string }> {
  const raw = JSON.parse(await readFile(file, "utf8")) as AgencyDiffConfig;
  if (!raw || typeof raw !== "object") throw new Error(`Invalid config: ${file}`);
  return { config: raw, dir: path.dirname(path.resolve(file)) };
}
