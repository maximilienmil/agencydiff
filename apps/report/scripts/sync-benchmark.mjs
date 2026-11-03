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

// Coding-agent PR experiment: count attempts per arm with a Muse-confirmed
// regression, the same rule eval/agent-prs/RESULTS.md and the video use.
try {
  const { readFile, writeFile } = await import("node:fs/promises");
  const raw = JSON.parse(await readFile(path.join(root, "eval/agent-prs/results.json"), "utf8"));
  const attempts = Array.isArray(raw.attempts) ? raw.attempts : [];
  const arm = (a) => {
    const rows = attempts.filter((t) => t.arm === a);
    return { broke: rows.filter((t) => (t.confirmedRegressions ?? []).length > 0).length, attempts: rows.length };
  };
  const tasks = new Set(attempts.map((t) => t.task)).size;
  const out = { source: "eval/agent-prs/results.json", tasks, noGate: arm("a"), gated: arm("b") };
  await writeFile(path.join(dest, "agent-prs.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(`benchmark: eval/agent-prs/results.json -> data/benchmark/agent-prs.json (${out.noGate.broke}/${out.noGate.attempts} vs ${out.gated.broke}/${out.gated.attempts})`);
} catch {
  await rm(path.join(dest, "agent-prs.json"), { force: true });
  console.log("benchmark: eval/agent-prs/results.json missing; headline will show pending");
}
