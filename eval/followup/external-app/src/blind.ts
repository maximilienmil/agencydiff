import { execSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { runProbe, type ProbeOpts, type ProbeResult } from "./probe.js";
import { startOverlayProxy, stopServer } from "./proxy.js";
import { decideDeterministic } from "./score.js";

// Blind-attempt measurement (NOT researcher-seeded): serve each attempt's
// patch.js through the overlay proxy and run the frozen 4-decision probes.
// Load check first: patch must parse (node --check done by agent) AND load
// in headless chromium with zero page errors; otherwise invalid.
const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "raw", "blind");
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
      // Known-benign: the app requests an en-US translation file that does
      // not exist on every load, including pristine baseline (falls back
      // to bundled English). The console text omits the URL, so match on
      // the message location too. Not a patch defect.
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
await mkdir(OUT, { recursive: true });
const loadResults: Record<string, { ok: boolean; errors: string[] }> = {};
for (const a of ATTEMPTS) {
  const patchJs = await readFile(path.join(ROOT, "attempts", a.name, "patch.js"), "utf-8");
  loadResults[a.name] = await loadCheck(patchJs, a.port);
  console.log(`load ${a.name}: ${loadResults[a.name].ok ? "OK" : "INVALID"} ${loadResults[a.name].errors.join("; ")}`);
}
await writeFile(path.join(OUT, "loadcheck.json"), JSON.stringify(loadResults, null, 2));

const valid = ATTEMPTS.filter((a) => loadResults[a.name].ok);
const proxies = [];
for (const a of valid) {
  const patchJs = await readFile(path.join(ROOT, "attempts", a.name, "patch.js"), "utf-8");
  proxies.push(await startOverlayProxy({ upstreamHost: "127.0.0.1", upstreamPort: 5280, patchJs }, a.port));
  console.log(`proxy ${a.name} on 127.0.0.1:${a.port}`);
}
const browser = await chromium.launch();
const results: ProbeResult[] = [];
const baselineTaps: Record<string, number> = {};
try {
  const all = [{ name: "baseline", port: 0 }, ...valid];
  for (const v of all) {
    const baseUrl = v.port === 0 ? "http://127.0.0.1:5280/" : `http://127.0.0.1:${v.port}/`;
    for (const d of DECISIONS) {
      const o: ProbeOpts = {
        baseUrl,
        variant: v.name,
        decision: d,
        rep: 0,
        topic: `blind-${v.name.toLowerCase()}-${d.toLowerCase()}-${Date.now() % 1000000}`,
      };
      let last: ProbeResult | null = null;
      let attempts = 0;
      const flakes: ProbeResult[] = [];
      for (let a = 0; a < 3; a++) {
        attempts = a + 1;
        last = await runProbe(browser, o);
        if (last.taps > 0 && !(last.detail ?? "").startsWith("error:")) break;
        if ((last.detail ?? "").startsWith("error:")) flakes.push(last);
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (v.name === "baseline") baselineTaps[d] = Math.max(baselineTaps[d] ?? 0, last!.taps);
      let excluded: string | null = null;
      let result = last!;
      if (last!.taps === 0) {
        if ((baselineTaps[d] ?? 0) > 0) {
          result = { ...last!, oraclePass: false, detail: "app unusable under variant (no taps on 3 attempts)" };
        } else {
          excluded = "infra: taps==0 on 3 attempts";
        }
      }
      results.push(result);
      await writeFile(path.join(OUT, `${v.name}-${d}-0.json`), JSON.stringify(result, null, 2));
      for (const [i, f] of flakes.entries()) {
        await writeFile(path.join(OUT, `${v.name}-${d}-0.flake${i}.json`), JSON.stringify(f, null, 2));
      }
      console.log(`${v.name} ${d}: taps=${result.taps} oracle=${result.oraclePass} :: ${result.detail} [attempts=${attempts}${excluded ? ` EXCLUDED:${excluded}` : ""}]`);
      void excluded;
    }
  }
} finally {
  await browser.close();
  for (const s of proxies) await stopServer(s);
}

const findings = [];
for (const v of valid) {
  for (const d of DECISIONS) {
    const b = results.filter((r) => r.variant === "baseline" && r.decision === d);
    const c = results.filter((r) => r.variant === v.name && r.decision === d);
    findings.push({ variant: v.name, decision: d, verdict: decideDeterministic(b, c) });
  }
}
await writeFile(
  path.join(OUT, "summary.json"),
  JSON.stringify({ runLabel: "blind", trialHead: trialHead(), mode: "deterministic", repeats: 1, elapsedMs: Date.now() - started, findings }, null, 2),
);
console.log(JSON.stringify(findings, null, 1));
