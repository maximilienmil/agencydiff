import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgencyContract, AgencyReport, Trace, TraceEvidence } from "@agencydiff/core";
import { buildTraceEvidence } from "../src/evidence.js";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const DATA = path.join(ROOT, "apps/report/public/data");

async function apiKey(): Promise<string> {
  if (process.env.MODEL_API_KEY) return process.env.MODEL_API_KEY;
  const env = await readFile(path.join(ROOT, ".env"), "utf8");
  const hit = env.split("\n").find((l) => l.startsWith("MODEL_API_KEY="));
  const value = hit?.slice("MODEL_API_KEY=".length).trim();
  if (!value) throw new Error("MODEL_API_KEY is not set");
  return value;
}

const key = await apiKey();
const showcase: { runId: string }[] = JSON.parse(
  await readFile(path.join(DATA, "showcase.json"), "utf8"),
);

for (const entry of showcase) {
  const runDir = path.join(DATA, entry.runId);
  const contract: AgencyContract = JSON.parse(await readFile(path.join(runDir, "contract.json"), "utf8"));
  const report: AgencyReport = JSON.parse(await readFile(path.join(runDir, "report.json"), "utf8"));
  const pair = contract.pairs[0];
  if (!pair) throw new Error(`${entry.runId}: contract has no Intent Pair`);
  const targetOf = (intentId: string) => {
    const target = contract.intents.find((i) => i.id === intentId)?.target;
    if (!target) throw new Error(`${entry.runId}: intent ${intentId} has no target tag`);
    return target;
  };

  const all: TraceEvidence[] = [];
  for (const agg of report.aggregates) {
    for (const traceId of agg.traceIds) {
      const traceDir = path.join(runDir, traceId);
      const trace: Trace = JSON.parse(await readFile(path.join(traceDir, "trace.json"), "utf8"));
      const evidence = await buildTraceEvidence(traceDir, trace, {
        acceptTag: targetOf(pair.accept),
        rejectTag: targetOf(pair.reject),
        sam: { apiKey: key, cacheDir: path.join(ROOT, "packages/evidence/.sam-cache") },
      });
      for (const step of evidence.steps) {
        if (!step.overlay) continue;
        const samName = step.screenshot.replace(/(\d+)(\.[a-z]+)$/i, "sam-$1$2");
        await copyFile(path.join(traceDir, step.overlay), path.join(traceDir, samName));
      }
      const withMasks = evidence.steps.filter((s) => s.overlay).length;
      console.log(`${traceId}: ${evidence.steps.length} steps, ${withMasks} overlays`);
      all.push(evidence);
    }
  }
  report.evidence = all;
  await writeFile(path.join(runDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(`${entry.runId}: evidence for ${all.length} traces`);
}
