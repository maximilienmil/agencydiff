/**
 * Core-integration blind run: serves each of the four committed blind
 * participant patches EXACTLY as committed (read-only; git-clean at the end
 * proves it) through the overlay proxy, re-checks load validity in this
 * phase ($0, headless, no model calls), replays the frozen 4-decision probes
 * through the instrumented coreProbe adapter, and scores every attempt with
 * the UNMODIFIED core diffContract beside the standalone scorer.
 * Rename-vs-removal disagreements are retained per cell, never smoothed.
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
const TRACES = path.join(OUT, "traces-blind");
const DECISIONS = ["D1", "D2", "D3", "D4"] as const;

const ATTEMPTS = [
  { name: "A-menu-0", port: 5287 },
  { name: "A-menu-1", port: 5288 },
  { name: "A-settings-0", port: 5289 },
  { name: "A-settings-1", port: 5290 },
];

function trialHead(): string {
  try {
    return execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}

async function loadCheck(patchJs: string, port: number): Promise<{ ok: boolean; errors: string[] }> {
  const errors: string[] = [];
  const server = await startOverlayProxy({ upstreamHost: "127.0.0.1", upstreamPort: 5280, patchJs }, port);
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`pageerror: ${(e as Error).message.slice(0, 200)}`));
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      const text = m.text();
      const where = `${m.location()?.url ?? ""} ${text}`;
      if (/en-US\.json|translation for language/.test(where)) return;
      errors.push(`console: ${text.slice(0, 200)} @ ${m.location()?.url ?? "?"}`);
    });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    await ctx.close();
  } finally {
    await browser.close();
    await stopServer(server);
  }
  return { ok: errors.length === 0, errors };
}

const started = Date.now();
await mkdir(TRACES, { recursive: true });

const contract = JSON.parse(
  await readFile(path.join(ROOT, "contracts", "ntfy-choice-protection.json"), "utf-8"),
) as AgencyContract;

const loadResults: Record<string, { ok: boolean; errors: string[] }> = {};
for (const a of ATTEMPTS) {
  const patchJs = await readFile(path.join(ROOT, "attempts", a.name, "patch.js"), "utf-8");
  loadResults[a.name] = await loadCheck(patchJs, a.port);
  console.log(`load ${a.name}: ${loadResults[a.name].ok ? "OK" : "INVALID"} ${loadResults[a.name].errors.join("; ")}`);
}
await writeFile(path.join(OUT, "loadcheck-blind.json"), JSON.stringify(loadResults, null, 2));

const valid = ATTEMPTS.filter((a) => loadResults[a.name].ok);
const proxies = [];
for (const a of valid) {
  const patchJs = await readFile(path.join(ROOT, "attempts", a.name, "patch.js"), "utf-8");
  proxies.push(await startOverlayProxy({ upstreamHost: "127.0.0.1", upstreamPort: 5280, patchJs }, a.port));
  console.log(`proxy ${a.name} on 127.0.0.1:${a.port}`);
}

const browser = await chromium.launch();
const results: {
  variant: string;
  decision: Decision;
  result: CoreProbeResult;
  attempts: number;
  acceptedAttempt: number | null;
  flakes: { attempt: number; taps: number; detail: string }[];
}[] = [];
const baselineTaps: Record<string, number> = {};
try {
  const all = [{ name: "baseline", port: 0 }, ...valid];
  for (const v of all) {
    const baseUrl = v.port === 0 ? "http://127.0.0.1:5280/" : `http://127.0.0.1:${v.port}/`;
    for (const d of DECISIONS) {
      const o: CoreProbeOpts = {
        baseUrl,
        variant: v.name,
        decision: d,
        rep: 0,
        topic: `coreblind-${v.name.toLowerCase()}-${d.toLowerCase()}-0-${Date.now() % 1000000}`,
        tracesDir: TRACES,
        label: "core-integration-blind",
      };
      let last: CoreProbeResult | null = null;
      let attempts = 0;
      let acceptedAttempt: number | null = null;
      const flakes: { attempt: number; taps: number; detail: string }[] = [];
      for (let a = 0; a < 3; a++) {
        attempts = a + 1;
        last = await runCoreProbe(browser, { ...o, attemptSuffix: `.attempt${a}` });
        if (last.taps > 0 && !(last.detail ?? "").startsWith("error:")) {
          acceptedAttempt = a;
          last.dir = await acceptAttempt(TRACES, traceIdFor(d, v.name, 0), a);
          break;
        }
        if ((last.detail ?? "").startsWith("error:")) {
          flakes.push({ attempt: a, taps: last.taps, detail: last.detail });
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (v.name === "baseline") baselineTaps[d] = Math.max(baselineTaps[d] ?? 0, last!.taps);
      let result = last!;
      if (last!.taps === 0 && (baselineTaps[d] ?? 0) > 0) {
        result = { ...last!, oraclePass: false, detail: "app unusable under variant (no taps on 3 attempts)" };
      }
      results.push({ variant: v.name, decision: d, result, attempts, acceptedAttempt, flakes });
      console.log(
        `${v.name} ${d}: taps=${result.taps} coreActions=${countActions(result.trace)} oracle=${result.oraclePass} :: ${result.detail} [attempts=${attempts} accepted=${acceptedAttempt}]`,
      );
    }
  }
} finally {
  await browser.close();
  for (const s of proxies) await stopServer(s);
}

const traces: Trace[] = results.map((r) => r.result.trace);
const cells = [];
for (const v of valid) {
  const relevant = traces.filter(
    (t) => (t.variant === "baseline" || t.id.includes(`.${v.name}.`)) && t.decision === "ntfy-choice-protection",
  );
  const report = diffContract(contract, relevant);
  for (const d of DECISIONS) {
    const toRun = (variant: string): ProbeRun[] =>
      results
        .filter((r) => r.variant === variant && r.decision === d)
        .map((r) => ({ variant, decision: d, rep: 0, taps: r.result.taps, oraclePass: r.result.oraclePass, detail: r.result.detail }));
    const standalone = decideDeterministic(toRun("baseline"), toRun(v.name));
    const coreFindings = report.findings.filter((f) => f.intentId === d);
    const { agreement, reason } = classifyAgreement(standalone, coreFindings);
    cells.push({
      variant: v.name,
      decision: d,
      taps: { baseline: toRun("baseline")[0]?.taps, candidate: toRun(v.name)[0]?.taps },
      oracle: { baseline: toRun("baseline")[0]?.oraclePass, candidate: toRun(v.name)[0]?.oraclePass },
      standalone,
      coreFindings,
      agreement,
      agreementReason: reason,
      attempts: {
        baseline: results.find((r) => r.variant === "baseline" && r.decision === d)?.attempts,
        candidate: results.find((r) => r.variant === v.name && r.decision === d)?.attempts,
      },
      flakes: results.find((r) => r.variant === v.name && r.decision === d)?.flakes ?? [],
    });
  }
}

await writeFile(
  path.join(OUT, "blind-summary.json"),
  JSON.stringify(
    { runLabel: "core-integration-blind", trialHead: trialHead(), mode: "deterministic", repeats: 1, elapsedMs: Date.now() - started, loadResults, cells },
    null,
    2,
  ),
);
console.log(JSON.stringify(cells.map((c) => ({ v: c.variant, d: c.decision, standalone: c.standalone, core: c.coreFindings })), null, 1));
