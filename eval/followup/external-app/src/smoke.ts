import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { runProbe, type ProbeOpts } from "./probe.js";

// Excluded smoke: baseline only, throwaway topics, decides scoring mode.
const BASE = process.env.EXTAPP_BASE ?? "http://127.0.0.1:5280/";
const OUT = path.resolve(import.meta.dirname, "../smoke-out");
const allDecisions = ["D1", "D2", "D3", "D4"] as const;
const only = process.env.SMOKE_DECISION as (typeof allDecisions)[number] | undefined;
const decisions = only ? allDecisions.filter((d) => d === only) : allDecisions;

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });
const all = [];
for (const d of decisions) {
  for (let rep = 0; rep < 3; rep++) {
    const o: ProbeOpts = {
      baseUrl: BASE,
      variant: "baseline",
      decision: d,
      rep,
      topic: `smoke-excluded-${d.toLowerCase()}-${rep}-${Date.now() % 100000}`,
    };
    const r = await runProbe(browser, o);
    all.push(r);
    console.log(`${d} rep${rep}: taps=${r.taps} oracle=${r.oraclePass} :: ${r.detail} (${r.durationMs}ms)`);
  }
}
await browser.close();
await writeFile(path.join(OUT, "smoke.json"), JSON.stringify(all, null, 2));
const byD = new Map<string, typeof all>();
for (const r of all) {
  const arr = byD.get(r.decision) ?? [];
  arr.push(r);
  byD.set(r.decision, arr);
}
let deterministic = true;
for (const [d, runs] of byD) {
  const taps = new Set(runs.map((r) => r.taps));
  const pass = runs.every((r) => r.oraclePass);
  console.log(`${d}: taps={${[...taps].join(",")}} allPass=${pass}`);
  if (taps.size !== 1 || !pass) deterministic = false;
}
console.log(deterministic ? "SMOKE: deterministic (repeats=1)" : "SMOKE: noisy (repeats=3)");
