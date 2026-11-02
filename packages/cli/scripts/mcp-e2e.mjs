import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const BASE = process.env.AGENCYDIFF_BASE ?? "http://127.0.0.1:5191/?variant=baseline";
const CANDIDATE = process.env.AGENCYDIFF_CANDIDATE ?? "http://127.0.0.1:5191/?variant=candidate";

const transport = new StdioClientTransport({
  command: "node",
  args: [path.resolve(import.meta.dirname, "..", "dist", "cli.js"), "mcp"],
  cwd: path.resolve(import.meta.dirname, ".."),
});
const client = new Client({ name: "agencydiff-e2e", version: "0.0.0" });
await client.connect(transport);

const fail = (msg) => {
  console.error(`E2E FAIL: ${msg}`);
  process.exitCode = 1;
  process.exit(1);
};

const { tools } = await client.listTools();
const names = tools.map((t) => t.name);
console.log("tools:", names.join(", "));
for (const want of ["agencydiff_check", "agencydiff_init", "agencydiff_explain"]) {
  if (!names.includes(want)) fail(`missing tool ${want}`);
}

// check: baseline vs candidate Circle must FAIL with findings + a report path.
const check = await client.callTool({
  name: "agencydiff_check",
  arguments: { baselineUrl: BASE, candidateUrl: CANDIDATE, contract: "precise_location", driver: "scripted", repeats: 1 },
});
const text = check.content[0].text;
console.log("--- agencydiff_check ---\n" + text.split("\n").slice(0, 4).join("\n"));
if (!text.startsWith("FAIL")) fail("expected FAIL for baseline vs candidate");
const reportMatch = text.match(/^report: (.+)$/m);
if (!reportMatch) fail("no report path in check result");
const reportDir = path.dirname(reportMatch[1]);

// explain: first finding id resolves to evidence traces.
const findingMatch = text.match(/^- \[[a-z]+\] ([^:]+):/m);
if (!findingMatch) fail("no finding id in check result");
const explain = await client.callTool({
  name: "agencydiff_explain",
  arguments: { findingId: findingMatch[1], reportDir },
});
const explained = JSON.parse(explain.content[0].text);
if (!explained.finding || !Array.isArray(explained.evidence) || explained.evidence.length === 0) {
  fail("explain returned no evidence");
}
console.log(`explain: ${findingMatch[1]} <- ${explained.evidence.length} trace(s), e.g.`, JSON.stringify(explained.evidence[0]));

// init: scaffolds config + contract into a temp dir.
const dir = mkdtempSync(path.join(tmpdir(), "ad-mcp-init-"));
const init = await client.callTool({
  name: "agencydiff_init",
  arguments: { url: "https://example.com/settings", dir },
});
console.log("--- agencydiff_init ---\n" + init.content[0].text);
const { readFile } = await import("node:fs/promises");
await readFile(path.join(dir, "agencydiff.config.json"), "utf8");
await readFile(path.join(dir, "contracts", "example-com-settings.json"), "utf8").catch(() =>
  readFile(path.join(dir, "contracts", "example-com.json"), "utf8"),
);

await client.close();
console.log("MCP E2E OK");
