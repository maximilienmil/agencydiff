import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { diffTracesCommand } from "./diffTraces.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

const CONTRACT = {
  decision: "ext-demo",
  promise: "A person can still do the thing at no more than baseline cost.",
  intents: [{ id: "D1", goal: "Do the thing", polarity: "reject", mustSucceed: true }],
  pairs: [],
};

interface ShotSpec {
  passed: boolean;
  clicks: number;
}

async function writeTrace(tracesDir: string, id: string, variant: "baseline" | "candidate", spec: ShotSpec): Promise<string> {
  const dir = path.join(tracesDir, id);
  const { mkdir } = await import("node:fs/promises");
  await mkdir(dir, { recursive: true });
  const shots: string[] = [];
  const shotName = (n: number) => `${String(n).padStart(3, "0")}.png`;
  await writeFile(path.join(dir, shotName(0)), PNG);
  const steps = [];
  for (let i = 0; i < spec.clicks; i++) {
    const name = shotName(i + 1);
    await writeFile(path.join(dir, name), PNG);
    steps.push({
      index: i,
      tMs: (i + 1) * 100,
      actions: [{ type: "click", x: 100 + i, y: 200 }],
      after: { url: "http://127.0.0.1:9/", tags: [], screenshot: name },
      note: `step ${i}`,
    });
    shots.push(name);
  }
  void shots;
  const trace = {
    id,
    decision: CONTRACT.decision,
    intentId: "D1",
    variant,
    repeat: 0,
    driver: { kind: "scripted" },
    startedAt: new Date(0).toISOString(),
    initial: { state: {}, observation: { url: "http://127.0.0.1:9/", tags: [], screenshot: shotName(0) } },
    steps,
    final: { state: {} },
    oracle: { checked: true, passed: spec.passed },
    stoppedReason: "script_done",
  };
  await writeFile(path.join(dir, "trace.json"), JSON.stringify(trace));
  return dir;
}

async function setup(contract: typeof CONTRACT = CONTRACT) {
  const root = await mkdtemp(path.join(tmpdir(), "ad-dt-"));
  const contractFile = path.join(root, "contract.json");
  await writeFile(contractFile, JSON.stringify(contract));
  const tracesDir = path.join(root, "traces");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(tracesDir, { recursive: true });
  const outDir = path.join(root, "out");
  return { root, contractFile, tracesDir, outDir };
}

describe("diff-traces (recorded-trace scoring through the shipped CLI)", () => {
  it("passes on equal recorded runs and writes report + comment", async () => {
    const { contractFile, tracesDir, outDir } = await setup();
    await writeTrace(tracesDir, "ext-demo.D1.baseline.0", "baseline", { passed: true, clicks: 2 });
    await writeTrace(tracesDir, "ext-demo.D1.candidate.0", "candidate", { passed: true, clicks: 2 });
    process.exitCode = undefined;
    await diffTracesCommand(["--contract", contractFile, "--traces", tracesDir, "--out", outDir]);
    expect(process.exitCode).toBe(0);
    const report = JSON.parse(await readFile(path.join(outDir, "report.json"), "utf8"));
    expect(report.decision).toBe("ext-demo");
    expect(report.findings).toHaveLength(0);
    expect(report.passed).toBe(true);
    const comment = await readFile(path.join(outDir, "comment.md"), "utf8");
    expect(comment).toContain("passed");
    process.exitCode = undefined;
  });

  it("fails the gate on a recorded goal_unreachable regression", async () => {
    const { contractFile, tracesDir, outDir } = await setup();
    await writeTrace(tracesDir, "ext-demo.D1.baseline.0", "baseline", { passed: true, clicks: 2 });
    await writeTrace(tracesDir, "ext-demo.D1.candidate.0", "candidate", { passed: false, clicks: 0 });
    process.exitCode = undefined;
    await diffTracesCommand(["--contract", contractFile, "--traces", tracesDir, "--out", outDir]);
    expect(process.exitCode).toBe(1);
    const report = JSON.parse(await readFile(path.join(outDir, "report.json"), "utf8"));
    expect(report.passed).toBe(false);
    expect(report.findings.some((f: { kind: string }) => f.kind === "goal_unreachable")).toBe(true);
    process.exitCode = undefined;
  });

  it("fails the gate on a recorded action_cost regression", async () => {
    const { contractFile, tracesDir, outDir } = await setup();
    await writeTrace(tracesDir, "ext-demo.D1.baseline.0", "baseline", { passed: true, clicks: 2 });
    await writeTrace(tracesDir, "ext-demo.D1.candidate.0", "candidate", { passed: true, clicks: 4 });
    process.exitCode = undefined;
    await diffTracesCommand(["--contract", contractFile, "--traces", tracesDir, "--out", outDir]);
    expect(process.exitCode).toBe(1);
    const report = JSON.parse(await readFile(path.join(outDir, "report.json"), "utf8"));
    expect(report.findings.some((f: { kind: string }) => f.kind === "action_cost")).toBe(true);
    process.exitCode = undefined;
  });

  it("refuses to score when a referenced screenshot is missing", async () => {
    const { contractFile, tracesDir, outDir } = await setup();
    const dir = await writeTrace(tracesDir, "ext-demo.D1.baseline.0", "baseline", { passed: true, clicks: 1 });
    await writeTrace(tracesDir, "ext-demo.D1.candidate.0", "candidate", { passed: true, clicks: 1 });
    await rm(path.join(dir, "001.png"));
    await expect(diffTracesCommand(["--contract", contractFile, "--traces", tracesDir, "--out", outDir])).rejects.toThrow(
      /Missing evidence/,
    );
  });

  it("refuses to score invalid trace JSON", async () => {
    const { contractFile, tracesDir, outDir } = await setup();
    const { mkdir } = await import("node:fs/promises");
    await mkdir(path.join(tracesDir, "bad"), { recursive: true });
    await writeFile(path.join(tracesDir, "bad", "trace.json"), "{not json");
    await expect(diffTracesCommand(["--contract", contractFile, "--traces", tracesDir, "--out", outDir])).rejects.toThrow(
      /Invalid trace|No trace/,
    );
  });

  it("refuses a silent pass when candidate evidence is missing", async () => {
    const { contractFile, tracesDir, outDir } = await setup();
    await writeTrace(tracesDir, "ext-demo.D1.baseline.0", "baseline", { passed: true, clicks: 2 });
    await expect(diffTracesCommand(["--contract", contractFile, "--traces", tracesDir, "--out", outDir])).rejects.toThrow(
      /Missing recorded evidence/,
    );
  });
});
