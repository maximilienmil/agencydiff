import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");
const PORT = 4179;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const BASE = "/agencydiff";

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

const server = createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
    if (urlPath === BASE || urlPath === `${BASE}/`) urlPath = `${BASE}/index.html`;
    if (!urlPath.startsWith(`${BASE}/`)) {
      res.writeHead(404);
      return res.end("not found");
    }
    let file = path.join(dist, urlPath.slice(BASE.length + 1));
    try {
      if ((await stat(file)).isDirectory()) file = path.join(file, "index.html");
    } catch {
      file = path.join(dist, "index.html");
    }
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(500);
    res.end("error");
  }
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const failures = [];
const check = (ok, label) => {
  console.log(`${ok ? "ok" : "FAIL"}  ${label}`);
  if (!ok) failures.push(label);
};

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const badResponses = [];
  const pageErrors = [];
  page.on("response", (r) => {
    if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`);
  });
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await page.goto(`${ORIGIN}${BASE}/`, { waitUntil: "networkidle" });
  check(await page.locator("h1").innerText().then((t) => t.includes("Regression tests")), "overview headline at 1440px");
  check((await page.locator(".showcase-card").count()) === 4, "4 showcase cards");
  check(await page.locator(".hero-replay a").isVisible(), "Replay hero link visible");
  check((await page.locator("table").first().innerText()).includes("20/20"), "benchmark table shows real seeded results");
  check((await page.locator('a[href="circle/"]').count()) >= 1, "Circle link present");

  await page.locator(".hero-replay a").click();
  await page.waitForSelector(".replay-stage .pane");
  await page.waitForFunction(() => {
    const img = document.querySelector(".replay-stage .pane img");
    return img && img.complete && img.naturalWidth > 0;
  });
  check(true, "Replay loads a Trace screenshot");
  const before = await page.locator(".step-note").first().innerText();
  await page.getByRole("button", { name: "Next" }).click();
  const after = await page.locator(".step-note").first().innerText();
  check(before !== after, `Replay Next advances step (${before} -> ${after})`);

  for (const [route, needle] of [
    ["#/runs", "Benchmark"],
    ["#/diff?run=precise_location", "Per-Intent comparison"],
    ["#/contract?run=precise_location", "Intent Pairs"],
    ["#/overview", "Showcase runs"],
  ]) {
    await page.goto(`${ORIGIN}${BASE}/${route}`, { waitUntil: "networkidle" });
    const shown = await page
      .waitForFunction((n) => document.querySelector("main")?.textContent?.includes(n), needle, { timeout: 10000 })
      .then(() => true, () => false);
    check(shown, `route ${route} shows ${needle}`);
  }

  await page.goto(`${ORIGIN}${BASE}/circle/?variant=baseline`, { waitUntil: "networkidle" });
  check((await page.locator(".fiction-banner").innerText()).includes("This is a fictional test app"), "Circle fictional banner");
  check((await page.locator('.fiction-banner a[href="?variant=candidate"]').count()) === 1, "Circle candidate link");
  check((await page.locator('.fiction-banner a[href^="?seeds="]').count()) === 4, "Circle headline seed links");
  await page.goto(`${ORIGIN}${BASE}/circle/?seeds=LOC_HIDE_DECLINE`, { waitUntil: "networkidle" });
  check((await page.locator(".fiction-banner").count()) === 1, "Circle candidate variant loads");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${ORIGIN}${BASE}/`, { waitUntil: "networkidle" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 1, `no horizontal overflow at 390px (overflow=${overflow})`);
  check((await page.locator(".showcase-card").count()) === 4, "4 showcase cards at 390px");
  await page.screenshot({ path: path.join(root, "tests", "overview-390.png"), fullPage: false });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${ORIGIN}${BASE}/`, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(root, "tests", "overview-1440.png"), fullPage: false });

  check(badResponses.length === 0, `no failed assets (${badResponses.slice(0, 5).join("; ") || "none"})`);
  check(pageErrors.length === 0, `no page errors (${pageErrors.slice(0, 3).join("; ") || "none"})`);
} finally {
  await browser.close();
  server.close();
}

if (failures.length > 0) {
  console.error(`smoke: ${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("smoke: all checks passed");
