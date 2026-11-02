import { chromium } from "playwright";
import { mkdir, readdir, rename } from "node:fs/promises";
import path from "node:path";

// Records the Live replay (not the runner) at film size.
// Usage (from repo root): pnpm --filter @agencydiff/runner exec node scripts/record-live-replay.mjs [reportUrl] [outFile]
// Expects the report app serving the exported run, e.g.
//   pnpm --filter @agencydiff/report dev   (http://localhost:5174/agencydiff/)
const ROOT = path.resolve(import.meta.dirname, "../../..");
const reportUrl = process.argv[2] ?? "http://localhost:5174/agencydiff/#/live?run=LATEST&intent=block_unknown";
const outFile = path.resolve(ROOT, process.argv[3] ?? "media/live-replay.mp4");
const videoDir = path.resolve(ROOT, "media/.video-tmp");
await mkdir(videoDir, { recursive: true });
await mkdir(path.dirname(outFile), { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: videoDir, size: { width: 1920, height: 1080 } } });
const page = await context.newPage();
let url = reportUrl;
if (url.includes("run=LATEST")) {
  const idx = await page.request.get("http://localhost:5174/agencydiff/data/index.json").then((r) => r.json()).catch(() => null);
  const latest = idx?.runs?.[0]?.id;
  if (latest) url = url.replace("run=LATEST", `run=${latest}`);
}
console.log(`recording ${url}`);
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.keyboard.press("Space");
await page.waitForTimeout(14000);
await page.keyboard.press("End");
await page.waitForTimeout(1200);
await page.locator(".live-finding").scrollIntoViewIfNeeded().catch(() => {});
await page.waitForTimeout(2500);
await context.close();
await browser.close();
const files = (await readdir(videoDir)).filter((f) => f.endsWith(".webm"));
if (!files.length) throw new Error("Playwright produced no video");
const webm = path.join(videoDir, files[0]);
const { execFile } = await import("node:child_process");
const { promisify } = await import("node:util");
const run = promisify(execFile);
let ffmpeg = process.env.FFMPEG;
if (!ffmpeg) {
  const { glob } = await import("node:fs/promises").then(() => ({ glob: null })).catch(() => ({ glob: null }));
  void glob;
  const home = process.env.HOME ?? "";
  const candidates = ["ffmpeg", `${home}/Library/Caches/ms-playwright/ffmpeg-1013/ffmpeg-mac`, `${home}/Library/Caches/ms-playwright/ffmpeg-1011/ffmpeg-mac`];
  for (const c of candidates) { try { await run(c, ["-version"]); ffmpeg = c; break; } catch { /* next */ } }
}
if (ffmpeg) {
  await run(ffmpeg, ["-y", "-i", webm, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", outFile]);
  console.log(`video: ${outFile}`);
} else {
  await rename(webm, outFile.replace(/\.mp4$/, ".webm"));
  console.log(`video: ${outFile.replace(/\.mp4$/, ".webm")} (no ffmpeg found; WebM from Playwright)`);
}
