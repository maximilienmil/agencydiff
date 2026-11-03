import { spawn, type ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { countActions, type AgencyContract } from "../../../packages/core/src/index.js";
import { ScriptedDriver } from "../../../packages/runner/src/drivers.js";
import { runProbe } from "../../../packages/runner/src/probe.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const dir = "/tmp/rs/scratch/SUB-EXTRA";

const vite = path.join(ROOT, "apps", "circle", "node_modules", ".bin", "vite");
const child: ChildProcess = spawn(vite, ["--port", "5311", "--host", "127.0.0.1", "--strictPort"], { cwd: dir, stdio: ["ignore", "pipe", "pipe"] });
const url = "http://127.0.0.1:5311/";
const t0 = Date.now();
for (;;) {
  try {
    const r = await fetch(url);
    if (r.ok) break;
  } catch {}
  if (Date.now() - t0 > 60000) throw new Error("no server");
  await new Promise((r) => setTimeout(r, 500));
}
try {
  const contract = JSON.parse(await readFile(path.join(ROOT, "contracts", "subscription.json"), "utf8")) as AgencyContract;
  const intent = contract.intents.find((i) => i.id === "decline")!;
  const driver = new ScriptedDriver(() => ["nav.settings", "settings.subscription", "sub.decline", "sub.confirm_cancel"]);
  const trace = await runProbe({
    contract, intent, variant: "candidate", repeat: 0,
    target: { baseline: url, candidate: url },
    driver, outDir: path.join(HERE, "traces", "SUB-EXTRA-newpath"),
  });
  console.log("oracle:", trace.oracle, "steps:", trace.steps.length, "stop:", trace.stoppedReason, "error:", trace.error);
} finally {
  child.kill();
  await new Promise((r) => setTimeout(r, 500));
  try { await fetch(url); child.kill("SIGKILL"); } catch {}
}
process.exit(0);
