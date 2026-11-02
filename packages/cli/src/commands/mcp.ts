import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { AgencyReport, Trace } from "@agencydiff/core";
import { findDataDir, loadContract, loadRefs, runDiff } from "../engine.js";

let lastOutDir: string | null = null;

const checkShape = {
  baselineUrl: z.string().url().describe("Baseline variant URL (e.g. production deploy)"),
  candidateUrl: z.string().url().describe("Candidate variant URL (e.g. preview deploy)"),
  contract: z.string().describe("Contract file path, bundled Circle decision name, or inline contract JSON"),
  driver: z.enum(["scripted", "muse"]).default("scripted").describe("scripted replays reference paths offline; muse drives the UI with computer use"),
  repeats: z.number().int().min(1).max(3).default(1),
  out: z.string().optional().describe("Report directory (default runs/<timestamp>-mcp under the server cwd)"),
};

const initShape = {
  url: z.string().url().describe("Page to probe"),
  dir: z.string().default(".").describe("Directory to scaffold into, relative to the server cwd"),
};

const explainShape = {
  findingId: z.string().describe("Finding id from an agencydiff_check report"),
  reportDir: z.string().optional().describe("Directory holding report.json (defaults to the last check run)"),
};

export async function mcpCommand(): Promise<void> {
  const server = new McpServer({ name: "agencydiff", version: "0.1.0" });

  server.tool("agencydiff_check", checkShape, async ({ baselineUrl, candidateUrl, contract: ref, driver, repeats, out }) => {
    const dataDir = await findDataDir();
    const { contract, fileBase } = await loadContract(ref, dataDir);
    const refs = await loadRefs(dataDir, fileBase, contract.decision);
    const outDir = path.resolve(out ?? path.join("runs", `${new Date().toISOString().replace(/[:.]/g, "-")}-mcp`, contract.decision));
    await mkdir(outDir, { recursive: true });
    const { report } = await runDiff({
      contract,
      contractLabel: ref,
      refs,
      baselineUrl,
      candidateUrl,
      driver,
      repeats,
      outDir,
    });
    lastOutDir = outDir;
    return { content: [{ type: "text" as const, text: checkSummary(report, outDir) }] };
  });

  server.tool("agencydiff_init", initShape, async ({ url, dir }) => {
    const target = path.resolve(dir);
    await mkdir(path.join(target, "contracts"), { recursive: true });
    let host = "site";
    try {
      host = new URL(url).hostname.replace(/^www\./, "").replace(/[^a-z0-9]+/gi, "-");
    } catch {
      /* keep default */
    }
    const contract = {
      decision: host,
      promise: "TODO: state the promise in plain language.",
      intents: [
        { id: "accept", goal: "TODO: the thing a person came to do.", polarity: "accept", domOracle: [{ kind: "visible", selector: "[data-agency=accept]" }], target: "accept", mustSucceed: true },
        { id: "decline", goal: "TODO: the protective opposite.", polarity: "reject", domOracle: [{ kind: "visible", selector: "[data-agency=decline]" }], target: "decline", mustSucceed: true },
      ],
      pairs: [{ accept: "accept", reject: "decline" }],
    };
    const config = { targets: { baseline: url }, contracts: [`./contracts/${host}.json`], driver: "scripted", repeats: 1 };
    await writeFile(path.join(target, "contracts", `${host}.json`), JSON.stringify(contract, null, 2) + "\n");
    await writeFile(path.join(target, "agencydiff.config.json"), JSON.stringify(config, null, 2) + "\n");
    return {
      content: [{
        type: "text" as const,
        text: `Drafted agencydiff.config.json and contracts/${host}.json in ${target}. Edit the goals, domOracle selectors and data-agency targets, then run agencydiff_check with driver muse.`,
      }],
    };
  });

  server.tool("agencydiff_explain", explainShape, async ({ findingId, reportDir }) => {
    const dir = reportDir ? path.resolve(reportDir) : lastOutDir;
    if (!dir) throw new Error("No report yet: run agencydiff_check first, or pass reportDir.");
    const report = JSON.parse(await readFile(path.join(dir, "report.json"), "utf8")) as AgencyReport;
    const finding = report.findings.find((f) => f.id === findingId);
    if (!finding) {
      throw new Error(`Finding ${findingId} not in ${dir} (${report.findings.length} findings).`);
    }
    const evidence: { traceId: string; passed?: boolean; steps?: number; stoppedReason?: string }[] = [];
    for (const e of finding.evidence) {
      try {
        const trace = JSON.parse(await readFile(path.join(dir, e.traceId, "trace.json"), "utf8")) as Trace;
        evidence.push({ traceId: e.traceId, passed: trace.oracle.passed, steps: trace.steps.length, stoppedReason: trace.stoppedReason });
      } catch {
        evidence.push({ traceId: e.traceId });
      }
    }
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({ decision: report.decision, finding, evidence }, null, 2),
      }],
    };
  });

  await server.connect(new StdioServerTransport());
}

function checkSummary(report: AgencyReport, outDir: string): string {
  const lines = [
    `${report.passed ? "PASS" : "FAIL"} ${report.decision}: ${report.promise}`,
    `report: ${outDir}/report.json`,
  ];
  for (const f of report.findings) {
    lines.push(`- [${f.severity}] ${f.id}: ${f.title} (${JSON.stringify(f.baseline)} → ${JSON.stringify(f.candidate)})`);
  }
  if (report.findings.length === 0) lines.push("No findings: cost, visibility, defaults and success match across variants.");
  return lines.join("\n");
}
