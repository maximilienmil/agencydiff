import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import type { AgencyContract, Trace } from "@agencydiff/core";
import { fillLoginFromEnv } from "./auth.js";
import { ScriptedDriver } from "./drivers.js";
import { runProbe } from "./probe.js";

// Ticket 16 demonstration (offline, scripted driver, deterministic):
//   CIRCLE_TEST_USER=test-user CIRCLE_TEST_PASS=demo \
//     pnpm --filter @agencydiff/runner exec tsx src/authProdDemo.ts \
//       --url http://localhost:5175 --out runs/auth-prod-demo
//
// Phase A: scripted login saves a session file, then k=3 authenticated
// probes run from it (plus one unauthenticated probe showing the gate).
// Phase B: k=3 prod-safe probes with verified restore (plus one probe
// attempting a disallowed control, showing the guard).

const ROOT = path.resolve(import.meta.dirname, "../../..");

const { values } = parseArgs({
  options: {
    url: { type: "string", default: "http://localhost:5175" },
    out: { type: "string" },
    repeats: { type: "string", default: "3" },
  },
});

const outDir = path.resolve(ROOT, values.out ?? `runs/auth-prod-${Date.now()}`);
await mkdir(outDir, { recursive: true });

const contract: AgencyContract = JSON.parse(
  await readFile(path.join(ROOT, "contracts", "location.json"), "utf8"),
);
const refs = JSON.parse(
  await readFile(path.join(ROOT, "eval", "reference_paths", "location.json"), "utf8"),
).baseline as Record<string, string[]>;
const target = { baseline: `${values.url}/?auth=1`, candidate: `${values.url}/?auth=1` };
const repeats = Number(values.repeats);
const allowedTags = contract.prodSafe?.allowedTags;

interface Row {
  phase: string;
  repeat: number;
  intent: string;
  initialScreen?: string;
  passed?: boolean;
  steps: number;
  stoppedReason: string;
  restoreVerified?: boolean;
  error?: string;
}
const rows: Row[] = [];

function record(phase: string, repeat: number, t: Trace): void {
  rows.push({
    phase,
    repeat,
    intent: t.intentId,
    initialScreen: t.initial.observation.screen,
    passed: t.oracle.passed,
    steps: t.steps.length,
    stoppedReason: t.stoppedReason,
    restoreVerified: t.restore?.verified,
    error: t.error,
  });
}

// Phase A: log in once with scripted test-account credentials, save session.
const sessionFile = path.join(outDir, "session.json");
{
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${values.url}/?auth=1`, { waitUntil: "networkidle" });
    await fillLoginFromEnv(page, { usernameEnv: "CIRCLE_TEST_USER", passwordEnv: "CIRCLE_TEST_PASS" });
    const signedIn = await page.evaluate(() => window.__circle?.state()?.["auth.signedIn"] === true);
    if (!signedIn) throw new Error("demo login did not authenticate (check CIRCLE_TEST_USER/PASSWORD)");
    await page.context().storageState({ path: sessionFile });
    console.log(`login ok, session: ${path.relative(ROOT, sessionFile)}`);
  } finally {
    await browser.close();
  }
}

const share = contract.intents.find((i) => i.id === "share")!;
for (let repeat = 0; repeat < repeats; repeat++) {
  const t = await runProbe({
    contract,
    intent: share,
    variant: "baseline",
    repeat,
    target,
    driver: new ScriptedDriver((intent) => refs[intent.id] ?? []),
    outDir: path.join(outDir, "auth"),
    auth: { storageState: sessionFile },
  });
  record("auth", repeat, t);
  console.log(`auth #${repeat}: screen=${t.initial.observation.screen} passed=${t.oracle.passed} steps=${t.steps.length}`);
}

{
  const t = await runProbe({
    contract,
    intent: share,
    variant: "baseline",
    repeat: 0,
    target,
    driver: new ScriptedDriver((intent) => refs[intent.id] ?? []),
    outDir: path.join(outDir, "auth-neg"),
  });
  record("auth-no-session", 0, t);
  console.log(`auth-no-session: screen=${t.initial.observation.screen} stopped=${t.stoppedReason} error=${t.error}`);
}

// Phase B: prod-safe probe + verified restore, k=3.
const revoke = contract.intents.find((i) => i.id === "revoke")!;
for (let repeat = 0; repeat < repeats; repeat++) {
  const t = await runProbe({
    contract,
    intent: revoke,
    variant: "baseline",
    repeat,
    target,
    driver: new ScriptedDriver((intent) => refs[intent.id] ?? []),
    outDir: path.join(outDir, "prodsafe"),
    auth: { storageState: sessionFile },
    prodSafe: { allowedTags, restore: true },
  });
  record("prod-safe", repeat, t);
  console.log(
    `prod-safe #${repeat}: passed=${t.oracle.passed} restore=${t.restore?.verified} steps=${t.steps.length}`,
  );
}

{
  const t = await runProbe({
    contract,
    intent: revoke,
    variant: "baseline",
    repeat: 0,
    target,
    driver: new ScriptedDriver(() => ["nav.settings", "settings.subscription"]),
    outDir: path.join(outDir, "prodsafe-neg"),
    auth: { storageState: sessionFile },
    prodSafe: { allowedTags, restore: false },
  });
  record("prod-safe-disallowed", 0, t);
  console.log(`prod-safe-disallowed: stopped=${t.stoppedReason} error=${t.error}`);
}

await writeFile(path.join(outDir, "summary.json"), JSON.stringify({ url: values.url, rows }, null, 2));
console.log(`\ndemo rows: ${path.relative(ROOT, path.join(outDir, "summary.json"))}`);
