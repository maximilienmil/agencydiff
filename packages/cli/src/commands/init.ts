import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

export async function initCommand(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    options: {
      url: { type: "string" },
      dir: { type: "string", default: "." },
    },
    args: argv,
  });
  if (!values.url) throw new Error("agencydiff init needs --url <page-to-probe>");
  const dir = path.resolve(values.dir);
  const host = (() => {
    try {
      return new URL(values.url).hostname.replace(/^www\./, "").replace(/[^a-z0-9]+/gi, "-");
    } catch {
      return "site";
    }
  })();

  await mkdir(path.join(dir, "contracts"), { recursive: true });
  const contractPath = path.join(dir, "contracts", `${host}.json`);
  const contract = {
    decision: host,
    promise: `TODO: state the promise in plain language (e.g. users can leave without calling support).`,
    intents: [
      {
        id: "accept",
        goal: "TODO: the thing a person came to do.",
        polarity: "accept",
        domOracle: [{ kind: "visible", selector: "[data-agency=accept]" }],
        target: "accept",
        mustSucceed: true,
      },
      {
        id: "decline",
        goal: "TODO: the protective opposite (decline, restrict, cancel, delete).",
        polarity: "reject",
        domOracle: [{ kind: "visible", selector: "[data-agency=decline]" }],
        target: "decline",
        mustSucceed: true,
      },
    ],
    pairs: [{ accept: "accept", reject: "decline" }],
  };
  await writeFile(contractPath, JSON.stringify(contract, null, 2) + "\n");

  const configPath = path.join(dir, "agencydiff.config.json");
  const config = {
    targets: { baseline: values.url },
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
  console.log("\nNext:");
  console.log(`  1. Edit the contract: goals, domOracle selectors, target data-agency tags.`);
  console.log(`  2. Run: agencydiff audit --url ${values.url} --contract ./contracts/${host}.json --driver muse`);
  console.log(`     (MODEL_API_KEY must be set; scripted needs recorded reference paths.)`);
}
