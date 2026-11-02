import { execFile } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { loadVideoData } from "../src/data.js";
import { loadFootage } from "../src/footage.js";

const run = promisify(execFile);
const videoDir = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const repoRoot = join(videoDir, "..");
mkdirSync(join(repoRoot, "media"), { recursive: true });

const voiced = join(repoRoot, "media/agencydiff-demo.mp4");
const captionsOnly = join(repoRoot, "media/agencydiff-demo-captions.mp4");

const inputProps = {
  data: loadVideoData(repoRoot),
  footage: loadFootage(join(videoDir, "public")),
};
console.log("data:", JSON.stringify(inputProps.data, null, 1));

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
await renderMedia({ composition, serveUrl, codec: "h264", outputLocation: voiced, inputProps });
console.log(`rendered ${voiced}`);

// The AAC priming samples push the container ~11ms past 180s and
// stream-copy cuts land on packet boundaries, so re-encode audio only
// (lossless video copy) capped at exactly 180s.
await run("/opt/homebrew/bin/ffmpeg", [
  "-y", "-v", "error", "-i", voiced,
  "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-t", "180",
  "-movflags", "+faststart", `${voiced}.tmp.mp4`,
]);
await run("/opt/homebrew/bin/ffmpeg", ["-y", "-v", "error", "-i", `${voiced}.tmp.mp4`, "-an", "-c:v", "copy", captionsOnly]);
const { rename } = await import("node:fs/promises");
await rename(`${voiced}.tmp.mp4`, voiced);
console.log(`rendered ${captionsOnly}`);

const probe = async (f: string) =>
  (await run("/opt/homebrew/bin/ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f])).stdout.trim();
for (const f of [voiced, captionsOnly]) {
  const duration = Number(await probe(f));
  console.log(`${f}: ${duration}s`);
  if (!(duration > 0 && duration <= 180.0)) throw new Error(`duration out of range: ${f} = ${duration}s`);
}
