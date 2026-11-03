/**
 * Deterministic selectivity runner (eval/followup/redesign-selectivity).
 *
 * Serves a pristine-baseline copy and one patched variant copy of Circle,
 * replays the BASELINE reference path with the scripted driver on both,
 * scores with diffContract, and reads fresh-load defaults. No model calls.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { cp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import {
  countActions,
  diffContract,
  type AgencyContract,
  type Trace,
} from "../../../packages/core/src/index.js";
import { ScriptedDriver } from "../../../packages/runner/src/drivers.js";
import { runProbe } from "../../../packages/runner/src/probe.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const BASE_SHA = "7c84640d894cf9366030c72ba36e7576b9a24a2d";
const SCRATCH = "/tmp/rs";

const { values } = parseArgs({
  options: {
    cases: { type: "string", default: "all" },
    repeats: { type: "string", default: "2" },
    smoke: { type: "boolean", default: false },
    controls: { type: "boolean", default: false },
    "base-port": { type: "string", default: "5301" },
    "cand-port": { type: "string", default: "5302" },
  },
});

const repeats = Number(values.repeats);
const basePort = Number(values["base-port"]);
const candPort = Number(values["cand-port"]);

const FAMILY_CONTRACT: Record<string, string> = {
  precise_location: "location",
  teen_dm: "teen_dm",
  subscription: "subscription",
  screen_time: "screen_time",
};
const FOCAL: Record<string, string> = {
  precise_location: "revoke",
  teen_dm: "block_unknown",
  subscription: "decline",
  screen_time: "remove_limit",
};

interface Edit {
  file: string;
  find: string;
  replace: string;
}
interface CaseDef {
  id: string;
  family: string;
  class: string;
  useShared?: string;
  edits?: Edit[];
  expect: string;
}

async function loadCases(): Promise<CaseDef[]> {
  const out: CaseDef[] = [];
  const shared: Record<string, Edit[]> = {};
  for (const f of ["loc.json", "dm.json", "sub.json"]) {
    const doc = JSON.parse(await readFile(path.join(HERE, "variants", f), "utf8")) as {
      baseRef?: string;
      shared?: Record<string, Edit[]>;
      cases: CaseDef[];
    };
    if (doc.shared) Object.assign(shared, doc.shared);
    for (const c of doc.cases) {
      if (c.useShared) c.edits = [...(shared[c.useShared] ?? []), ...(c.edits ?? [])];
      out.push(c);
    }
  }
  return out;
}

async function sh(cwd: string, cmd: string, args: string[]): Promise<string> {
  const { execFile } = await import("node:child_process");
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${cmd} ${args.join(" ")} failed: ${stderr || err.message}`));
      else resolve(stdout);
    });
  });
}

async function ensureDesign(): Promise<void> {
  // styles.css imports ../../../design/tokens.css (repo-relative). Extract the
  // design dir at SHA so scratch layouts resolve it: base/apps/circle/src up
  // three levels is /tmp/rs, for both base and per-case scratch dirs.
  if (!existsSync(path.join(SCRATCH, "design", "tokens.css"))) {
    await mkdir(SCRATCH, { recursive: true });
    await new Promise<void>((resolve, reject) => {
      const git = spawn("git", ["-C", ROOT, "archive", BASE_SHA, "design"], {});
      const tar = spawn("tar", ["-x", "-C", SCRATCH], {});
      git.stdout.pipe(tar.stdin);
      let err = "";
      tar.stderr.on("data", (d) => (err += d));
      tar.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`tar exit ${code}: ${err}`))));
      git.on("error", reject);
    });
  }
}

async function ownNodeModules(dir: string): Promise<void> {
  // A symlinked node_modules shares vite's optimizer cache between concurrent
  // servers; replace with a per-dir copy (pnpm: symlinks into the store).
  const nm = path.join(dir, "node_modules");
  const st = await import("node:fs").then((fs) => fs.promises.lstat(nm).catch(() => null));
  if (st && st.isSymbolicLink()) await rm(nm, { recursive: true, force: true });
  if (!existsSync(nm)) {
    await cp(path.join(ROOT, "apps", "circle", "node_modules"), nm, {
      recursive: true,
      filter: (src) => !src.includes(`${path.sep}.vite`),
    });
  }
}

async function ensureBaseTree(): Promise<string> {
  const dest = path.join(SCRATCH, "base", "apps", "circle");
  await ensureDesign();
  if (existsSync(path.join(dest, "src", "App.tsx"))) {
    await ownNodeModules(dest);
    return dest;
  }
  await mkdir(path.join(SCRATCH, "base"), { recursive: true });
  const archive = await new Promise<Buffer>((resolve, reject) => {
    const { execFile } = process as never;
    void execFile;
    reject(new Error("unreachable"));
    void resolve;
  }).catch(() => null);
  void archive;
  // Extract via git archive piped to tar.
  await new Promise<void>((resolve, reject) => {
    const git = spawn("git", ["-C", ROOT, "archive", BASE_SHA, "apps/circle"], {});
    const tar = spawn("tar", ["-x", "-C", path.join(SCRATCH, "base")], {});
    git.stdout.pipe(tar.stdin);
    let err = "";
    tar.stderr.on("data", (d) => (err += d));
    tar.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`tar exit ${code}: ${err}`))));
    git.on("error", reject);
  });
  const tsconfig = path.join(dest, "tsconfig.json");
  if (existsSync(tsconfig)) {
    const t = await readFile(tsconfig, "utf8");
    await writeFile(tsconfig, t.replace("../../tsconfig.base.json", path.join(ROOT, "tsconfig.base.json")));
  }
  return dest;
}

async function buildScratch(caseId: string, edits: Edit[]): Promise<string> {
  const base = await ensureBaseTree();
  const dir = path.join(SCRATCH, "scratch", caseId);
  await rm(dir, { recursive: true, force: true });
  await mkdir(path.join(SCRATCH, "scratch"), { recursive: true });
  await cp(base, dir, {
    recursive: true,
    filter: (src) => !src.endsWith(`${path.sep}node_modules`),
  });
  // Each scratch gets its own node_modules COPY (pnpm layout: mostly tiny
  // symlinks into the store). Sharing one dir via symlink makes concurrent
  // vite servers fight over node_modules/.vite and serve stale bundles.
  await cp(path.join(ROOT, "apps", "circle", "node_modules"), path.join(dir, "node_modules"), {
    recursive: true,
    filter: (src) => !src.includes(`${path.sep}.vite`),
  });
  // Harness plumbing (not a variant): scratch copies live outside the repo,
  // so point the tsconfig extends at the real base config. App code untouched.
  const tsconfig = path.join(dir, "tsconfig.json");
  if (existsSync(tsconfig)) {
    const t = await readFile(tsconfig, "utf8");
    await writeFile(tsconfig, t.replace("../../tsconfig.base.json", path.join(ROOT, "tsconfig.base.json")));
  }
  for (const e of edits) {
    // e.file looks like apps/circle/src/App.tsx; scratch root holds the
    // contents of apps/circle, so strip the prefix.
    const rel = e.file.replace(/^apps\/circle\//, "");
    const fp = path.join(dir, rel);
    const text = await readFile(fp, "utf8");
    const count = text.split(e.find).length - 1;
    if (count !== 1) throw new Error(`${caseId}: find occurs ${count}x (need 1) in ${e.file}`);
    await writeFile(fp, text.replace(e.find, e.replace));
  }
  return dir;
}

async function serve(dir: string, port: number): Promise<ChildProcess> {
  const vite = path.join(ROOT, "apps", "circle", "node_modules", ".bin", "vite");
  const child = spawn(vite, ["--port", String(port), "--host", "127.0.0.1", "--strictPort"], {
    cwd: dir,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const url = `http://127.0.0.1:${port}/`;
  const t0 = Date.now();
  for (;;) {
    try {
      const res = await fetch(url);
      if (res.ok) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() - t0 > 60000) {
      child.kill();
      throw new Error(`server on ${port} never came up`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return child;
}

async function stopServer(child: ChildProcess | null, port: number): Promise<void> {
  if (!child) return;
  child.kill();
  await new Promise((r) => setTimeout(r, 1000));
  // Confirm the port is actually free before handing it to the next case.
  for (let i = 0; i < 20; i++) {
    try {
      await fetch(`http://127.0.0.1:${port}/`);
      await new Promise((r) => setTimeout(r, 500));
    } catch {
      return;
    }
  }
  child.kill("SIGKILL");
}

async function readDefault(url: string): Promise<Record<string, unknown>> {
  // playwright resolves from the runner package; link it locally (git-ignored).
  const nm = path.join(HERE, "node_modules");
  await mkdir(nm, { recursive: true });
  const link = path.join(nm, "playwright");
  if (!existsSync(link)) {
    await symlink(
      path.join(ROOT, "packages", "runner", "node_modules", "playwright"),
      link,
    );
  }
  const { chromium } = (await import("playwright")) as typeof import("playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    const state = (await page.evaluate(() => (window as any).__circle?.state?.())) as
      | Record<string, unknown>
      | undefined;
    if (!state) throw new Error(`no __circle.state at ${url}`);
    return state;
  } finally {
    await browser.close();
  }
}

function median(xs: number[]): number | undefined {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

async function probeContract(opts: {
  contract: AgencyContract;
  refBaseline: Record<string, string[]>;
  baseUrl: string;
  candUrl: string;
  outDir: string;
  caseId: string;
}): Promise<Trace[]> {
  const { contract, refBaseline, baseUrl, candUrl, outDir } = opts;
  const driver = () =>
    new ScriptedDriver((intent) => {
      const p = refBaseline[intent.id];
      if (!p) throw new Error(`no baseline reference path for ${contract.decision}.${intent.id}`);
      return p;
    });
  const traces: Trace[] = [];
  for (const intent of contract.intents) {
    for (const variant of ["baseline", "candidate"] as const) {
      for (let r = 0; r < repeats; r++) {
        traces.push(
          await runProbe({
            contract,
            intent,
            variant,
            repeat: r,
            target: { baseline: baseUrl, candidate: candUrl },
            driver: driver(),
            outDir: path.join(outDir, opts.caseId),
          }),
        );
      }
    }
  }
  return traces;
}

type PathOutcome = "PASS" | "TAG-MISSING" | "UNSATISFIED" | "ERROR";

function classifyPath(traces: Trace[], focal: string): {
  outcome: PathOutcome;
  detail: string;
  oracleRate: number;
  medianActions: number | undefined;
} {
  const cand = traces.filter((t) => t.intentId === focal && t.variant === "candidate");
  const passed = cand.filter((t) => t.oracle.passed === true).length;
  const missing = cand.filter((t) => (t.error ?? "").includes("reference tag not found"));
  const errors = cand.filter((t) => t.stoppedReason === "error" && missing.length === 0);
  const outcome: PathOutcome =
    passed === cand.length && cand.length > 0
      ? "PASS"
      : missing.length > 0
        ? "TAG-MISSING"
        : errors.length > 0
          ? "ERROR"
          : "UNSATISFIED";
  return {
    outcome,
    detail: missing[0]?.error ?? errors[0]?.error ?? `${passed}/${cand.length} oracle-pass`,
    oracleRate: cand.length ? passed / cand.length : 0,
    medianActions: median(cand.map(countActions)),
  };
}

async function runCase(
  c: CaseDef,
  urls: { base: string; cand: string },
  outRoot: string,
): Promise<Record<string, unknown>> {
  const contractFile = FAMILY_CONTRACT[c.family];
  const contract = JSON.parse(
    await readFile(path.join(ROOT, "contracts", `${contractFile}.json`), "utf8"),
  ) as AgencyContract;
  const ref = JSON.parse(
    await readFile(path.join(ROOT, "eval", "reference_paths", `${contractFile}.json`), "utf8"),
  ) as { baseline: Record<string, string[]> };
  const traces = await probeContract({
    contract,
    refBaseline: ref.baseline,
    baseUrl: urls.base,
    candUrl: urls.cand,
    outDir: path.join(outRoot, "traces"),
    caseId: c.id,
  });
  // Determinism check: scripted repeats must agree action-for-action.
  const det: string[] = [];
  for (const intent of contract.intents) {
    for (const variant of ["baseline", "candidate"] as const) {
      const ts = traces.filter((t) => t.intentId === intent.id && t.variant === variant);
      const sigs = ts.map((t) => `${t.stoppedReason}|${t.oracle.passed}|${countActions(t)}|${t.error ?? ""}`);
      if (new Set(sigs).size > 1) det.push(`${intent.id}.${variant}: ${sigs.join(" vs ")}`);
    }
  }
  const report = diffContract(contract, traces);
  const focal = FOCAL[c.family];
  const pathOutcome = classifyPath(traces, focal);
  const baseState = await readDefault(urls.base);
  const candState = await readDefault(urls.cand);
  const key = contract.defaultKey!;
  const result = {
    id: c.id,
    family: c.family,
    class: c.class,
    expect: c.expect,
    focal,
    repeats,
    path: pathOutcome,
    determinism: det.length === 0 ? "identical" : det,
    defaultKey: key,
    defaultBaseline: baseState[key],
    defaultCandidate: candState[key],
    oracleRates: Object.fromEntries(
      contract.intents.map((i) => [
        i.id,
        {
          baseline: traces.filter((t) => t.intentId === i.id && t.variant === "baseline" && t.oracle.passed === true).length / repeats,
          candidate: traces.filter((t) => t.intentId === i.id && t.variant === "candidate" && t.oracle.passed === true).length / repeats,
        },
      ]),
    ),
    gatePassed: report.passed,
    findings: report.findings.map((f) => ({
      kind: f.kind,
      severity: f.severity,
      intentId: f.intentId,
      title: f.title,
    })),
  };
  await mkdir(path.join(outRoot, "raw", c.id), { recursive: true });
  await writeFile(path.join(outRoot, "raw", c.id, "result.json"), JSON.stringify(result, null, 2));
  return result;
}

async function main(): Promise<void> {
  const outRoot = HERE;
  await mkdir(path.join(outRoot, "raw"), { recursive: true });
  if (values.smoke) {
    // Excluded-family plumbing check: styling-only variant, screen_time only.
    const dir = await buildScratch("_smoke", [
      { file: "apps/circle/src/styles.css", find: "  --accent: var(--ds-blue);", replace: "  --accent: #0e7a5f;" },
    ]);
    let base: ChildProcess | null = null;
    let cand: ChildProcess | null = null;
    try {
      const baseDir = await ensureBaseTree();
      base = await serve(baseDir, basePort);
      cand = await serve(dir, candPort);
      const res = await runCase(
        { id: "_smoke", family: "screen_time", class: "styling-only", expect: "pass" },
        { base: `http://127.0.0.1:${basePort}/`, cand: `http://127.0.0.1:${candPort}/` },
        outRoot,
      );
      console.log(JSON.stringify({ smoke: res }, null, 2));
    } finally {
      await stopServer(cand, candPort);
      await stopServer(base, basePort);
    }
    return;
  }

  if (values.controls) {
    const baseDir = await ensureBaseTree();
    const results: Record<string, unknown>[] = [];
    let base: ChildProcess | null = null;
    try {
      base = await serve(baseDir, basePort);
      const url = `http://127.0.0.1:${basePort}/`;
      for (const family of ["precise_location", "teen_dm", "subscription"]) {
        const fake: CaseDef = { id: `CONTROL-${family}`, family, class: "control", expect: "no findings" };
        results.push(await runCase(fake, { base: url, cand: url }, outRoot));
        console.log(`done CONTROL-${family}`);
      }
    } finally {
      await stopServer(base, basePort);
    }
    await writeFile(path.join(outRoot, "raw", "controls.json"), JSON.stringify(results, null, 2));
    console.log("wrote controls");
    return;
  }

  const all = await loadCases();
  const only = (values.cases as string).split(",").map((s) => s.trim()).filter(Boolean);
  const list = values.cases === "all" ? all : all.filter((c) => only.includes(c.id));
  if (list.length === 0) throw new Error("no cases selected");

  const baseDir = await ensureBaseTree();
  const results: Record<string, unknown>[] = [];
  for (const c of list) {
    const dir = await buildScratch(c.id, c.edits ?? []);
    let base: ChildProcess | null = null;
    let cand: ChildProcess | null = null;
    try {
      base = await serve(baseDir, basePort);
      cand = await serve(dir, candPort);
      results.push(
        await runCase(c, { base: `http://127.0.0.1:${basePort}/`, cand: `http://127.0.0.1:${candPort}/` }, outRoot),
      );
      console.log(`done ${c.id}`);
    } finally {
      await stopServer(cand, candPort);
      await stopServer(base, basePort);
    }
  }
  await writeFile(path.join(outRoot, "raw", "summary.json"), JSON.stringify(results, null, 2));
  console.log(`wrote ${results.length} case results`);
}

await main();
