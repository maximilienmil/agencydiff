import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { promisify } from "node:util";
import type {
  AgencyContract,
  AgencyReport,
  Finding,
  Trace,
  Variant,
} from "@agencydiff/core";

const run = promisify(execFile);

// Usage:
//   pnpm run propose-fix --report runs/<id> [--base <ref> --head <ref>]
//     [--model muse-spark-1.3-contributor] [--repeats 3] [--no-verify]
//
// Reads the failing Findings in a diff run, asks Muse Spark for a minimal
// unified diff against Circle that restores the failing Intents, writes it to
// fix.patch (never applied to the user's branch), replays it in a temp git
// worktree, rebuilds Circle, and re-runs the same contracts with the scripted
// driver plus the Muse driver at k=3. Summarises everything in fix.md.

const ROOT = path.resolve(import.meta.dirname, "../../..");
const CIRCLE_PREFIX = "apps/circle/";
const DEFAULT_MODEL = "muse-spark-1.3-contributor";

interface Flags {
  report?: string;
  base?: string;
  head?: string;
  model?: string;
  out?: string;
  repeats: string;
  "base-port": string;
  "candidate-port": string;
  verify: boolean;
  "no-verify": boolean;
  "suggest-json": boolean;
  "no-suggest-json": boolean;
}

function parseFlags(): Flags {
  const { values } = parseArgs({
    options: {
      report: { type: "string" },
      base: { type: "string" },
      head: { type: "string" },
      model: { type: "string" },
      out: { type: "string" },
      repeats: { type: "string", default: "3" },
      "base-port": { type: "string", default: "5191" },
      "candidate-port": { type: "string", default: "5192" },
      verify: { type: "boolean", default: true },
      "no-verify": { type: "boolean", default: false },
      "suggest-json": { type: "boolean", default: true },
      "no-suggest-json": { type: "boolean", default: false },
    },
  });
  return values as Flags;
}

interface LoadedReport {
  dir: string;
  decision: string;
  report: AgencyReport;
  contract?: AgencyContract;
  contractFile?: string;
  traces: Map<string, Trace>;
}

async function findJsonFiles(dir: string, name: string, out: string[] = []): Promise<string[]> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await findJsonFiles(p, name, out);
    else if (e.name === name) out.push(p);
  }
  return out;
}

async function findContract(decision: string): Promise<{ contract: AgencyContract; file: string } | undefined> {
  const dir = path.join(ROOT, "contracts");
  for (const f of await readdir(dir)) {
    if (!f.endsWith(".json")) continue;
    try {
      const c = JSON.parse(await readFile(path.join(dir, f), "utf8")) as AgencyContract;
      if (c.decision === decision) return { contract: c, file: path.join("contracts", f) };
    } catch {
      /* skip unreadable */
    }
  }
  return undefined;
}

export async function loadReports(reportDir: string): Promise<LoadedReport[]> {
  const out: LoadedReport[] = [];
  for (const f of await findJsonFiles(reportDir, "report.json")) {
    // Verification re-probes land under verify-*/ inside the same run dir;
    // they are results, never new inputs.
    if (f.split(path.sep).some((part) => part.startsWith("verify-"))) continue;
    const report = JSON.parse(await readFile(f, "utf8")) as AgencyReport;
    const dir = path.dirname(f);
    const traces = new Map<string, Trace>();
    for (const t of await findJsonFiles(dir, "trace.json")) {
      try {
        const trace = JSON.parse(await readFile(t, "utf8")) as Trace;
        traces.set(trace.id, trace);
      } catch {
        /* skip unreadable */
      }
    }
    const found = await findContract(report.decision);
    out.push({ dir, decision: report.decision, report, contract: found?.contract, contractFile: found?.file, traces });
  }
  if (out.length === 0) throw new Error(`No report.json found under ${reportDir}`);
  return out;
}

/** One probe's path as tag clicks plus the screens entered, for the model brief. */
function pathSummary(t: Trace | undefined): string {
  if (!t) return "(no trace)";
  const tags = t.steps.map((s) => s.note ?? "?").join(" → ") || "(no steps)";
  const screens = [t.initial.observation.screen ?? "?", ...t.steps.map((s) => s.after.screen ?? "?")];
  const distinct = [...new Set(screens)].join(" → ");
  const oracle = t.oracle.passed === undefined ? "unchecked" : t.oracle.passed ? "passed" : "failed";
  return `tags: ${tags} | screens: ${distinct} | stop: ${t.stoppedReason}${t.error ? ` (${t.error})` : ""} | oracle: ${oracle}`;
}

function failingIntents(r: LoadedReport): string[] {
  return [...new Set(r.report.findings.filter((f) => f.intentId).map((f) => f.intentId as string))];
}

export interface Hunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: string[];
}

export interface FilePatch {
  path: string;
  hunks: Hunk[];
}

/** Pull the JSON {patch, rationale} object out of a model reply (fences tolerated). */
export function extractJsonPatch(reply: string): { patch: string; rationale: string } {
  const fence = reply.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fence ? fence[1] : reply).trim();
  const start = raw.search(/\{[\s\S]*"patch"[\s\S]*/);
  const candidate = start === -1 ? raw : raw.slice(start);
  try {
    const parsed = JSON.parse(candidate) as { patch?: unknown; rationale?: unknown };
    if (typeof parsed.patch !== "string" || parsed.patch.trim() === "") {
      throw new Error("missing patch");
    }
    return {
      patch: parsed.patch,
      rationale: typeof parsed.rationale === "string" ? parsed.rationale : "",
    };
  } catch {
    return { patch: extractDiff(reply), rationale: "" };
  }
}

/** Pull a unified diff out of a model reply (```diff fences or bare diff tolerated). */
export function extractDiff(reply: string): string {
  const fence = reply.match(/```(?:diff)?\s*([\s\S]*?)```/i);
  if (fence && /(^|\n)(diff --git|--- )/m.test(fence[1])) return fence[1].trim() + "\n";
  const lines = reply.split("\n");
  const start = lines.findIndex((l) => l.startsWith("diff --git ") || l.startsWith("--- "));
  if (start === -1) throw new Error("Model reply contained no unified diff");
  return lines.slice(start).join("\n").trim() + "\n";
}

/** Target file of each `+++ b/<path>` header in a unified diff. */
export function parsePatchFiles(patch: string): string[] {
  const out: string[] = [];
  for (const line of patch.split("\n")) {
    const m = line.match(/^\+\+\+ b\/(.+)$/);
    if (m) out.push(m[1].trim());
  }
  return out;
}

export function parseFilePatches(patch: string): FilePatch[] {
  const files: FilePatch[] = [];
  let current: FilePatch | undefined;
  let hunk: Hunk | undefined;
  const lines = patch.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // A bare "" is a blank context line, except the split artifact after a
    // trailing newline, which carries no content.
    if (line === "" && i === lines.length - 1) continue;
    const plus = line.match(/^\+\+\+ b\/(.+)$/);
    if (plus) {
      current = { path: plus[1].trim(), hunks: [] };
      files.push(current);
      hunk = undefined;
      continue;
    }
    const head = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (head && current) {
      hunk = {
        oldStart: Number(head[1]),
        oldCount: head[2] === undefined ? 1 : Number(head[2]),
        newStart: Number(head[3]),
        newCount: head[4] === undefined ? 1 : Number(head[4]),
        lines: [],
      };
      current.hunks.push(hunk);
      continue;
    }
    if (hunk && (line.startsWith(" ") || line.startsWith("+") || line.startsWith("-") || line === "")) {
      hunk.lines.push(line === "" ? " " : line);
    }
  }
  return files;
}

/** Reject empty patches and anything outside the Circle app. */
export function validatePatch(patch: string): string[] {
  const files = parsePatchFiles(patch);
  if (files.length === 0) throw new Error("Patch touches no files");
  for (const f of files) {
    if (!f.startsWith(CIRCLE_PREFIX)) throw new Error(`Patch escapes the Circle app: ${f}`);
    if (f.includes("..")) throw new Error(`Patch has an unsafe path: ${f}`);
  }
  if (!/^@@ /m.test(patch)) throw new Error("Patch has no hunks");
  return files;
}

/** Apply one file's hunks to its original text. Used by tests and suggestions. */
export function applyHunks(original: string, hunks: Hunk[]): string {
  const src = original.split("\n");
  const out: string[] = [];
  let pos = 0;
  for (const h of hunks) {
    const start = h.oldStart - 1;
    if (start < pos) throw new Error("Overlapping hunks");
    out.push(...src.slice(pos, start));
    pos = start;
    for (const line of h.lines) {
      if (line.startsWith(" ")) {
        if (src[pos] !== line.slice(1)) throw new Error(`Context mismatch at line ${pos + 1}`);
        out.push(src[pos++]);
      } else if (line.startsWith("-")) {
        if (src[pos] !== line.slice(1)) throw new Error(`Removal mismatch at line ${pos + 1}`);
        pos++;
      } else if (line.startsWith("+")) {
        out.push(line.slice(1));
      }
    }
    const consumed = start + h.oldCount;
    if (pos !== consumed) throw new Error(`Hunk at ${h.oldStart} consumed ${pos - start} of ${h.oldCount} lines`);
  }
  out.push(...src.slice(pos));
  return out.join("\n");
}

export interface ReviewComment {
  path: string;
  line: number;
  start_line?: number;
  side: "RIGHT";
  body: string;
}

/** One review comment per hunk, each carrying a ```suggestion that replays the hunk. */
export function patchToReviewComments(patch: string): ReviewComment[] {
  const out: ReviewComment[] = [];
  for (const f of parseFilePatches(patch)) {
    for (const h of f.hunks) {
      const replacement = h.lines.filter((l) => l.startsWith(" ") || l.startsWith("+")).map((l) => l.slice(1));
      const body = "```suggestion\n" + replacement.join("\n") + "\n```";
      if (h.oldCount === 0) {
        out.push({ path: f.path, line: Math.max(h.oldStart, 1), side: "RIGHT", body });
      } else {
        const comment: ReviewComment = {
          path: f.path,
          line: h.oldStart + h.oldCount - 1,
          side: "RIGHT",
          body,
        };
        if (h.oldCount > 1) comment.start_line = h.oldStart;
        out.push(comment);
      }
    }
  }
  return out;
}

function buildBrief(reports: LoadedReport[]): string {
  const parts: string[] = [];
  for (const r of reports) {
    if (!r.report.findings.some((f) => f.intentId)) continue;
    parts.push(`## Decision: ${r.decision} — ${r.report.promise}`);
    const goal = (id: string) => r.contract?.intents.find((i) => i.id === id)?.goal ?? "";
    for (const intentId of failingIntents(r)) {
      const agg = (v: Variant) => r.report.aggregates.find((a) => a.intentId === intentId && a.variant === v);
      const b = agg("baseline");
      const c = agg("candidate");
      parts.push(`\n### Failing intent: ${intentId} — ${goal(intentId)}`);
      parts.push(
        `- success: ${b?.successRate ?? "?"} → ${c?.successRate ?? "?"}; actions: ${b?.actionCount ?? "?"} → ${c?.actionCount ?? "?"}; visible on first screen: ${b?.initiallyVisible ?? "?"} → ${c?.initiallyVisible ?? "?"}`,
      );
      for (const v of ["baseline", "candidate"] as const) {
        const t = [...r.traces.values()].find((t) => t.intentId === intentId && t.variant === v && t.repeat === 0);
        parts.push(`- ${v} path (repeat 0): ${pathSummary(t)}`);
      }
    }
    parts.push("\nFailing findings:");
    for (const f of r.report.findings) {
      parts.push(`- [${f.severity}] ${f.title}: ${JSON.stringify(f.baseline)} → ${JSON.stringify(f.candidate)}`);
    }
  }
  return parts.join("\n");
}

async function sourceContext(flags: Flags): Promise<string> {
  if (flags.base && flags.head) {
    const { stdout } = await run("git", ["diff", `${flags.base}..${flags.head}`, "--", "apps/circle/src"], { cwd: ROOT });
    if (stdout.trim() === "") throw new Error(`git diff ${flags.base}..${flags.head} is empty under apps/circle/src`);
    return `Diff that introduced the regression (base..head):\n\n${stdout}`;
  }
  const app = await readFile(path.join(ROOT, "apps/circle/src/App.tsx"), "utf8");
  const seeds = await readFile(path.join(ROOT, "apps/circle/src/seeds.ts"), "utf8");
  return `Current Circle source:\n\n===== apps/circle/src/App.tsx =====\n${app}\n\n===== apps/circle/src/seeds.ts =====\n${seeds}`;
}

async function askModel(brief: string, sources: string, model: string): Promise<{ patch: string; rationale: string }> {
  const apiKey = process.env.MODEL_API_KEY;
  if (!apiKey) throw new Error("MODEL_API_KEY is not set");
  const instructions =
    "You are fixing a measured UX regression in a small React demo app (Circle). " +
    "You get the failing intent findings (baseline vs candidate probe paths, screens, costs) plus the " +
    "Circle source or the diff that introduced the regression. Reply with a JSON object " +
    '{"patch": "<unified diff>", "rationale": "<one or two sentences>"}. ' +
    "Rules: the patch must be a minimal unified diff (git diff format, a/ b/ prefixes) that restores " +
    "the agency of ONLY the failing intents: re-expose the control the baseline path used, without " +
    "reverting unrelated changes and without touching tests, contracts, or anything outside apps/circle/src. " +
    "Prefer restoring the exact baseline control in place (undo the hiding or burying) over adding a " +
    "second parallel control: the patched screen should match the baseline agency, not accumulate options. " +
    "Keep every data-agency tag the baseline reference path uses stable. Smallest change that turns the " +
    "failing intents green.";
  const res = await fetch("https://api.meta.ai/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      connection: "close",
    },
    body: JSON.stringify({
      model,
      input: [{ role: "user", content: [{ type: "input_text", text: `${instructions}\n\nFailing findings:\n${brief}\n\n${sources}` }] }],
    }),
  });
  if (!res.ok) throw new Error(`Muse propose-fix ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { output?: { content?: { text?: string }[] }[] };
  const text = (body.output ?? []).flatMap((o) => o.content ?? []).map((c) => c.text ?? "").join("\n").trim();
  if (!text) throw new Error("Empty model reply");
  return extractJsonPatch(text);
}

async function gitRoot(): Promise<string> {
  const { stdout } = await run("git", ["rev-parse", "--show-toplevel"], { cwd: ROOT });
  return stdout.trim();
}

async function buildCircle(cwd: string, dist: string): Promise<void> {
  await run("pnpm", ["install", "--frozen-lockfile", "--prefer-offline"], { cwd });
  await run("pnpm", ["exec", "vite", "build", "--outDir", dist, "--emptyOutDir"], { cwd: path.join(cwd, "apps/circle") });
}

async function serve(dist: string, port: string): Promise<number> {
  const taken = await fetch(`http://127.0.0.1:${port}/`).catch(() => undefined);
  if (taken) throw new Error(`port ${port} is already in use; pass --base-port/--candidate-port`);
  const { spawn } = await import("node:child_process");
  const child = spawn("python3", ["-m", "http.server", port, "--directory", dist], {
    stdio: "ignore",
    detached: true,
  });
  child.unref();
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      if (res.ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  const res = await fetch(`http://127.0.0.1:${port}/`).catch(() => undefined);
  if (!res || !res.ok) throw new Error(`server on ${port} never came up`);
  if (child.pid === undefined) throw new Error("server has no pid");
  return child.pid;
}

async function runCli(
  contracts: string[],
  extra: string[],
  out: string,
): Promise<{ passed: boolean; reports: LoadedReport[] }> {
  for (const c of contracts) {
    await run(
      path.join(ROOT, "packages/runner/node_modules/.bin/tsx"),
      [path.join(ROOT, "packages/runner/src/cli.ts"), "--contract", c, ...extra, "--out", out, "--no-export"],
      { cwd: ROOT, env: { ...process.env } },
    ).catch((e: { stdout?: string }) => {
      // A failing gate exits non-zero; the report on disk is still the verdict.
      if (!String(e?.stdout ?? "").includes("FAIL") && !String(e ?? "").includes("Command failed")) throw e;
    });
  }
  const reports: LoadedReport[] = [];
  for (const f of await findJsonFiles(out, "report.json")) {
    const report = JSON.parse(await readFile(f, "utf8")) as AgencyReport;
    reports.push({ dir: path.dirname(f), decision: report.decision, report, traces: new Map() });
  }
  const passed = reports.length > 0 && reports.every((r) => r.report.passed);
  return { passed, reports };
}

function fmt(v: unknown): string {
  return typeof v === "number" && !Number.isInteger(v) ? v.toFixed(2) : String(v);
}

function verifyTable(title: string, reports: LoadedReport[]): string[] {
  const lines = [`### ${title}`, ""];
  for (const r of reports) {
    lines.push(`- ${r.report.decision}: ${r.report.passed ? "PASS" : "FAIL"}`);
    for (const f of r.report.findings) {
      lines.push(`  - [${f.severity}] ${f.title}: ${fmt(f.baseline)} → ${fmt(f.candidate)}`);
    }
  }
  lines.push("");
  return lines;
}

async function main(): Promise<void> {
  const flags = parseFlags();
  if (!flags.report) throw new Error("--report <runDir> is required");
  const model = flags.model ?? process.env.MUSE_MODEL ?? DEFAULT_MODEL;
  const verify = flags.verify && !flags["no-verify"];
  const k = Number(flags.repeats);
  if (!Number.isInteger(k) || k < 1) throw new Error(`--repeats must be a positive integer (got ${flags.repeats})`);
  const reportDir = path.resolve(ROOT, flags.report);
  const outDir = path.resolve(ROOT, flags.out ?? flags.report);

  const reports = await loadReports(reportDir);
  const failing = reports.filter((r) => !r.report.passed);
  if (failing.length === 0) {
    await mkdir(outDir, { recursive: true });
    await writeFile(
      path.join(outDir, "fix.md"),
      `# Propose-fix\n\nThe report under ${path.relative(ROOT, reportDir)} is already green: no failing findings, no patch needed.\n`,
    );
    console.log("already green: no patch needed");
    return;
  }

  const brief = buildBrief(failing);
  const sources = await sourceContext(flags);
  const asked = await askModel(brief, sources, model);
  // git apply rejects a patch whose last line is not newline-terminated.
  const patch = asked.patch.endsWith("\n") ? asked.patch : asked.patch + "\n";
  const rationale = asked.rationale;
  const files = validatePatch(patch);

  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "fix.patch"), patch);
  if (flags["suggest-json"] && !flags["no-suggest-json"]) {
    await writeFile(path.join(outDir, "suggest.json"), JSON.stringify(patchToReviewComments(patch), null, 2));
  }

  let scripted: { passed: boolean; reports: LoadedReport[] } = { passed: false, reports: [] };
  let museResult: { passed: boolean; reports: LoadedReport[] } = { passed: false, reports: [] };
  let verifyNote = "verification skipped (--no-verify)";

  if (verify) {
    const top = await gitRoot();
    const baseRef = flags.base ?? "HEAD";
    const headRef = flags.head ?? "HEAD";
    const work = await mkdtemp(path.join(tmpdir(), "agencydiff-fix-"));
    const kill: number[] = [];
    try {
      await run("git", ["worktree", "add", "--detach", path.join(work, "base"), baseRef], { cwd: top });
      const fixTree = path.join(work, "fix");
      await run("git", ["worktree", "add", "--detach", fixTree, headRef], { cwd: top });
      await run("git", ["apply", "--check", path.join(outDir, "fix.patch")], { cwd: fixTree });
      await run("git", ["apply", path.join(outDir, "fix.patch")], { cwd: fixTree });
      const distBase = path.join(work, "dist-base");
      const distFix = path.join(work, "dist-fix");
      await buildCircle(path.join(work, "base"), distBase);
      await buildCircle(fixTree, distFix);
      kill.push(await serve(distBase, flags["base-port"]!));
      kill.push(await serve(distFix, flags["candidate-port"]!));

      const contracts = failing.map((r) => r.contractFile).filter((c): c is string => !!c);
      if (contracts.length === 0) throw new Error("No contract files found for the failing decisions");
      const base = [
        "--baseline",
        `http://127.0.0.1:${flags["base-port"]}/`,
        "--candidate",
        `http://127.0.0.1:${flags["candidate-port"]}/`,
        "--scripted-from",
        "baseline",
      ];
      scripted = await runCli(contracts, [...base, "--driver", "scripted"], path.join(outDir, "verify-scripted"));
      const apiKey = process.env.MODEL_API_KEY;
      if (!apiKey) throw new Error("MODEL_API_KEY is not set for the muse verification run");
      const intents = [...new Set(failing.flatMap((r) => failingIntents(r)))];
      museResult = await runCli(
        contracts,
        [...base, "--driver", "muse", "--model", model, "--repeats", String(k), "--intents", intents.join(",")],
        path.join(outDir, "verify-muse"),
      );
      verifyNote = `patched worktree rebuilt and re-probed (scripted full contract, muse failing intents k=${k})`;
    } finally {
      for (const pid of kill) {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
          /* already gone */
        }
      }
      try {
        const { stdout } = await run("git", ["worktree", "list", "--porcelain"], { cwd: top });
        for (const line of stdout.split("\n")) {
          const m = line.match(/^worktree (.+)$/);
          if (m && m[1].startsWith(work)) await run("git", ["worktree", "remove", "--force", m[1]], { cwd: top });
        }
      } catch {
        /* best effort */
      }
      await rm(work, { recursive: true, force: true });
    }
  }

  const green = !verify || (scripted.passed && museResult.passed);
  const md = [
    "# Propose-fix",
    "",
    `- report: ${path.relative(ROOT, reportDir)}`,
    `- model: ${model}`,
    `- files: ${files.join(", ")}`,
    `- rationale: ${rationale || "(none given)"}`,
    `- verification: ${verifyNote}`,
    "",
    "## Before (failing findings)",
    "",
    ...failing.flatMap((r) => [
      `### ${r.decision}`,
      "",
      ...r.report.findings.map((f: Finding) => `- [${f.severity}] ${f.title}: ${fmt(f.baseline)} → ${fmt(f.candidate)}`),
      "",
    ]),
    ...(verify ? verifyTable("After: scripted (full contract)", scripted.reports) : []),
    ...(verify ? verifyTable(`After: muse (failing intents, k=${k})`, museResult.reports) : []),
    `## Verdict: ${verify ? (green ? "GREEN — the patch restores the failing intents" : "RED — the patch does not fully restore the failing intents") : "UNVERIFIED"}`,
    "",
    "The patch was never applied to your branch. Apply it with `git apply <report>/fix.patch`.",
    "",
  ];
  await writeFile(path.join(outDir, "fix.md"), md.join("\n"));
  console.log(md.join("\n"));
  process.exitCode = !verify || green ? 0 : 1;
}

// Importing the module (unit tests) must not run the CLI.
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
const self = new URL(import.meta.url).pathname;
if (invoked === self) await main();

