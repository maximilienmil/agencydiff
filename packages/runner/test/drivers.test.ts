import { afterEach, describe, expect, it, vi } from "vitest";
import type { IntentSpec } from "@agencydiff/core";
import { MuseDriver } from "../src/drivers.js";
import type { BrowserEnv } from "../src/env.js";

const intent = { id: "i", goal: "G", polarity: "neutral", mustSucceed: true } as IntentSpec;
const env = {
  execute: async () => {},
  observe: async () => ({
    observation: { url: "http://x", tags: [], screenshot: "s.png" },
    png: Buffer.from([1]),
  }),
} as unknown as BrowserEnv;

function reply(output: unknown[]) {
  return { ok: true, status: 200, json: async () => ({ id: "r1", output }), text: async () => "" };
}

function failure(status: number) {
  return { ok: false, status, json: async () => ({}), text: async () => "boom" };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MuseDriver transport", () => {
  it("retries transient 5xx and completes the probe", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(failure(503))
      .mockResolvedValueOnce(failure(500))
      .mockResolvedValueOnce(
        reply([{ type: "computer_call", call_id: "c1", actions: [{ type: "screenshot" }] }]),
      )
      .mockResolvedValueOnce(
        reply([{ type: "message", content: [{ type: "text", text: "DONE: found" }] }]),
      );
    vi.stubGlobal("fetch", fetch);
    const driver = new MuseDriver({ apiKey: "test", maxSteps: 3 });
    const result = await driver.run(intent, env, Date.now(), Buffer.of());
    expect(result.stoppedReason).toBe("agent_done");
    expect(result.agentMessage).toBe("DONE: found");
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("records an error when 5xx persists past retries", async () => {
    const fetch = vi.fn().mockResolvedValue(failure(500));
    vi.stubGlobal("fetch", fetch);
    const driver = new MuseDriver({ apiKey: "test", maxSteps: 3 });
    const result = await driver.run(intent, env, Date.now(), Buffer.of());
    expect(result.stoppedReason).toBe("error");
    expect(result.error).toContain("Muse 500");
    expect(fetch).toHaveBeenCalledTimes(4);
  }, 20000);

  it("throws client errors without retrying", async () => {
    const fetch = vi.fn().mockResolvedValue(failure(401));
    vi.stubGlobal("fetch", fetch);
    const driver = new MuseDriver({ apiKey: "test", maxSteps: 3 });
    const result = await driver.run(intent, env, Date.now(), Buffer.of());
    expect(result.stoppedReason).toBe("error");
    expect(result.error).toContain("Muse 401");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
