import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AgencyContract } from "../src/types.js";

// Keeps the ticket deliverables honest: every Agency Contract must be
// well-formed, every intent needs scripted reference paths for both variants,
// and ground truth must cover exactly the seeds Circle implements.
const ROOT = new URL("../../..", import.meta.url);
const read = (rel: string) => readFileSync(new URL(rel, ROOT), "utf8");
const contractsDir = new URL("contracts/", ROOT);

const contractFiles = readdirSync(contractsDir).filter((f) => f.endsWith(".json"));
const contracts = new Map(
  contractFiles.map((f) => {
    const c = JSON.parse(read(`contracts/${f}`)) as AgencyContract;
    // The runner resolves reference paths by contract file name, not decision id.
    return [c.decision, { file: f, contract: c }];
  }),
);

function seedIds(): string[] {
  const src = read("apps/circle/src/seeds.ts");
  const block = src.match(/export const SEEDS = \{([\s\S]*?)\} as const/)?.[1] ?? "";
  return [...block.matchAll(/^  ([A-Z0-9_]+):/gm)].map((m) => m[1]);
}

describe("agency contracts", () => {
  it("contracts are well-formed with resolvable pairs", () => {
    expect(contractFiles.length).toBeGreaterThan(0);
    for (const { contract: c } of contracts.values()) {
      expect(c.decision, "decision").toMatch(/^[a-z_]+$/);
      expect(c.promise.length, `${c.decision}.promise`).toBeGreaterThan(0);
      const ids = new Set(c.intents.map((i) => i.id));
      expect(ids.size, `${c.decision} intent ids`).toBe(c.intents.length);
      for (const i of c.intents) {
        expect(i.goal.length, `${c.decision}.${i.id}.goal`).toBeGreaterThan(0);
        expect(["accept", "reject", "neutral"]).toContain(i.polarity);
        expect(typeof i.mustSucceed).toBe("boolean");
      }
      for (const p of c.pairs) {
        expect(ids.has(p.accept), `${c.decision} pair accept ${p.accept}`).toBe(true);
        expect(ids.has(p.reject), `${c.decision} pair reject ${p.reject}`).toBe(true);
      }
    }
  });

  it("every intent has baseline and candidate reference paths", () => {
    for (const { file, contract: c } of contracts.values()) {
      // Audit-only contracts (real public sites) have no scripted reference paths.
      if (!existsSync(new URL(`eval/reference_paths/${file}`, ROOT))) continue;
      const refs = JSON.parse(read(`eval/reference_paths/${file}`)) as Record<string, Record<string, string[]>>;
      for (const variant of ["baseline", "candidate"]) {
        for (const i of c.intents) {
          const path = refs[variant]?.[i.id];
          expect(Array.isArray(path) && path.length > 0, `${c.decision}.${i.id}.${variant}`).toBe(true);
        }
      }
    }
  });

  it("ground truth covers exactly the implemented seeds with valid references", () => {
    const truth = JSON.parse(read("eval/ground_truth.json")) as {
      seeds: { seed: string; intents: string[]; direction: string; metric: string }[];
    };
    expect(truth.seeds.map((s) => s.seed).sort()).toEqual(seedIds().sort());
    for (const s of truth.seeds) {
      expect(["regression", "improvement", "none"]).toContain(s.direction);
      expect(["action_cost", "navigation_depth", "visibility", "default", "success", "asymmetry"]).toContain(
        s.metric,
      );
      for (const ref of s.intents) {
        const [decision, intentId] = ref.split(".");
        const intentIds = contracts.get(decision)?.contract.intents.map((i) => i.id) ?? [];
        expect(intentIds, `${s.seed} references ${ref}`).toContain(intentId);
      }
    }
  });
});
