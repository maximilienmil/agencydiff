import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import readline from "node:readline";
import { chromium } from "playwright";
import { fillLoginFromEnv, resolveStorageState } from "./auth.js";
import { loadTargetConfig } from "./targets.js";

// Usage:
//   pnpm auth-login --target targets/circle-auth.json [--out .auth/circle.json]
//   pnpm auth-login --target targets/circle-auth.json --headless   # scripted test-account login
//
// Opens a browser so a human logs in once, then saves the session to a
// Playwright storageState file the probes load. With --headless the login
// form is filled from the target's env credentials instead (test accounts
// only). The session file holds login cookies and tokens: keep it out of
// git, like .env.

const ROOT = path.resolve(import.meta.dirname, "../../..");

const { values } = parseArgs({
  options: {
    target: { type: "string" },
    out: { type: "string" },
    variant: { type: "string" },
    headless: { type: "boolean", default: false },
  },
});

if (!values.target) throw new Error("--target <target.json> is required");

const targetFile = path.resolve(ROOT, values.target);
const { config } = await loadTargetConfig(targetFile);
const variant = values.variant ?? config.auditVariant ?? "baseline";
const url = config.urls[variant];
if (!url) throw new Error(`Target has no URL for variant "${variant}"`);

const out = path.resolve(
  ROOT,
  values.out ?? resolveStorageState(targetFile, config.auth ?? {}) ?? `.auth/${path.basename(values.target, ".json")}.json`,
);
await mkdir(path.dirname(out), { recursive: true });

const browser = await chromium.launch({ headless: values.headless });
const ctx = await browser.newContext({ viewport: { width: 430, height: 860 } });
const page = await ctx.newPage();
await page.goto(url, { waitUntil: "networkidle" });

if (values.headless) {
  if (!config.auth?.usernameEnv || !config.auth?.passwordEnv) {
    throw new Error("headless login needs auth.usernameEnv and auth.passwordEnv on the target");
  }
  await fillLoginFromEnv(page, config.auth);
} else {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>((resolve) => {
    console.log(`\nLog in to ${url} in the opened browser, then press Enter here to save the session.`);
    rl.question("", () => {
      rl.close();
      resolve();
    });
  });
}

await ctx.storageState({ path: out });
// The file holds session cookies: confirm it is gitignored.
await writeFile(path.join(path.dirname(out), ".gitignore"), "*\n", { flag: "wx" }).catch(() => {});
// Print repo-relative paths for sessions inside the checkout, absolute
// paths for sessions saved elsewhere (e.g. /tmp smoke checks). The target
// hint stays relative to the target file, which is how probes resolve it.
const show = (p: string) => (p.startsWith(ROOT + path.sep) ? path.relative(ROOT, p) : p);
console.log(`session saved: ${show(out)}`);
const hint = out.startsWith(ROOT + path.sep) ? path.relative(path.dirname(targetFile), out) : out;
console.log(`point the target at it with "auth": { "storageState": "${hint}" }`);
await browser.close();
