#!/usr/bin/env node
import { initCommand } from "./commands/init.js";
import { diffCommand } from "./commands/diff.js";
import { diffTracesCommand } from "./commands/diffTraces.js";
import { auditCommand } from "./commands/audit.js";
import { benchCommand } from "./commands/bench.js";
import { mcpCommand } from "./commands/mcp.js";

const HELP = `agencydiff — intent regression testing for UX

Usage:
  agencydiff init --url <page> [--dir .]
  agencydiff diff --baseline <url> --candidate <url> --contract <file|decision> [--driver scripted|muse] [--repeats N] [--out dir]
  agencydiff diff-traces --contract <file|decision> --traces <dir> [--intents A,B] [--out dir]
  agencydiff audit --url <url> --contract <file|decision> [--driver scripted|muse] [--repeats N] [--out dir]
  agencydiff bench --base <circle-url> [--driver scripted|muse] [--seeds A,B] [--repeats N] [--out dir]
  agencydiff mcp

MODEL_API_KEY must be set for --driver muse. Exit code is non-zero when a diff fails.
`;

const [command, ...rest] = process.argv.slice(2);

try {
  switch (command) {
    case "init":
      await initCommand(rest);
      break;
    case "diff":
      await diffCommand(rest);
      break;
    case "diff-traces":
      await diffTracesCommand(rest);
      break;
    case "audit":
      await auditCommand(rest);
      break;
    case "bench":
      await benchCommand(rest);
      break;
    case "propose-fix":
      console.error(
        "agencydiff propose-fix is coming soon: it will turn a failing report into a concrete UI patch. Until then, run `agencydiff diff` and attach runs/<run>/<decision>/report.json to the fix.",
      );
      process.exitCode = 2;
      break;
    case "mcp":
      await mcpCommand();
      break;
    default:
      console.log(HELP);
      if (command !== undefined && command !== "--help" && command !== "-h") process.exitCode = 2;
  }
} catch (e) {
  console.error(`agencydiff: ${(e as Error).message}`);
  process.exitCode = 1;
}
