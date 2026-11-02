// Checks every relative link in README.md resolves to a file in the checkout.
// Usage: node scripts/check-links.mjs (exit non-zero on the first missing target).
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const md = readFileSync(path.join(root, "README.md"), "utf8");
const refs = new Set();
for (const m of md.matchAll(/!?\[[^\]]*\]\(([^)#\s]+)(?:#[^)\s]*)?\)/g)) {
  const target = m[1];
  if (/^(https?:|mailto:|#)/.test(target)) continue;
  refs.add(target);
}
let missing = 0;
for (const ref of [...refs].sort()) {
  const full = path.join(root, ref);
  if (!existsSync(full)) {
    console.error(`missing: ${ref}`);
    missing++;
  }
}
if (missing > 0) {
  console.error(`${missing} missing link target(s)`);
  process.exit(1);
}
console.log(`${refs.size} relative links resolve`);
