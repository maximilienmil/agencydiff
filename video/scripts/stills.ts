import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { writeSoundtrack } from "./soundtrack.js";
import { loadVideoData } from "../src/data.js";
import { loadFootage } from "../src/footage.js";

// Fast layout check: renders stills without the 3-minute encode.
// Usage: cd video && npx tsx scripts/stills.ts [seconds...]
const videoDir = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const repoRoot = join(videoDir, "..");
const outDir = join(repoRoot, "media/frames-draft");
mkdirSync(outDir, { recursive: true });

const want = process.argv.slice(2).map(Number);
const seconds = want.length ? want : [8, 20, 50, 65, 80, 95, 125, 175];

writeSoundtrack(join(videoDir, "public"));
const inputProps = {
  data: loadVideoData(repoRoot),
  footage: loadFootage(join(videoDir, "public")),
};

const serveUrl = await bundle({
  entryPoint: join(videoDir, "src/index.ts"),
  webpackOverride: (c) => ({
    ...c,
    resolve: {
      ...c.resolve,
      extensionAlias: { ...c.resolve?.extensionAlias, ".js": [".tsx", ".ts", ".js"] },
    },
  }),
});
const composition = await selectComposition({ serveUrl, id: "AgencyDiffDemo", inputProps });
for (const s of seconds) {
  const out = join(outDir, `t${String(s).padStart(3, "0")}.png`);
  await renderStill({ composition, serveUrl, frame: Math.round(s * 30), output: out, inputProps });
  console.log(`still: ${out}`);
}
