import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgencyContract, IntentSpec } from "@agencydiff/core";
import type { Driver } from "../src/drivers.js";
import { BrowserEnv } from "../src/env.js";
import { runProbe } from "../src/probe.js";

const intent = { id: "i", goal: "Do the thing.", polarity: "neutral", mustSucceed: true } as IntentSpec;
const contract = { decision: "d", promise: "p", intents: [intent], pairs: [] } as AgencyContract;
const target = { baseline: "http://x/?variant=baseline", candidate: "http://x/?seeds=S" };

const fakeDriver = {
  kind: "scripted",
  run: async () => ({ steps: [], stoppedReason: "agent_done" as const }),
} as unknown as Driver;

function fakeEnv() {
  return {
    state: async () => ({}),
    observe: async () => ({
      observation: { url: "http://x", tags: [], screenshot: "s.png" },
      png: Buffer.from([1]),
    }),
    close: async () => {},
  } as unknown as BrowserEnv;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runProbe browser retries", () => {
  it("retries a dead browser with a fresh one and completes", async () => {
    const open = vi
      .spyOn(BrowserEnv, "open")
      .mockRejectedValueOnce(new Error("Target page, context or browser has been closed"))
      .mockImplementation(async (_url: string, outDir: string) => {
        await mkdir(outDir, { recursive: true });
        return fakeEnv();
      });
    const outDir = await mkdtemp(path.join(tmpdir(), "probe-"));
    const trace = await runProbe({ contract, intent, variant: "baseline", repeat: 0, target, driver: fakeDriver, outDir });
    expect(trace.stoppedReason).toBe("agent_done");
    expect(trace.error).toBeUndefined();
    expect(open).toHaveBeenCalledTimes(2);
    const saved = JSON.parse(await readFile(path.join(outDir, trace.id, "trace.json"), "utf8"));
    expect(saved.id).toBe(trace.id);
  });

  it("records an error trace instead of throwing when browsers keep dying", async () => {
    const open = vi
      .spyOn(BrowserEnv, "open")
      .mockRejectedValue(new Error("Target page, context or browser has been closed"));
    const outDir = await mkdtemp(path.join(tmpdir(), "probe-"));
    const trace = await runProbe({ contract, intent, variant: "candidate", repeat: 1, target, driver: fakeDriver, outDir });
    expect(trace.stoppedReason).toBe("error");
    expect(trace.oracle).toMatchObject({ checked: false });
    expect(trace.error).toContain("has been closed");
    expect(open).toHaveBeenCalledTimes(3);
    const saved = JSON.parse(await readFile(path.join(outDir, trace.id, "trace.json"), "utf8"));
    expect(saved.stoppedReason).toBe("error");
  });
});
