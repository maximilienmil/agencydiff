/**
 * Core-integration researcher run: replays the frozen deterministic variant
 * matrix through the instrumented coreProbe adapter (real Playwright actions,
 * real screenshots, per-run independent oracles, core Trace per run), then
 * scores every candidate with the UNMODIFIED core diffContract and compares
 * each cell against the standalone scorer. Integration evidence, not a
 * replacement: original raw outputs and the predeclared expectation set are
 * untouched; every disagreement is retained in the summary.
 */
import { execSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { diffContract } from "../../../../packages/core/src/diff.js";
import { countActions } from "../../../../packages/core/src/metrics.js";
import type { AgencyContract, Trace } from "../../../../packages/core/src/types.js";
import { chromium } from "playwright";
import { classifyAgreement } from "./coreCompare.js";
import { acceptAttempt, runCoreProbe, traceIdFor, type CoreProbeOpts, type CoreProbeResult, type Decision } from "./coreProbe.js";
import { startOverlayProxy, stopServer } from "./proxy.js";
import { decideDeterministic, type ProbeRun } from "./score.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "raw", "core-integration");
const TRACES = path.join(OUT, "traces");

interface Variant {
  name: string;
  port: number | null;
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

function toProbeRun(variant: string, decision: Decision, r: CoreProbeResult): ProbeRun {
  return { variant, decision, rep: 0, taps: r.taps, oraclePass: r.oraclePass, detail: r.detail };
}

async function runWithRetry(
  browser: import("playwright").Browser,
  o: CoreProbeOpts,
  baselineTaps: number | null,
): Promise<{
  result: CoreProbeResult;
  attempts: number;
  excluded: string | null;
  flakes: { attempt: number; taps: number; detail: string; dir: string }[];
}> {
  let attempts = 0;
  let last: CoreProbeResult | null = null;
  const flakes: { attempt: number; taps: number; detail: string; dir: string }[] = [];
  for (let a = 0; a < 3; a++) {
    attempts = a + 1;
    last = await runCoreProbe(browser, { ...o, attemptSuffix: `.attempt${a}` });
    if (last.taps > 0 && !(last.detail ?? "").startsWith("error:")) {
      last.dir = await acceptAttempt(o.tracesDir, traceIdFor(o.decision, o.variant, o.rep), a);
      return { result: last, attempts, excluded: null, flakes };
    }
    if ((last.detail ?? "").startsWith("error:")) {
      flakes.push({ attempt: a, taps: last.taps, detail: last.detail, dir: last.dir });
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (baselineTaps !== null && baselineTaps > 0) {
    const result: CoreProbeResult = {
      ...last!,
      taps: 0,
      oraclePass: false,
      detail: "app unusable under variant (no taps on 3 attempts)",
    };
    return { result, attempts, excluded: null, flakes };
  }
  return { result: last!, attempts, excluded: "infra: taps==0 on 3 attempts", flakes };
}

const started = Date.now();
await mkdir(TRACES, { recursive: true });

const contract = JSON.parse(
  await readFile(path.join(ROOT, "contracts", "ntfy-choice-protection.json"), "utf-8"),
) as AgencyContract;

const proxies = [];
for (const v of VARIANTS) {
  if (v.port === null || v.patchFile === null) continue;
  const patchJs = await readFile(path.join(ROOT, "variants", v.patchFile), "utf-8");
  const server = await startOverlayProxy({ upstreamHost: "127.0.0.1", upstreamPort: 5280, patchJs }, v.port);
  proxies.push(server);
  console.log(`proxy ${v.name} on 127.0.0.1:${v.port}`);
}

const browser = await chromium.launch();
const results: { variant: string; decision: Decision; result: CoreProbeResult }[] = [];
const attemptLog: Record<string, { attempts: number; excluded: string | null; flakes: number }> = {};
const baselineTaps: Record<string, number> = {};
try {
  for (const v of VARIANTS) {
    const baseUrl = v.port === null ? BASE_BACKEND : `http://127.0.0.1:${v.port}/`;
    for (const d of DECISIONS) {
      const o: CoreProbeOpts = {
        baseUrl,
        variant: v.name,
        decision: d,
        rep: 0,
        topic: `core-${v.name.toLowerCase()}-${d.toLowerCase()}-0-${Date.now() % 1000000}`,
        tracesDir: TRACES,
        label: "core-integration",
      };
      const isBaseline = v.name === "baseline";
      const { result, attempts, excluded, flakes } = await runWithRetry(
        browser,
        o,
        isBaseline ? null : (baselineTaps[d] ?? null),
      );
      if (isBaseline) baselineTaps[d] = Math.max(baselineTaps[d] ?? 0, result.taps);
      results.push({ variant: v.name, decision: d, result });
      attemptLog[`${v.name}/${d}/0`] = { attempts, excluded, flakes: flakes.length };
      console.log(
        `${v.name} ${d}: taps=${result.taps} coreActions=${countActions(result.trace)} oracle=${result.oraclePass} :: ${result.detail} [attempts=${attempts}${excluded ? ` EXCLUDED:${excluded}` : ""}]`,
      );
    }
  }
} finally {
  await browser.close();
  for (const s of proxies) await stopServer(s);
}

// Score every candidate with unmodified core diffContract; compare cells.
const traces: Trace[] = results.map((r) => r.result.trace);
const cells = [];
for (const v of VARIANTS) {
  if (v.name === "baseline") continue;
  // Trace carries no custom fields, so candidate membership is read from
  // the trace id segment (`<decision>.<intent>.<pilotVariant>.<rep>`).
  const relevant = traces.filter(
    (t) => (t.variant === "baseline" || t.id.includes(`.${v.name}.`)) && t.decision === "ntfy-choice-protection",
  );
  const report = diffContract(contract, relevant);
  for (const d of DECISIONS) {
    const b = results.filter((r) => r.variant === "baseline" && r.decision === d).map((r) => toProbeRun("baseline", d, r.result));
    const c = results.filter((r) => r.variant === v.name && r.decision === d).map((r) => toProbeRun(v.name, d, r.result));
    const standalone = decideDeterministic(b, c);
    const coreFindings = report.findings.filter((f) => f.intentId === d);
    const { agreement, reason } = classifyAgreement(standalone, coreFindings);
    cells.push({
      variant: v.name,
      decision: d,
      baselineTaps: b[0]?.taps,
      candidateTaps: c[0]?.taps,
      baselineOracle: b[0]?.oraclePass,
      candidateOracle: c[0]?.oraclePass,
      standalone,
      coreFindings,
      agreement,
      agreementReason: reason,
      reportPassed: report.passed,
    });
  }
}

const summary = {
  runLabel: "core-integration",
  trialHead: trialHead(),
  mode: "deterministic",
  repeats: 1,
  image: "binwiederhier/ntfy@sha256:fb48c413eb11d50339962b5d62cddce0f800e7f77c626d638a7c20cb7e9c4465 (ntfy 2.36.0)",
  contract: "contracts/ntfy-choice-protection.json",
  coreImport: "packages/core diffContract/metrics/firstSatisfaction (unmodified)",
  elapsedMs: Date.now() - started,
  taps: Object.fromEntries(
    VARIANTS.map((v) => [
      v.name,
      Object.fromEntries(
        DECISIONS.map((d) => [d, results.filter((r) => r.variant === v.name && r.decision === d).map((r) => r.result.taps)]),
      ),
    ]),
  ),
  cells,
  exclusions: Object.entries(attemptLog).filter(([, v]) => v.excluded),
  attempts: attemptLog,
};
await writeFile(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(cells.map((c) => ({ v: c.variant, d: c.decision, standalone: c.standalone, core: c.coreFindings })), null, 1));
