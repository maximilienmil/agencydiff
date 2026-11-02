import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadVideoData } from "../src/data.js";
import { loadFootage } from "../src/footage.js";

const videoDir = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const repoRoot = join(videoDir, "..");
const outFile = join(repoRoot, "media/agencydiff-demo-draft.mp4");
mkdirSync(join(repoRoot, "media"), { recursive: true });

const inputProps = {
  data: loadVideoData(repoRoot),
  footage: loadFootage(join(videoDir, "public")),
};
console.log("data:", JSON.stringify(inputProps.data, null, 2));

const serveUrl = await bundle({
  entryPoint: join(videoDir, "src/index.ts"),
  webpackOverride: (c) => c,
});
const composition = await selectComposition({ serveUrl, id: "AgencyDiffDemo", inputProps });
await renderMedia({
  composition,
  serveUrl,
  codec: "h264",
  outputLocation: outFile,
  inputProps,
});
console.log(`rendered ${outFile}`);
