import { copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../..");
const dest = path.join(root, "apps/report/public/data/benchmark");
await mkdir(dest, { recursive: true });

const files = [
  ["eval/results/summary.json", "summary.json"],
  ["eval/susbench/results.json", "susbench.json"],
];
for (const [from, to] of files) {
  try {
    await copyFile(path.join(root, from), path.join(dest, to));
    console.log(`benchmark: ${from} -> data/benchmark/${to}`);
  } catch {
    await rm(path.join(dest, to), { force: true });
    console.log(`benchmark: ${from} missing; section will show pending`);
  }
}
