import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { chromium as Chromium } from "playwright";

// Regenerates the README images in docs/img with Playwright. Dark, flat,
// no shadows or gradients, to match the demo film.
//   hero.png       1600x900, baseline vs candidate Circle phones + the Finding
//   replay.png     1600x900, the recorded paths: 2 screens vs 8 screens
//   pr-comment.png the failing gate comment (docs/img/pr-comment.md)
//
// Everything is read from recorded files: no servers are started.
//   screens + taps  video/public/footage/clips.json (staged by video/scripts/capture.ts)
//   Finding         apps/report/public/data/precise_location/report.json
//   PR comment      docs/img/pr-comment.md, or the path given as argv[2]
//
// Run: pnpm --filter @agencydiff/runner exec tsx ../../scripts/readme-images.ts

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const { chromium } = createRequire(join(root, "packages/runner/package.json"))("playwright") as {
  chromium: typeof Chromium;
};
const outDir = join(root, "docs/img");
const work = join(root, "media/footage/readme");
mkdirSync(work, { recursive: true });
const commentPath = process.argv[2] ?? join(outDir, "pr-comment.md");

interface Aggregate { intentId: string; variant: string; actionCount?: number; initiallyVisible?: boolean }
interface Report { aggregates: Aggregate[] }
interface Frame { file: string; screen: string | null; tap: { x: number; y: number } | null }
interface Clips { withBaseline: { frames: Frame[] }; withCandidate: { frames: Frame[] } }

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const tokens = pathToFileURL(join(root, "design/tokens.css")).href;
const footage = (file: string) => pathToFileURL(join(root, "video/public", file)).href;

const NIGHT = "#050709";
const base = `
@import url("${tokens}");
*{box-sizing:border-box}
body{margin:0;background:${NIGHT};color:#e4e6eb;font-family:Inter,sans-serif;-webkit-font-smoothing:antialiased}
.mono{font-family:var(--ds-mono)}
.bad{color:#ff6685;font-family:var(--ds-degraded);font-weight:400}
.blue{color:#75b6ff}
.cap{font-family:var(--ds-mono);font-size:15px;letter-spacing:.02em;color:#91a2af}
`;

/** Meta-style depth, as in the film: haze, a constellation of glowing nodes, vignette, grain. */
function depth(w: number, h: number, seed: number): string {
  let x = seed;
  const rnd = () => (x = (x * 16807) % 2147483647) / 2147483647;
  const pts = Array.from({ length: 30 }, () => ({ x: rnd() * (w + 160) - 80, y: rnd() * (h + 160) - 80, r: 1.2 + rnd() * 2.4 }));
  const lines: string[] = [];
  pts.forEach((a, i) => pts.forEach((b, j) => {
    if (j > i && Math.hypot(a.x - b.x, a.y - b.y) < 360) lines.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`);
  }));
  const nodes = pts.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="${p.r * 3}" fill="#5aa2ff" filter="url(#g)" opacity=".5"/><circle cx="${p.x}" cy="${p.y}" r="${p.r * 0.7}" fill="#e6f0ff" opacity=".8"/>`).join("");
  const grain = `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='320'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`;
  return `<div style="position:absolute;inset:0;overflow:hidden;z-index:0;pointer-events:none">
<div style="position:absolute;width:${w * 0.6}px;height:${h * 0.8}px;left:${-w * 0.14}px;top:${-h * 0.3}px;border-radius:50%;background:#0b3a6b;opacity:.34;filter:blur(150px)"></div>
<div style="position:absolute;width:${w * 0.5}px;height:${h * 0.7}px;right:${-w * 0.12}px;bottom:${-h * 0.28}px;border-radius:50%;background:#0d4a48;opacity:.28;filter:blur(160px)"></div>
<svg width="${w}" height="${h}" style="position:absolute;inset:0"><defs><filter id="g" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="5"/></filter></defs><g stroke="#2f6fb3" stroke-width=".8" opacity=".26">${lines.join("")}</g>${nodes}</svg>
<div style="position:absolute;inset:0;box-shadow:inset 0 0 240px 60px rgba(0,0,0,.7)"></div>
<div style="position:absolute;inset:0;opacity:.06;background-image:url(&quot;data:image/svg+xml;utf8,${encodeURIComponent(grain)}&quot;);background-size:320px"></div></div>`;
}

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

async function shot(page: import("playwright").Page, html: string, name: string, full = false): Promise<void> {
  const file = join(work, `${name}.html`);
  writeFileSync(file, html);
  await page.goto(pathToFileURL(file).href, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(outDir, `${name}.png`), fullPage: full });
  console.log(`docs/img/${name}.png`);
}

async function main(): Promise<void> {
  const clips = JSON.parse(readFileSync(join(root, "video/public/footage/clips.json"), "utf8")) as Clips;
  const report = JSON.parse(
    readFileSync(join(root, "apps/report/public/data/precise_location/report.json"), "utf8"),
  ) as Report;
  const agg = (v: string) => report.aggregates.find((a) => a.intentId === "withhold" && a.variant === v);
  const b = agg("baseline");
  const c = agg("candidate");
  const vis = (v?: boolean) => (v === undefined ? "n/a" : v ? "Visible" : "Hidden");
  const baseFrames = clips.withBaseline.frames;
  const candFrames = clips.withCandidate.frames;

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });

  // 1. Hero.
  await shot(page, `<!doctype html><meta charset="utf-8"><style>${base}
.wrap{position:relative;z-index:1;width:1600px;height:900px;display:grid;grid-template-columns:760px 1fr;padding:0 104px;align-items:center;gap:40px}
.brand{display:flex;align-items:center;gap:12px;font-weight:700;font-size:26px;margin-bottom:48px;letter-spacing:-.02em}
.brand i{display:block;width:26px;height:22px;background:linear-gradient(#e4e6eb,#e4e6eb) 0 0/100% 7px no-repeat,linear-gradient(#75b6ff,#75b6ff) 6px 14px/14px 8px no-repeat}
h1{font-weight:700;font-size:112px;line-height:.98;letter-spacing:-.055em;margin:0 0 36px}
p{font-size:28px;line-height:1.4;color:#9aa7b0;margin:0;max-width:36ch}
.rule{height:1px;background:#25303a;margin:56px 0 28px}
.stats{display:flex;gap:72px}
.stats dt{margin:0 0 8px}
.stats dd{margin:0;font-family:var(--ds-mono);font-size:44px;letter-spacing:-.03em;white-space:nowrap}
.stats dd s{text-decoration:none;color:#91a2af}
.r{display:flex;gap:36px;justify-content:center;align-items:flex-start}
.ph{width:300px;border:1px solid #344550;border-radius:18px;overflow:hidden}
.ph img{display:block;width:100%}
.r > div:nth-child(2){margin-top:60px}
.lab{margin-top:18px;display:flex;justify-content:space-between;gap:16px;white-space:nowrap}
</style>${depth(1600, 900, 7)}<div class="wrap"><div>
<div class="brand"><i></i>AgencyDiff</div>
<h1>Regression tests for <span class="blue">human choice.</span></h1>
<p>Your CI checks the code still works. AgencyDiff checks the user can still say no.</p>
<div class="rule"></div>
<dl class="stats" style="margin:0">
<div><dt class="cap">STEPS TO SAY NO</dt><dd><s>${b?.actionCount ?? "—"} →</s> <span class="bad">${c?.actionCount ?? "—"}</span></dd></div>
<div><dt class="cap">ON THE FIRST SCREEN</dt><dd><s>${vis(b?.initiallyVisible)} →</s> <span class="bad">${vis(c?.initiallyVisible)}</span></dd></div></dl>
</div>
<div class="r">
<div><div class="ph"><img src="${footage(baseFrames[0].file)}"></div><div class="lab cap"><span>BASELINE</span><span>declines in 1</span></div></div>
<div><div class="ph"><img src="${footage(candFrames[0].file)}"></div><div class="lab cap"><span>CANDIDATE</span><span>decline hidden</span></div></div>
</div></div>`, "hero");

  // 2. Replay: every screen each Probe passed through, with its taps.
  const strip = (frames: Frame[], label: string, count: string, bad: boolean) => `
<div class="row"><div class="rh"><span class="cap">${label}</span><span class="${bad ? "bad" : "blue"}" style="font-size:34px;font-family:${bad ? "var(--ds-degraded)" : "var(--ds-mono)"}">${count}</span></div>
<div class="strip">${frames
    .map((f, i) => {
      const last = i === frames.length - 1;
      const tap = f.tap && f.tap.y >= 0 && f.tap.y <= 1
        ? `<b style="left:${(f.tap.x * 100).toFixed(1)}%;top:${(f.tap.y * 100).toFixed(1)}%"></b>` : "";
      return `<div class="s"><div class="cap">${last ? "END" : String(i + 1).padStart(2, "0")}</div><div class="p"><img src="${footage(f.file)}">${tap}</div></div>`;
    })
    .join("")}</div></div>`;
  await shot(page, `<!doctype html><meta charset="utf-8"><style>${base}
.wrap{position:relative;z-index:1;width:1600px;height:900px;padding:48px 96px}
h2{margin:0 0 24px;font-weight:700;font-size:40px;letter-spacing:-.04em}
.row{margin-bottom:24px}
.rh{display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid #25303a;padding-bottom:8px;margin-bottom:12px}
.strip{display:flex;gap:24px}
.s .cap{margin-bottom:6px;font-size:13px}
.p{position:relative;width:130px;border:1px solid #344550;border-radius:10px;overflow:hidden}
.p img{display:block;width:100%}
.p b{position:absolute;width:26px;height:26px;margin:-13px 0 0 -13px;border:3px solid #0866ff;border-radius:50%;background:rgba(8,102,255,.25)}
</style>${depth(1600, 900, 11)}<div class="wrap"><h2>“I do not want to share my precise location with this app.”</h2>
${strip(baseFrames, "BASELINE · RECORDED PROBE", `${b?.actionCount ?? "—"} step`, false)}
${strip(candFrames, "CANDIDATE · RECORDED PROBE", `${c?.actionCount ?? "—"} steps`, true)}
</div>`, "replay");

  // 3. PR comment, in GitHub's dark theme.
  const cp = await browser.newPage({ viewport: { width: 1104, height: 400 }, deviceScaleFactor: 1 });
  await shot(cp, `<!doctype html><meta charset="utf-8"><style>${base}
body{padding:32px;width:1104px;background:#010409}
.c{background:#0d1117;border:1px solid #30363d;border-radius:8px;overflow:hidden}
.hd{display:flex;align-items:center;gap:10px;padding:12px 20px;background:#151b23;border-bottom:1px solid #30363d;font-size:14px;color:#9198a1}
.hd b{color:#f0f6fc} .av{width:24px;height:24px;border-radius:50%;background:#30363d}
.st{margin-left:auto;font-family:var(--ds-mono);font-size:12px;color:#ff7b72;border:1px solid #f8514966;padding:3px 10px;border-radius:999px}
.bd{padding:8px 24px 22px;font-size:15px;line-height:1.55;color:#e6edf3}
h2{font-weight:700;font-size:26px;letter-spacing:-.03em;margin:16px 0 4px;padding-bottom:10px;border-bottom:1px solid #30363d}
h3{font-size:16px;margin:18px 0 14px;font-weight:600;color:#e6edf3}
table{border-collapse:collapse;width:100%;font-size:14px;margin:6px 0 14px}
th,td{text-align:left;padding:9px 12px;border:1px solid #30363d} th{background:#151b23;font-weight:600}
tr:nth-child(even) td{background:#0d1117} td:nth-child(n+2){font-family:var(--ds-mono);font-size:13px}
ul{padding-left:20px;margin:6px 0} li{margin:4px 0}
code{font-family:var(--ds-mono);font-size:.85em;background:#262c36;padding:2px 6px;border-radius:6px}
em{color:#9198a1;font-size:13.5px} p{margin:8px 0}
.hi{color:#ff7b72;font-weight:700}
</style><div class="c"><div class="hd"><span class="av"></span><b>github-actions</b> commented <span class="st">AgencyDiff · scripted · failing</span></div>
<div class="bd">${md(readFileSync(commentPath, "utf8")).replace(/<td>high<\/td>/g, '<td class="hi">high</td>')}</div></div>`, "pr-comment", true);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
