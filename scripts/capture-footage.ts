import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { chromium as Chromium } from "playwright";

// Playwright is a dependency of @agencydiff/runner, not of the repo root, so
// resolve it from that package instead of adding a second copy.
const rootForRequire = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const { chromium } = createRequire(join(rootForRequire, "packages/runner/package.json"))(
  "playwright",
) as { chromium: typeof Chromium };

// Re-records the demo's still footage reproducibly at 1920x1080:
// Circle (baseline + candidate), the report viewer's Diff page, and a PR-check
// comment rendered from the real Findings in the report data. Output goes to
// media/footage/ (gitignored); `pnpm --filter agencydiff-video run capture`
// (video/scripts/capture.ts) copies the clips the composition uses, and
// anything missing renders as [PENDING].
//
// Run: pnpm --filter @agencydiff/runner exec tsx ../../scripts/capture-footage.ts

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const outDir = join(root, "media/footage");
mkdirSync(outDir, { recursive: true });

const servers: ChildProcess[] = [];
async function ensureServer(url: string, args: string[]): Promise<void> {
  try {
    const r = await fetch(url);
    if (r.ok) return;
  } catch {
    // not up yet: start it below
  }
  const child = spawn("pnpm", args, { cwd: root, stdio: "ignore", detached: false });
  servers.push(child);
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      // keep waiting
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`server never came up: ${url}`);
}

interface Finding {
  kind: string;
  title: string;
  baseline?: unknown;
  candidate?: unknown;
}

async function main(): Promise<void> {
  await ensureServer("http://localhost:5173/", ["--filter", "@agencydiff/circle", "dev"]);
  // The report app is served under /agencydiff/ (see apps/report/vite.config.ts).
  await ensureServer("http://localhost:5174/agencydiff/", ["--filter", "@agencydiff/report", "dev"]);

  const index = (await (await fetch("http://localhost:5174/agencydiff/data/index.json")).json()) as {
    runs: Array<{ id: string }>;
  };
  const runId = index.runs[0]?.id;
  const report = runId
    ? ((await (await fetch(`http://localhost:5174/agencydiff/data/${runId}/report.json`)).json()) as {
        findings: Finding[];
        passed: boolean;
      })
    : null;

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const shot = async (url: string, name: string) => {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(outDir, name) });
    console.log(`captured ${name}`);
  };

  await shot("http://localhost:5173/?variant=baseline", "circle-baseline.png");
  await shot("http://localhost:5173/?variant=candidate", "circle-candidate.png");
  if (runId) await shot(`http://localhost:5174/agencydiff/#/diff?run=${runId}`, "report-diff.png");

  if (report) {
    const rows = report.findings
      .map(
        (f) =>
          `<tr><td>${f.kind}</td><td>${f.title}</td><td>${String(f.baseline ?? "—")} -&gt; ${String(f.candidate ?? "—")}</td></tr>`,
      )
      .join("");
    const html = `<!doctype html><meta charset="utf8"><title>AgencyDiff check</title>
<style>body{font-family:-apple-system,"Segoe UI",Arial,sans-serif;background:#f6f4ef;color:#1c1a17;margin:0;padding:48px}
.card{background:#fff;border:1px solid #e4e0d7;border-radius:10px;max-width:1100px;margin:0 auto;padding:36px 44px}
h1{font-size:30px;margin:0 0 8px}.fail{color:#a4261c;font-weight:700}table{width:100%;border-collapse:collapse;font-size:18px}
td{border-bottom:1px solid #e4e0d7;padding:10px 8px}</style>
<div class="card"><h1>AgencyDiff <span class="fail">${report.passed ? "passed" : "failed"}</span></h1>
<p>Rendered from the recorded Findings in apps/report/public/data (report.json), not a live PR.</p>
<table>${rows}</table></div>`;
    writeFileSync(join(outDir, "pr-comment.html"), html);
    await page.goto(`file://${join(outDir, "pr-comment.html")}`);
    await page.screenshot({ path: join(outDir, "pr-comment.png") });
    console.log("captured pr-comment.png");
  }

  await browser.close();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => servers.forEach((s) => s.kill()));
