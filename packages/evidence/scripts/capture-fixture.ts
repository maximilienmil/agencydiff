import { createServer as createHttpServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { buildObjectPrompt } from "@meta-sam/parser";
import { requestSamOutputText } from "../src/sam.js";
import { parseSamOutput, maskRecordsOf, decodeRecordRaster } from "../src/parse.js";
import { maskFrameArea, prominenceRatio } from "../src/measure.js";
import { renderOverlay } from "../src/overlay.js";

const ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const EVIDENCE = path.join(ROOT, "packages", "evidence");
const DIST = path.join(ROOT, "apps", "circle", "dist");
const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

async function apiKey(root: string): Promise<string> {
  if (process.env.MODEL_API_KEY) return process.env.MODEL_API_KEY;
  try {
    const env = await readFile(path.join(root, ".env"), "utf8");
    const hit = env.split("\n").find((l) => l.startsWith("MODEL_API_KEY="));
    const value = hit?.slice("MODEL_API_KEY=".length).trim();
    if (value) return value;
  } catch {
    // fall through to the error below
  }
  throw new Error("MODEL_API_KEY is not set");
}

async function main(): Promise<void> {
  const server = createHttpServer(async (req, res) => {
    const urlPath = (req.url ?? "/").split("?")[0];
    const file = path.join(DIST, urlPath === "/" ? "index.html" : urlPath.slice(1));
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      const fallback = await readFile(path.join(DIST, "index.html"));
      res.writeHead(200, { "content-type": "text/html" });
      res.end(fallback);
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 430, height: 860 }, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${port}/?variant=baseline`, { waitUntil: "networkidle" });
    await page.waitForSelector('[data-agency="location.allow"]');
    await page.waitForSelector('[data-agency="location.decline"]');
    const allow = await page.locator('[data-agency="location.allow"]').first().boundingBox();
    const decline = await page.locator('[data-agency="location.decline"]').first().boundingBox();
    if (!allow || !decline) throw new Error("prompt controls not found");
    const png = await page.screenshot({ type: "png" });

    const { PNG } = await import("pngjs");
    const { width, height } = PNG.sync.read(png);
    const box = (b: { x: number; y: number; width: number; height: number }) => ({
      left: Math.max(0, Math.floor(b.x)),
      top: Math.max(0, Math.floor(b.y)),
      right: Math.min(width, Math.floor(b.x) + Math.max(1, Math.round(b.width))),
      bottom: Math.min(height, Math.floor(b.y) + Math.max(1, Math.round(b.height))),
    });
    const prompt = buildObjectPrompt({
      size: { width, height },
      objects: [
        { id: 1, prompts: [{ box: box(allow) }] },
        { id: 2, prompts: [{ box: box(decline) }] },
      ],
    });

    const { text, key } = await requestSamOutputText(png, prompt, {
      apiKey: await apiKey(ROOT),
      cacheDir: path.join(EVIDENCE, ".sam-cache"),
    });
    if (!text.trim()) throw new Error("SAM returned zero matches; fixture needs masks");
    const result = await parseSamOutput(text);
    const masks = maskRecordsOf(result);
    if (masks.length === 0) throw new Error("SAM returned no mask records");
    const areas = masks.map((m) => maskFrameArea(m, decodeRecordRaster(m)));

    const fixtures = path.join(EVIDENCE, "fixtures");
    await writeFile(path.join(fixtures, "circle-baseline.png"), png);
    await writeFile(path.join(fixtures, "circle-baseline-prompt.txt"), prompt);
    await writeFile(path.join(fixtures, "sam-response.txt"), text);
    await writeFile(
      path.join(fixtures, "circle-baseline-boxes.json"),
      JSON.stringify({ width, height, allow: box(allow), decline: box(decline), key }, null, 2),
    );
    await writeFile(
      path.join(fixtures, "circle-baseline-overlay.png"),
      renderOverlay(
        png,
        masks.map((m, i) => ({
          bounds: m.bounds,
          raster: decodeRecordRaster(m),
          maskWidth: m.mask.width,
          maskHeight: m.mask.height,
          fill: (i === 0 ? [22, 163, 74] : [220, 38, 38]) as [number, number, number],
        })),
      ),
    );
    console.log(`records=${masks.length} areas=${areas.map((a) => a.toFixed(0)).join(",")} ratio=${prominenceRatio(areas[0], areas[1])?.toFixed(2)} key=${key.slice(0, 12)}`);
  } finally {
    await browser.close();
    server.close();
  }
}

await main();
