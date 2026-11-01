// SusBench lab eval runner.
//
// For each pair in manifest.json, probes the baseline and candidate snapshots
// with the Muse computer-use driver (audit guard on, DOM oracles only — no
// model judgement, no purchases, no live pages), diffs the two Variants with
// the deterministic AgencyDiff engine, and aggregates per-pattern results.
//
// Usage (from the repo root; .env supplies MODEL_API_KEY):
//   pnpm --filter @agencydiff/runner exec tsx ../../eval/susbench/run.ts
//   pnpm --filter @agencydiff/runner exec tsx ../../eval/susbench/run.ts --pairs popup-ad --k 1
//
// Results: eval/susbench/runs/<pair>/report.json and eval/susbench/results.json.
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { diffContract, type AgencyContract, type AgencyReport, type Trace } from "../../packages/core/src/index.js";
import { MuseDriver } from "../../packages/runner/src/drivers.js";
import { BrowserEnv } from "../../packages/runner/src/env.js";
import { runProbe } from "../../packages/runner/src/probe.js";
import { createLabServer } from "./server.mjs";

const HERE = import.meta.dirname;
const ROOT = path.resolve(HERE, "../..");

// Minimal .env loader (KEY=VALUE lines only). Never prints values.
function loadEnvFile(): void {
  const file = path.join(ROOT, ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

loadEnvFile();

interface ManifestPair {
  name: string;
  pattern: string;
  codes: string[];
  contract: string;
  page: string;
  control?: boolean;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const repeats = Number(process.env.SUSBENCH_K ?? arg("--k") ?? 3);
  const only = arg("--pairs")?.split(",");
  const apiKey = process.env.MODEL_API_KEY;
  if (!apiKey) throw new Error("MODEL_API_KEY is not set (repo .env)");
  const model = process.env.MUSE_MODEL || undefined;

  const manifest = JSON.parse(await readFile(path.join(HERE, "manifest.json"), "utf8")) as {
    pairs: ManifestPair[];
  };
  const pairs = manifest.pairs.filter((p) => !only || only.includes(p.name));

  const port = Number(process.env.SUSBENCH_PORT ?? 5183);
  const base = `http://localhost:${port}`;
  const server = createLabServer();
  await new Promise<void>((resolve) => server.listen(port, resolve));
  console.log(`lab server: ${base}/`);

  // Enforcement (the audit guard: no submits, credentials, purchases) stays
  // on for every probe via runProbe(oracle.audit). The read-only Audit
  // instruction preamble is deliberately NOT used: this eval's Intents
  // require completing basket adds, which that preamble forbids outright.
  // The pages structurally cannot check out, so no purchase is possible.
  const driver = new MuseDriver({ apiKey, model, audit: false, maxSteps: 10, tolerateBlocked: true });
  console.log(`driver: muse ${driver.model}, repeats=${repeats}, audit guard on (enforcement)`);

  const outRoot = path.join(HERE, "runs");
  await mkdir(outRoot, { recursive: true });
  const summary: unknown[] = [];

  for (const pair of pairs) {
    const contract: AgencyContract = JSON.parse(
      await readFile(path.join(HERE, pair.contract), "utf8"),
    );
    const baselineUrl = `${base}/${pair.page}?variant=baseline`;
    const candidateUrl = pair.control ? baselineUrl : `${base}/${pair.page}?variant=candidate`;
    await verifySnapshots(pair, baselineUrl, candidateUrl);

    const outDir = path.join(outRoot, pair.name);
    await mkdir(outDir, { recursive: true });
    const target = { baseline: baselineUrl, candidate: candidateUrl };
    const traces: Trace[] = [];
    const queue: (() => Promise<void>)[] = [];
    for (const variant of ["baseline", "candidate"] as const) {
      for (const intent of contract.intents) {
        for (let repeat = 0; repeat < repeats; repeat++) {
          queue.push(async () => {
            try {
              const t = await runProbe({
                contract,
                intent,
                variant,
                repeat,
                target,
                driver,
                outDir,
                oracle: { adapter: "dom", audit: true },
              });
              traces.push(t);
              const mark = t.oracle.checked
                ? t.oracle.passed
                  ? "✓"
                  : "✗"
                : "?";
              console.log(`${mark} ${pair.name.padEnd(18)} ${variant.padEnd(9)} ${intent.id.padEnd(8)} #${repeat} ${t.steps.length} steps (${t.stoppedReason})`);
            } catch (e) {
              // One broken probe must not sink the eval; the diff below
              // simply sees fewer runs for that cell.
              console.log(`! ${pair.name.padEnd(18)} ${variant.padEnd(9)} ${intent.id.padEnd(8)} #${repeat} error: ${String(e).split("\n")[0]}`);
            }
          });
        }
      }
    }
    await runPool(queue, 3);
    traces.sort((a, b) => a.id.localeCompare(b.id));

    const report: AgencyReport = diffContract(contract, traces);
    await writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
    printReport(pair.name, report);

    const significant = report.findings.filter((f) => f.severity !== "low");
    summary.push({
      pair: pair.name,
      pattern: pair.pattern,
      codes: pair.codes,
      control: pair.control ?? false,
      detected: pair.control ? undefined : significant.length > 0,
      falseAlarm: pair.control ? significant.length > 0 : undefined,
      metricsMoved: [...new Set(significant.map((f) => f.kind))],
      findings: report.findings.map((f) => ({
        kind: f.kind,
        severity: f.severity,
        title: f.title,
        baseline: f.baseline,
        candidate: f.candidate,
      })),
      aggregates: report.aggregates.map((a) => ({
        intent: a.intentId,
        variant: a.variant,
        runs: a.runs,
        successRate: a.successRate,
        actionCount: a.actionCount,
        navigationDepth: a.navigationDepth,
        initiallyVisible: a.initiallyVisible,
      })),
      asymmetry: report.asymmetry,
      report: `runs/${pair.name}/report.json`,
    });
  }

  const entries = summary as {
    control: boolean;
    detected?: boolean;
    falseAlarm?: boolean;
    metricsMoved: string[];
  }[];
  const injected = entries.filter((e) => !e.control);
  const controls = entries.filter((e) => e.control);
  const results = {
    generatedAt: new Date().toISOString(),
    repeats,
    model: driver.model,
    method: "Muse computer-use probes against local static snapshots, dom oracles, audit guard on",
    pairs: summary,
    summary: {
      injectedPairs: injected.length,
      detectedPairs: injected.filter((e) => e.detected).length,
      controlPairs: controls.length,
      falseAlarms: controls.filter((e) => e.falseAlarm).length,
    },
  };
  await writeFile(path.join(HERE, "results.json"), JSON.stringify(results, null, 2));
  console.log(`\nresults: eval/susbench/results.json`);
  console.log(
    `detected ${results.summary.detectedPairs}/${results.summary.injectedPairs} injected pairs, ` +
      `${results.summary.falseAlarms} false alarms on ${results.summary.controlPairs} controls`,
  );
  server.close();
  if (injected.some((e) => !e.detected)) {
    console.log("note: undetected pairs are honest negatives, not failures (see docs/susbench.md)");
  }
}

/** Confirm each snapshot serves the intended Variant before spending probes. */
async function verifySnapshots(pair: ManifestPair, baselineUrl: string, candidateUrl: string): Promise<void> {
  for (const [url, wantInjected] of [
    [baselineUrl, false],
    [candidateUrl, pair.control ? false : true],
  ] as const) {
    const env = await BrowserEnv.open(url, path.join(HERE, "runs", ".verify"), { audit: true });
    try {
      const flag = await env.page.evaluate(() => (window as unknown as { __susbench?: { injected?: unknown } }).__susbench);
      if (!flag || flag.injected !== wantInjected) {
        throw new Error(`snapshot check failed for ${pair.name}: ${url} injected=${String(flag?.injected)}`);
      }
    } finally {
      await env.close();
    }
  }
}

/** Bounded parallelism for probe launches (browsers are heavy). */
async function runPool(queue: (() => Promise<void>)[], size: number): Promise<void> {
  const workers = Array.from({ length: Math.min(size, queue.length) }, async () => {
    while (queue.length) {
      const job = queue.shift();
      if (job) await job();
    }
  });
  await Promise.all(workers);
}

function printReport(name: string, report: AgencyReport): void {
  console.log(`\n${report.passed ? "PASS" : "FAIL"}  ${name}: ${report.promise}`);
  for (const f of report.findings) {
    console.log(`  [${f.severity.toUpperCase()}] ${f.kind}: ${f.title}`);
  }
}

await main();
