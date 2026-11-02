import { copyFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Copies the engine data the published package needs (Circle contracts,
// scripted reference paths, bench ground truth) into packages/cli/data/.
// That directory is gitignored; `npm pack` picks it up via `files`.
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..", "..");
const dest = path.resolve(here, "..", "data");

async function copyDir(src, dst) {
  await mkdir(dst, { recursive: true });
  for (const f of await readdir(src)) {
    if (f.endsWith(".json")) await copyFile(path.join(src, f), path.join(dst, f));
  }
}

await copyDir(path.join(root, "contracts"), path.join(dest, "contracts"));
await copyDir(path.join(root, "eval", "reference_paths"), path.join(dest, "reference_paths"));
await mkdir(dest, { recursive: true });
await copyFile(path.join(root, "eval", "ground_truth.json"), path.join(dest, "ground_truth.json"));
console.log(`cli data synced to ${dest}`);
