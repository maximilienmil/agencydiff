import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { chromium as Chromium } from "playwright";

// Regenerates the README images in docs/img with Playwright:
//   hero.png       1600x900, baseline vs candidate Circle phones + the Finding
//   replay.png     the report's Replay page, mid-playback
//   pr-comment.png a PR comment rendered from a real scripted run's comment.md
//
// Numbers come from files only: the Finding card reads
// apps/report/public/data/precise_location/report.json, and the PR comment is
// the comment.md a scripted run wrote (pass its path as the first argument;
// produce it with the command in docs/img/README.md).
//
// Run: pnpm --filter @agencydiff/runner exec tsx ../../scripts/readme-images.ts <comment.md>

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const { chromium } = createRequire(join(root, "packages/runner/package.json"))("playwright") as {
  chromium: typeof Chromium;
};
const outDir = join(root, "docs/img");
const work = join(root, "media/footage/readme");
mkdirSync(work, { recursive: true });
const commentPath = process.argv[2];
if (!commentPath) throw new Error("usage: readme-images.ts <path/to/comment.md>");

const servers: ChildProcess[] = [];
async function ensureServer(url: string, args: string[]): Promise<void> {
  const up = async () => fetch(url).then((r) => r.ok, () => false);
  if (await up()) return;
  servers.push(spawn("pnpm", args, { cwd: root, stdio: "ignore" }));
  for (let i = 0; i < 60; i++) {
    if (await up()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`server never came up: ${url}`);
}

interface Aggregate { intentId: string; variant: string; actionCount?: number; initiallyVisible?: boolean }
interface Report { decision: string; aggregates: Aggregate[]; findings: { kind: string; intentId?: string; title: string }[] }

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const tokens = pathToFileURL(join(root, "design/tokens.css")).href;

/** Just enough Markdown for comment.md: headings, tables, bullets, emphasis, code. */
function md(src: string): string {
  const inline = (s: string) =>
    esc(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|\s)_([^_]+)_(?=\s|$)/g, "$1<em>$2</em>");
  const lines = src.split("\n").filter((l) => !l.startsWith("<!--"));
  const html: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        rows.push(lines[i].split("|").slice(1, -1).map((c) => c.trim()));
        i++;
      }
      i--;
      const [head, , ...body] = rows;
      html.push(
        `<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${body
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table>`,
      );
    } else if (l.startsWith("### ")) html.push(`<h3>${inline(l.slice(4))}</h3>`);
    else if (l.startsWith("## ")) html.push(`<h2>${inline(l.slice(3))}</h2>`);
    else if (l.startsWith("- ")) html.push(`<ul><li>${inline(l.slice(2))}</li></ul>`);
    else if (l.trim()) html.push(`<p>${inline(l)}</p>`);
  }
  return html.join("\n").replace(/<\/ul>\n<ul>/g, "");
}

async function main(): Promise<void> {
  await ensureServer("http://localhost:5173/", ["--filter", "@agencydiff/circle", "dev"]);
  await ensureServer("http://localhost:5174/agencydiff/", ["--filter", "@agencydiff/report", "dev"]);
  const browser = await chromium.launch();

  // 1. Phones: the location prompt on the baseline and on the seeded candidate.
  const phone = await browser.newPage({ viewport: { width: 430, height: 860 }, deviceScaleFactor: 2 });
  for (const [name, q] of [["baseline", "?variant=baseline"], ["candidate", "?seeds=LOC_HIDE_DECLINE"]] as const) {
    await phone.goto(`http://localhost:5173/${q}`, { waitUntil: "networkidle" });
    await phone.waitForTimeout(400);
    await phone.screenshot({ path: join(work, `circle-${name}.png`) });
  }
  await phone.close();

  const report = JSON.parse(
    readFileSync(join(root, "apps/report/public/data/precise_location/report.json"), "utf8"),
  ) as Report;
  const agg = (v: string) => report.aggregates.find((a) => a.intentId === "withhold" && a.variant === v);
  const b = agg("baseline");
  const c = agg("candidate");
  const vis = (v?: boolean) => (v === undefined ? "n/a" : v ? "Visible" : "Hidden");
  const heroHtml = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="${tokens}">
<style>
body{margin:0;width:1600px;height:900px;overflow:hidden;font-family:var(--ds-font);color:var(--ds-ink);background:#fff;-webkit-font-smoothing:antialiased}
.wrap{position:relative;width:1600px;height:900px;display:grid;grid-template-columns:640px 1fr;align-items:center;padding:0 96px;box-sizing:border-box}
.bg{position:absolute;inset:0;background:#fff}
.l,.r{position:relative}
.brand{display:flex;align-items:center;gap:12px;font-family:var(--ds-display);font-weight:700;font-size:26px;margin-bottom:40px}
.brand i{display:block;width:28px;height:22px;background:linear-gradient(var(--ds-ink) 0 0) 0 0/100% 8px no-repeat,linear-gradient(#0866ff 0 0) 7px 14px/14px 8px no-repeat}
h1{font-family:var(--ds-display);font-weight:400;font-size:92px;line-height:.98;letter-spacing:-.03em;margin:0 0 28px}
h1 span{color:var(--ds-blue);font-style:italic}
p{font-size:23px;line-height:1.45;color:var(--ds-ink-2);margin:0;max-width:36ch}
.chip{display:inline-flex;gap:8px;align-items:center;margin-top:36px;font-size:15px;font-weight:600;color:var(--ds-ink-3)}
.chip b{color:var(--ds-ink)}
.r{display:flex;gap:30px;justify-content:center;align-items:flex-start}
.ph{width:330px;border-radius:26px;overflow:hidden;border:1px solid var(--ds-line-strong);box-shadow:0 18px 44px rgba(28,43,51,.12)}
.ph img{display:block;width:100%}
.ph.c{margin-top:56px}
.lab{display:block;text-align:center;margin-top:16px;font-family:var(--ds-display);font-size:20px;color:var(--ds-ink-2)}
.lab.c{color:var(--ds-blue-ink)}
.card{position:absolute;left:50%;top:-40px;margin-left:60px;width:330px;background:#fff;border-radius:16px;padding:20px 22px;box-shadow:0 20px 48px rgba(28,43,51,.18);border:1px solid var(--ds-line);overflow:hidden}
.card{border-left:5px solid var(--ds-bad)}
.card h4{margin:0 0 6px;font-family:var(--ds-display);font-weight:400;font-size:24px;color:var(--ds-ink)}
.card dt{font-size:13px;color:var(--ds-ink-3);margin-top:10px}
.card dd{margin:2px 0 0;font-family:var(--ds-display);font-size:38px;letter-spacing:-.01em;white-space:nowrap;font-variant-numeric:lining-nums tabular-nums}
.card dd s{text-decoration:none;color:var(--ds-ink-3);font-weight:550}
.card dd em{font-style:normal;color:var(--ds-bad-ink);font-family:var(--ds-degraded)}
.card small{display:block;margin-top:12px;font-family:var(--ds-mono);font-size:11px;color:var(--ds-ink-3)}
</style>
<div class="wrap"><div class="bg"></div>
<div class="l"><div class="brand"><i></i>AgencyDiff</div>
<h1>Regression tests for <span>human choice.</span></h1>
<p>Your CI checks the code still works. AgencyDiff checks the user can still say no.</p>
<div class="chip">Candidate: declining location moved behind <b>“More options”</b></div></div>
<div class="r">
<div><div class="ph"><img src="circle-baseline.png"></div><span class="lab">Baseline</span></div>
<div><div class="ph c"><img src="circle-candidate.png"></div><span class="lab c">Candidate</span></div>
<div class="card"><h4>Finding</h4><dl>
<dt>Steps to say no</dt><dd><s>${b?.actionCount ?? "—"} →</s> <em>${c?.actionCount ?? "—"}</em></dd>
<dt>On the first screen</dt><dd><s>${vis(b?.initiallyVisible)} →</s> <em>${vis(c?.initiallyVisible)}</em></dd></dl>
<small>Muse computer-use Probes, k=3, Oracle on final state</small></div>
</div></div>`;
  writeFileSync(join(work, "hero.html"), heroHtml);
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto(pathToFileURL(join(work, "hero.html")).href, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(outDir, "hero.png") });
  console.log("docs/img/hero.png");

  // 2. Replay view, mid-playback, on the same Intent.
  await page.setViewportSize({ width: 1600, height: 1060 });
  await page.goto("http://localhost:5174/agencydiff/#/replay?run=precise_location&intent=withhold", { waitUntil: "networkidle" });
  await page.waitForSelector(".replay-stage .phone img");
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Next" }).click();
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.scrollTo(0, 255));
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(outDir, "replay.png") });
  console.log("docs/img/replay.png");

  // 3. PR comment, from the real comment.md.
  const commentHtml = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="${tokens}">
<style>
body{margin:0;padding:32px;background:#f1f4f7;font-family:var(--ds-font);color:var(--ds-ink);-webkit-font-smoothing:antialiased;width:1040px}
.c{background:#fff;border:1px solid var(--ds-line);border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(28,43,51,.08)}
.hd{display:flex;align-items:center;gap:10px;padding:14px 22px;background:var(--ds-surface-2);border-bottom:1px solid var(--ds-line);font-size:14px;color:var(--ds-ink-3)}
.hd b{color:var(--ds-ink)} .av{width:24px;height:24px;border-radius:50%;background:var(--ds-ink)}
.st{margin-left:auto;font-weight:700;font-size:13px;color:var(--ds-bad-ink);background:var(--ds-bad-wash);padding:3px 10px;border-radius:999px}
.bd{padding:8px 26px 22px;font-size:15px;line-height:1.55}
h2{font-family:var(--ds-display);font-weight:400;font-size:30px;margin:16px 0 4px} h3{font-size:17px;margin:8px 0 14px;font-weight:650;color:var(--ds-ink-2)}
table{border-collapse:collapse;width:100%;font-size:14px;margin:6px 0 14px} td:nth-child(n+2){font-family:var(--ds-mono);font-size:13px}
th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--ds-line)} th{background:var(--ds-surface-2);color:var(--ds-ink-3);font-weight:600;font-size:13px}
td:last-child{font-weight:650} ul{padding-left:20px;margin:6px 0} li{margin:4px 0}
code{font-family:var(--ds-mono);font-size:.88em;background:var(--ds-surface-2);padding:1px 6px;border-radius:6px}
em{color:var(--ds-ink-3);font-size:13.5px} p{margin:8px 0}
.hi{color:var(--ds-bad-ink)}
</style>
<div class="c"><div class="hd"><span class="av"></span><b>github-actions</b> commented <span class="st">AgencyDiff · scripted · failing</span></div>
<div class="bd">${md(readFileSync(commentPath, "utf8")).replace(/<td>high<\/td>/g, '<td class="hi">high</td>')}</div></div>`;
  writeFileSync(join(work, "pr-comment.html"), commentHtml);
  const cp = await browser.newPage({ viewport: { width: 1104, height: 400 }, deviceScaleFactor: 1 });
  await cp.goto(pathToFileURL(join(work, "pr-comment.html")).href, { waitUntil: "networkidle" });
  await cp.evaluate(() => document.fonts.ready);
  await cp.screenshot({ path: join(outDir, "pr-comment.png"), fullPage: true });
  console.log("docs/img/pr-comment.png");

  await browser.close();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => servers.forEach((s) => s.kill()));
