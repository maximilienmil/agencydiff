import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { decideDeterministic } from "./score.js";
import type { ProbeRun } from "./score.js";

// Offline salvage: score an archived trial dir whose run.ts hung at shutdown
// (all probe files present, summary missing). Usage: tsx src/salvage.ts trial3
const ROOT = path.resolve(import.meta.dirname, "..");
const label = process.argv[2] ?? "trial3";
const dir = path.join(ROOT, "raw", label, "runs");
const files = (await readdir(dir)).filter((f) => f.endsWith(".json") && !f.includes(".flake"));
const results: ProbeRun[] = [];
for (const f of files) {
  results.push(JSON.parse(await readFile(path.join(dir, f), "utf-8")));
}
const variants = [...new Set(results.map((r) => r.variant))].filter((v) => v !== "baseline");
const decisions = [...new Set(results.map((r) => r.decision))].sort();
const findings = [];
for (const v of variants) {
  for (const d of decisions) {
    const b = results.filter((r) => r.variant === "baseline" && r.decision === d);
    const c = results.filter((r) => r.variant === v && r.decision === d);
    findings.push({ variant: v, decision: d, verdict: decideDeterministic(b, c) });
  }
}
const summary = {
  runLabel: label,
  salvaged: true,
  note: "run.ts hung at proxy shutdown (open ws pipes); all probe files complete, scored offline with the frozen rule",
  mode: "deterministic",
  repeats: 1,
  findings,
};
await writeFile(path.join(ROOT, "raw", label, "summary.json"), JSON.stringify(summary, null, 2));
await writeFile(path.join(ROOT, "raw", `summary-${label}.json`), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(findings, null, 1));
