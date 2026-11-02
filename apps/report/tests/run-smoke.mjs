import { execSync } from "node:child_process";
import { cp, rm } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../..");
const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: "inherit" });

run("pnpm --filter @agencydiff/report build", root);
run("pnpm --filter @agencydiff/circle exec vite build --base=/agencydiff/circle/", root);
await rm(path.join(root, "apps/report/dist/circle"), { recursive: true, force: true });
await cp(path.join(root, "apps/circle/dist"), path.join(root, "apps/report/dist/circle"), {
  recursive: true,
});
run("node tests/pages.smoke.mjs", path.join(root, "apps/report"));
