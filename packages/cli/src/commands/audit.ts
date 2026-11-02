import { mkdir } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { findDataDir, loadContract, loadRefs, runAudit, type DriverName } from "../engine.js";
import { findConfigFile, loadConfig } from "../config.js";

export async function auditCommand(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    options: {
      url: { type: "string" },
      contract: { type: "string" },
      driver: { type: "string" },
      model: { type: "string" },
      repeats: { type: "string" },
      intents: { type: "string" },
      out: { type: "string" },
      config: { type: "string" },
    },
    args: argv,
  });
  const dataDir = await findDataDir();
  const configFile = values.config ?? (await findConfigFile(process.cwd()));
  const cfg = configFile ? (await loadConfig(configFile)).config : {};
  const driver = ((values.driver ?? cfg.driver ?? "scripted") as string) as DriverName;
  if (driver !== "scripted" && driver !== "muse") {
    throw new Error(`--driver must be scripted or muse, got ${driver}`);
  }
  const url = values.url ?? cfg.targets?.baseline;
  if (!url) throw new Error("No URL: pass --url or set targets.baseline in agencydiff.config.json");
  const ref = values.contract ?? cfg.contracts?.[0];
  if (!ref) {
    throw new Error("No contract: pass --contract <file|decision> or add contracts to agencydiff.config.json");
  }
  const repeats = Number(values.repeats ?? cfg.repeats ?? 1);
  const { contract, label, fileBase } = await loadContract(
    path.isAbsolute(ref) || ref.endsWith(".json") ? ref : ref,
    dataDir,
  );
  void label;
  const refs = await loadRefs(dataDir, fileBase, contract.decision);
  const outDir = path.resolve(
    values.out ?? cfg.out ?? path.join("runs", `${new Date().toISOString().replace(/[:.]/g, "-")}-audit`, contract.decision),
  );
  await mkdir(outDir, { recursive: true });
  await runAudit({
    contract,
    refs,
    url,
    driver,
    model: values.model ?? cfg.model,
    repeats,
    intents: values.intents?.split(","),
    outDir,
  });
  console.log(`\naudit: ${path.relative(process.cwd(), outDir)}`);
}
