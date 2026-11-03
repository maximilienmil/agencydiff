import { execSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { runProbe, type ProbeOpts, type ProbeResult } from "./probe.js";
import { startOverlayProxy, stopServer } from "./proxy.js";
import { decideDeterministic } from "./score.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const RAW = path.join(ROOT, "raw", "runs");

interface Variant {
  name: string;
  port: number | null; // null = baseline direct
  patchFile: string | null;
}

const VARIANTS: Variant[] = [
  { name: "baseline", port: null, patchFile: null },
  { name: "V-benign", port: 5281, patchFile: "V-benign.patch.js" },
  { name: "V-improve", port: 5282, patchFile: "V-improve.patch.js" },
  { name: "O1", port: 5283, patchFile: "O1.patch.js" },
  { name: "O2", port: 5284, patchFile: "O2.patch.js" },
  { name: "O3", port: 5285, patchFile: "O3.patch.js" },
  { name: "O4", port: 5286, patchFile: "O4.patch.js" },
];

const DECISIONS = ["D1", "D2", "D3", "D4"] as const;
const BASE_BACKEND = "http://127.0.0.1:5280/";

function trialHead(): string {
  try {
    return execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}

/** Run one probe with the frozen retry rule: taps==0 means the run never
 *  got going (infra). Retry 3x; if baseline works but the variant never
 *  starts, the variant broke the app (goal_unreachable), not infra. */
async function runWithRetry(
  browser: import("playwright").Browser,
  o: ProbeOpts,
  baselineTaps: number | null,
): Promise<{ result: ProbeResult; attempts: number; excluded: string | null }> {
  let attempts = 0;
  let last: ProbeResult | null = null;
  for (let a = 0; a < 3; a++) {
    attempts = a + 1;
    last = await runProbe(browser, o);
    if (last.taps > 0) return { result: last, attempts, excluded: null };
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (baselineTaps !== null && baselineTaps > 0) {
    return {
      result: { ...last!, taps: 0, oraclePass: false, detail: "app unusable under variant (no taps on 3 attempts)" },
      attempts,
      excluded: null,
    };
  }
  return { result: last!, attempts, excluded: "infra: taps==0 on 3 attempts" };
}

const started = Date.now();
await mkdir(RAW, { recursive: true });

// Start overlay proxies.
const proxies = [];
for (const v of VARIANTS) {
  if (v.port === null || v.patchFile === null) continue;
  const patchJs = await readFile(path.join(ROOT, "variants", v.patchFile), "utf-8");
  const server = await startOverlayProxy({ upstreamHost: "127.0.0.1", upstreamPort: 5280, patchJs }, v.port);
  proxies.push(server);
  console.log(`proxy ${v.name} on 127.0.0.1:${v.port}`);
}

const browser = await chromium.launch();
const results: ProbeResult[] = [];
const attemptLog: Record<string, { attempts: number; excluded: string | null }> = {};
const baselineTaps: Record<string, number> = {};
try {
  for (const v of VARIANTS) {
    const baseUrl = v.port === null ? BASE_BACKEND : `http://127.0.0.1:${v.port}/`;
    for (const d of DECISIONS) {
      for (let rep = 0; rep < 1; rep++) {
        const o: ProbeOpts = {
          baseUrl,
          variant: v.name,
          decision: d,
          rep,
          topic: `trial-${v.name.toLowerCase()}-${d.toLowerCase()}-${rep}-${Date.now() % 1000000}`,
        };
        const isBaseline = v.name === "baseline";
        const { result, attempts, excluded } = await runWithRetry(
          browser,
          o,
          isBaseline ? null : (baselineTaps[d] ?? null),
        );
        if (isBaseline) baselineTaps[d] = Math.max(baselineTaps[d] ?? 0, result.taps);
        results.push(result);
        attemptLog[`${v.name}/${d}/${rep}`] = { attempts, excluded };
        await writeFile(path.join(RAW, `${v.name}-${d}-${rep}.json`), JSON.stringify(result, null, 2));
        console.log(`${v.name} ${d} rep${rep}: taps=${result.taps} oracle=${result.oraclePass} :: ${result.detail} [attempts=${attempts}${excluded ? ` EXCLUDED:${excluded}` : ""}]`);
      }
    }
  }
} finally {
  await browser.close();
  for (const s of proxies) await stopServer(s);
}

// Score per variant x decision against baseline (deterministic mode).
const summary: Record<string, unknown> = {
  trialHead: trialHead(),
  mode: "deterministic",
  repeats: 1,
  image: "binwiederhier/ntfy@sha256:fb48c413eb11d50339962b5d62cddce0f800e7f77c626d638a7c20cb7e9c4465 (ntfy 2.36.0)",
  elapsedMs: Date.now() - started,
  taps: {} as Record<string, Record<string, number[]>>,
  findings: [] as unknown[],
  exclusions: Object.entries(attemptLog).filter(([, v]) => v.excluded),
};
for (const r of results) {
  const t = summary.taps as Record<string, Record<string, number[]>>;
  t[r.variant] ??= {};
  t[r.variant][r.decision] ??= [];
  t[r.variant][r.decision].push(r.taps);
}
for (const v of VARIANTS) {
  if (v.name === "baseline") continue;
  for (const d of DECISIONS) {
    const b = results.filter((r) => r.variant === "baseline" && r.decision === d);
    const c = results.filter((r) => r.variant === v.name && r.decision === d);
    const verdict = decideDeterministic(b, c);
    (summary.findings as unknown[]).push({ variant: v.name, decision: d, verdict });
  }
}
await writeFile(path.join(ROOT, "raw", "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary.findings, null, 1));
