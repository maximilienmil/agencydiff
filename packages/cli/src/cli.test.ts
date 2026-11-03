import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@agencydiff/runner/src/init.js", () => ({
  crawlExploration: async (url: string) => ({
    url,
    startedAt: new Date(0).toISOString(),
    steps: 2,
    screens: [
      {
        key: "billing",
        url,
        title: "Billing",
        text: "Subscribe to Circle+ or cancel your subscription",
        controls: [
          { selector: "#subscribe", kind: "button", text: "Subscribe to Circle+" },
          { selector: "#cancel", kind: "button", text: "Cancel subscription" },
        ],
      },
    ],
  }),
  validateContracts: async (contracts: { decision: string; intents: { id: string }[] }[]) =>
    new Map(
      contracts.flatMap((c) =>
        c.intents.map((i) => [`${c.decision}.${i.id}`, { agentSucceeded: true, oraclePassed: true }]),
      ),
    ),
}));
import { findConfigFile, loadConfig } from "./config.js";
import { bundledContractFile, findDataDir, loadContract, loadRefs } from "./engine.js";

describe("config", () => {
  it("loads agencydiff.config.json and finds it by walking up", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ad-cfg-"));
    const sub = path.join(root, "a", "b");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(sub, { recursive: true });
    await writeFile(path.join(root, "agencydiff.config.json"), JSON.stringify({ driver: "muse", repeats: 2 }));
    expect(await findConfigFile(sub)).toBe(path.join(root, "agencydiff.config.json"));
    const { config } = await loadConfig(path.join(root, "agencydiff.config.json"));
    expect(config.driver).toBe("muse");
    expect(config.repeats).toBe(2);
  });

  it("returns null when no config exists", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ad-nocfg-"));
    expect(await findConfigFile(root)).toBeNull();
  });
});

describe("contracts", () => {
  it("loads a file, a bundled decision, and inline JSON", async () => {
    const dataDir = await findDataDir();
    const root = await mkdtemp(path.join(tmpdir(), "ad-contract-"));
    const file = path.join(root, "renamed.json");
    const inline = { decision: "precise_location", promise: "p", intents: [], pairs: [] };
    await writeFile(file, JSON.stringify(inline));

    const fromFile = await loadContract(file, dataDir);
    expect(fromFile.contract.decision).toBe("precise_location");

    const bundled = await loadContract("precise_location", dataDir);
    expect(bundled.fileBase).toBe("location.json");
    expect(bundled.contract.intents.length).toBeGreaterThan(0);

    const fromInline = await loadContract(JSON.stringify(inline), dataDir);
    expect(fromInline.label).toBe("inline contract");
  });

  it("rejects unknown references", async () => {
    const dataDir = await findDataDir();
    await expect(loadContract("no-such-decision", dataDir)).rejects.toThrow(/Cannot resolve contract/);
  });

  it("resolves bundled refs by decision for renamed files", async () => {
    const dataDir = await findDataDir();
    const file = await bundledContractFile(dataDir, "precise_location");
    expect(file).not.toBeNull();
    const refs = await loadRefs(dataDir, "renamed-copy.json", "precise_location");
    expect(refs?.baseline.share).toContain("location.allow");
  });

  it("returns null refs for unknown contracts", async () => {
    const dataDir = await findDataDir();
    expect(await loadRefs(dataDir, "nope.json", "nope")).toBeNull();
  });
});

describe("init", () => {
  it("writes the runner pipeline output, not a TODO template", async () => {
    const { initCommand } = await import("./commands/init.js");
    const root = await mkdtemp(path.join(tmpdir(), "ad-init-"));
    await initCommand(["--url", "https://example.com/settings", "--dir", root]);
    const config = JSON.parse(await readFile(path.join(root, "agencydiff.config.json"), "utf8"));
    expect(config.targets.baseline).toBe("https://example.com/settings");
    const raw = await readFile(path.join(root, config.contracts[0]), "utf8");
    expect(raw).not.toContain("TODO");
    const contract = JSON.parse(raw);
    expect(contract.decision).toBe("subscription");
    expect(contract.pairs).toHaveLength(1);
    expect(contract.pairs[0].accept).not.toBe(contract.pairs[0].reject);
    const files = await readdir(path.join(root, "contracts"));
    expect(files.some((f) => f.endsWith(".exploration.json"))).toBe(true);
    expect(files.some((f) => f.endsWith(".review.md"))).toBe(true);
  });
});
