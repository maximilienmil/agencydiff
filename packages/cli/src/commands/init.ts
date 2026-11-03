import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { crawlExploration, validateContracts } from "@agencydiff/runner/src/init.js";
import { applyValidation, draftContracts, renderInitReview } from "@agencydiff/runner/src/initLib.js";

export async function initCommand(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    options: {
      url: { type: "string" },
      dir: { type: "string", default: "." },
    },
    args: argv,
  });
  if (!values.url) throw new Error("agencydiff init needs --url <page-to-probe>");
  const entryUrl = values.url;
  const dir = path.resolve(values.dir);
  const host = (() => {
    try {
      return new URL(entryUrl).hostname.replace(/^www\./, "").replace(/[^a-z0-9]+/gi, "-");
    } catch {
      return "site";
    }
  })();

  // Real pipeline, same as the checkout runner: read-only crawl with the
  // audit guard on, heuristic draft, offline static validation (k=1).
  console.log(`init: exploring ${entryUrl} (census, audit guard on)`);
  const exploration = await crawlExploration(entryUrl);
  console.log(
    `init: ${exploration.screens.length} screen(s), ${exploration.screens.reduce((n, s) => n + s.controls.length, 0)} control(s)`,
  );
  const contracts = draftContracts(exploration);
  if (contracts.length === 0) throw new Error("init: no decisions found; the app exposed no draftable controls");
  const runDir = path.join(dir, "contracts", `.init-runs-${Date.now()}`);
  const outcomes = await validateContracts(contracts, exploration, entryUrl, {
    outDir: runDir,
    driver: "scripted",
  });
  const counts = applyValidation(contracts, outcomes);
  console.log(`init: validation (k=1, static): ${counts.kept} kept, ${counts.flagged} flagged`);

  await mkdir(path.join(dir, "contracts"), { recursive: true });
  const contract = contracts.length === 1 ? contracts[0] : contracts;
  const contractPath = path.join(dir, "contracts", `${host}.json`);
  await writeFile(contractPath, JSON.stringify(contract, null, 2) + "\n");
  await writeFile(
    path.join(dir, "contracts", `${host}.exploration.json`),
    JSON.stringify(exploration, null, 2) + "\n",
  );
  const review = renderInitReview({ url: entryUrl, exploration, contracts, counts });
  await writeFile(path.join(dir, "contracts", `${host}.review.md`), review);

  const configPath = path.join(dir, "agencydiff.config.json");
  const config = {
    targets: { baseline: entryUrl },
    contracts: [`./contracts/${host}.json`],
    driver: "scripted",
    repeats: 1,
  };
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n");

  const show = (p: string) => {
    const rel = path.relative(process.cwd(), p);
    return rel.startsWith("..") ? p : rel;
  };
  console.log(`wrote ${show(configPath)}`);
  console.log(`wrote ${show(contractPath)}`);
  console.log("");
  console.log(review);
}
