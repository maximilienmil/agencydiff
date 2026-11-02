import { writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  compareAudits,
  findContract,
  loadAuditRuns,
  type ComparisonRow,
} from "./auditRun.js";

// Usage:
//   pnpm run compare-audits --before audits/dmv-baseline --after audits/dmv-redesign
//
// Before/after comparison of two audit runs over the same Intents, reusing
// the Audit report structures (aggregates, medians over successful runs).
// Prints a Markdown table and saves it next to a JSON sidecar.

const ROOT = path.resolve(import.meta.dirname, "../../..");

const { values } = parseArgs({
  options: {
    before: { type: "string" },
    after: { type: "string" },
    out: { type: "string" },
  },
});

if (!values.before || !values.after) throw new Error("--before <runDir> and --after <runDir> are required");

const before = await loadAuditRuns(path.resolve(ROOT, values.before));
const after = await loadAuditRuns(path.resolve(ROOT, values.after));
if (before.length === 0) throw new Error(`No audit.json found under ${values.before}`);
if (after.length === 0) throw new Error(`No audit.json found under ${values.after}`);

const contract = await findContract(ROOT, after[0].decision);
const rows = compareAudits(before, after, contract);

const md = toMarkdown(rows, values.before, values.after);
const outMd = path.resolve(ROOT, values.out ?? path.join(values.after, "comparison.md"));
await writeFile(outMd, md);
await writeFile(outMd.replace(/\.md$/, ".json"), JSON.stringify(rows, null, 2));
console.log(md);
console.log(`\ncomparison: ${path.relative(ROOT, outMd)}`);

function fmt(v: number | undefined, digits = 1): string {
  if (v === undefined) return "—";
  return Number.isInteger(v) ? String(v) : v.toFixed(digits);
}

function toMarkdown(rows: ComparisonRow[], beforeDir: string, afterDir: string): string {
  const lines = [
    `# Before/after: ${beforeDir} vs ${afterDir}`,
    "",
    "Actions to fact is the headline cost: median effortful actions until the oracle first held.",
    "",
    "| Intent | Success before → after | To fact (med) | Steps (med) | Screens (med) | Time (med) |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const r of rows) {
    const s = `${r.before.successes}/${r.before.attempts} → ${r.after.successes}/${r.after.attempts}`;
    const toFact = `${fmt(r.before.medianActionsToSatisfy, 0)} → ${fmt(r.after.medianActionsToSatisfy, 0)}`;
    const steps = `${fmt(r.before.medianSteps, 0)} → ${fmt(r.after.medianSteps, 0)}`;
    const screens = `${fmt(r.before.medianDepth, 0)} → ${fmt(r.after.medianDepth, 0)}`;
    const time = `${fmt(r.before.medianMs !== undefined ? r.before.medianMs / 1000 : undefined)}s → ${fmt(r.after.medianMs !== undefined ? r.after.medianMs / 1000 : undefined)}s`;
    lines.push(`| ${r.intentId} | ${s} | ${toFact} | ${steps} | ${screens} | ${time} |`);
  }
  return lines.join("\n") + "\n";
}
