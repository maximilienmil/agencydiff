import { describe, expect, it } from "vitest";
import { LiveHub, encodeSse, livePortFrom, parseSseChunk } from "../src/live.js";

describe("LiveHub", () => {
  it("encodes and parses SSE round-trip", () => {
    const e = { type: "run_started", runId: "r", decision: "d", intentId: "i", goal: "G", at: "2026-11-01T00:00:00Z" } as const;
    expect(parseSseChunk(encodeSse(e))).toEqual([e]);
  });
  it("buffers events for late joiners and validates ports", () => {
    const hub = new LiveHub(5199);
    hub.emit({ type: "run_finished", runId: "r", passed: true, at: "2026-11-01T00:00:00Z" });
    expect(hub.buffered()).toHaveLength(1);
    expect(livePortFrom({ live: true, "live-port": "5175" })).toBe(5175);
    expect(livePortFrom({})).toBeNull();
    expect(() => livePortFrom({ live: true, "live-port": "nope" })).toThrow();
  });
  it("serves health and buffered SSE over HTTP", async () => {
    const hub = new LiveHub(0);
    // Random high port so parallel runs on this machine do not collide.
    const h2 = new LiveHub(20000 + Math.floor(Math.random() * 20000));
    await h2.start();
    try {
      h2.emit({ type: "run_finished", runId: "r2", passed: false, at: "2026-11-01T00:00:00Z" });
      const health = await fetch(`${h2.url}/health`).then((r) => r.json());
      expect(health).toMatchObject({ ok: true, events: 1 });
      const ctrl = new AbortController();
      const res = await fetch(`${h2.url}/events`, { signal: ctrl.signal });
      const reader = res.body!.getReader();
      const chunk = await reader.read();
      ctrl.abort();
      expect(new TextDecoder().decode(chunk.value)).toContain("run_finished");
      void hub;
    } finally { await h2.close(); }
  });
});
