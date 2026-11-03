/**
 * Limited Contributor rediscovery (eval/followup/redesign-selectivity).
 *
 * Predeclared procedure, identical for every triggered case: MuseDriver with
 * the contract's goal string verbatim, max-steps 12, desktop viewport, k=2,
 * model muse-spark-1.3-contributor. The agent is a black box: screenshots +
 * goal only; no eval files, contracts, patches, or ground truth in context.
 * Outcome judged by INDEPENDENT state-hook oracle validation, never by the
 * agent's DONE/INFEASIBLE claim. Hard cost cap enforced before each case.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { countActions, type AgencyContract, type Trace } from "../../../packages/core/src/index.js";
import { MuseDriver, type MuseUsage } from "../../../packages/runner/src/drivers.js";
import { runProbe } from "../../../packages/runner/src/probe.js";
import { loadApiKey } from "../../../packages/runner/src/agentPrs.js";
import { usdForTokens } from "../../../packages/runner/src/benchScore.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");

const { values } = parseArgs({
  options: {
    cases: {
      type: "string",
      default: "LOC-EXTRA,LOC-REMOVE,DM-EXTRA,DM-REMOVE,SUB-EXTRA,SUB-REMOVE",
    },
    k: { type: "string", default: "2" },
    cap: { type: "string", default: "5.0" },
    "base-port": { type: "string", default: "5301" },
    "cand-port": { type: "string", default: "5302" },
  },
});

const FAMILY_CONTRACT: Record<string, string> = {
  precise_location: "location",
  teen_dm: "teen_dm",
  subscription: "subscription",
};
const FOCAL: Record<string, string> = {
  precise_location: "revoke",
  teen_dm: "block_unknown",
  subscription: "decline",
};
const BASELINE_EFFORT: Record<string, number> = { precise_location: 3, teen_dm: 4, subscription: 3 };

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
    } catch {}
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

function median(xs: number[]): number | undefined {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

async function main(): Promise<void> {
  const cap = Number(values.cap);
  const k = Number(values.k);
  const ids = (values.cases as string).split(",").map((s) => s.trim()).filter(Boolean);
  const apiKey = await loadApiKey();
  const usage: MuseUsage = { inputTokens: 0, outputTokens: 0, calls: 0 };
  const baseUrl = process.env.MODEL_API_BASE ?? "https://api.meta.ai/v1";
  const out: Record<string, unknown>[] = [];

  const baseDir = "/tmp/rs/base/apps/circle";
  if (!existsSync(path.join(baseDir, "src", "App.tsx"))) throw new Error("base tree missing; run matrix first");

  for (const id of ids) {
    const [family] = id.split("-").length >= 2 ? [id.split("-")[0]] : [""];
    const famMap: Record<string, string> = { LOC: "precise_location", DM: "teen_dm", SUB: "subscription" };
    const fam = famMap[family];
    if (!fam) throw new Error(`unknown family for ${id}`);
    const dir = `/tmp/rs/scratch/${id}`;
    if (!existsSync(path.join(dir, "src", "App.tsx"))) throw new Error(`scratch missing for ${id}; run matrix first`);

    const spent = usdForTokens(usage.inputTokens, usage.outputTokens);
    if (spent >= cap - 1.0) {
      out.push({ id, skipped: true, reason: `cap reserve reached ($${spent.toFixed(2)} of $${cap})` });
      continue;
    }
    let baseSrv: ChildProcess | null = null;
    let candSrv: ChildProcess | null = null;
    try {
      baseSrv = await serve(baseDir, Number(values["base-port"]));
      candSrv = await serve(dir, Number(values["cand-port"]));
      const contract = JSON.parse(
        await readFile(path.join(ROOT, "contracts", `${FAMILY_CONTRACT[fam]}.json`), "utf8"),
      ) as AgencyContract;
      const focal = FOCAL[fam];
      const intent = contract.intents.find((i) => i.id === focal)!;
      const driver = new MuseDriver({
        apiKey,
        baseUrl,
        model: "muse-spark-1.3-contributor",
        maxSteps: 12,
        historyLimit: 3,
        usage,
      });
      const traces: Trace[] = [];
      for (let r = 0; r < k; r++) {
        traces.push(
          await runProbe({
            contract,
            intent,
            variant: "candidate",
            repeat: r,
            target: {
              baseline: `http://127.0.0.1:${Number(values["base-port"])}/`,
              candidate: `http://127.0.0.1:${Number(values["cand-port"])}/`,
            },
            driver,
            outDir: path.join(HERE, "traces", `${id}-rediscover`),
          }),
        );
      }
      const passes = traces.filter((t) => t.oracle.passed === true);
      const base = BASELINE_EFFORT[fam];
      const actions = passes.map(countActions);
      const classification =
        passes.length === 0
          ? "INFEASIBLE-CONFIRMED"
          : passes.length < traces.length
            ? "INCONCLUSIVE"
            : (median(actions) ?? 0) <= base
              ? "REDISCOVERED-SAME"
              : "REDISCOVERED-LONGER";
      const rec = {
        id,
        family: fam,
        focal,
        goal: intent.goal,
        k,
        classification,
        oraclePass: `${passes.length}/${traces.length}`,
        actions,
        baselineEffort: base,
        agentClaims: traces.map((t) => t.final.agentMessage ?? null),
        usage: { ...usage, usd: usdForTokens(usage.inputTokens, usage.outputTokens) },
      };
      await mkdir(path.join(HERE, "raw", id), { recursive: true });
      await writeFile(path.join(HERE, "raw", id, "rediscovery.json"), JSON.stringify(rec, null, 2));
      out.push(rec);
      console.log(`done ${id}: ${classification} (${passes.length}/${traces.length})`);
    } finally {
      await stopServer(candSrv, candPortOf(values));
      await stopServer(baseSrv, basePortOf(values));
    }
  }
  const spent = usdForTokens(usage.inputTokens, usage.outputTokens);
  console.log(`rediscovery spend: $${spent.toFixed(2)} (${usage.calls} calls)`);
  await writeFile(path.join(HERE, "raw", "rediscovery-summary.json"), JSON.stringify({ out, usage, usd: spent }, null, 2));
}

function basePortOf(v: unknown): number {
  return Number((v as Record<string, unknown>)["base-port"]);
}
function candPortOf(v: unknown): number {
  return Number((v as Record<string, unknown>)["cand-port"]);
}

await main();
