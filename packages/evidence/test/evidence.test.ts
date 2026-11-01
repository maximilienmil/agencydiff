import { copyFile, mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Trace } from "@agencydiff/core";
import { buildTraceEvidence } from "../src/evidence.js";

const fixtures = path.resolve(import.meta.dirname, "..", "fixtures");

function trace(screenshot: string, tags: Trace["initial"]["observation"]["tags"]): Trace {
  const observation = { url: "http://circle", screen: "home+location_prompt", screenshot, tags };
  return {
    id: "precise_location.withhold.baseline.0",
    decision: "precise_location",
    intentId: "withhold",
    variant: "baseline",
    repeat: 0,
    driver: { kind: "scripted" },
    startedAt: "2026-11-01T00:00:00Z",
    initial: { observation },
    steps: [],
    final: {},
    oracle: { checked: true, passed: true },
    stoppedReason: "script_done",
  };
}

describe("buildTraceEvidence", () => {
  it("measures the recorded pair offline through the disk cache", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "evidence-trace-"));
    await copyFile(path.join(fixtures, "circle-baseline.png"), path.join(dir, "shot.png"));
    const boxes = JSON.parse(
      await readFile(path.join(fixtures, "circle-baseline-boxes.json"), "utf8"),
    );
    const tag = (name: string, b: { left: number; top: number; right: number; bottom: number }) => ({
      tag: name,
      box: [b.left, b.top, b.right - b.left, b.bottom - b.top] as [number, number, number, number],
      inViewport: true,
    });
    const t = trace("shot.png", [tag("location.allow", boxes.allow), tag("location.decline", boxes.decline)]);

    const responseText = await readFile(path.join(fixtures, "sam-response.txt"), "utf8");
    const sse = `data: ${JSON.stringify({ type: "response.output_text.delta", delta: responseText })}\ndata: [DONE]\n`;
    const failing = (() => {
      throw new Error("network must not be used");
    }) as unknown as typeof fetch;
    let calls = 0;
    const counting = (async () => {
      calls++;
      return { ok: true, text: async () => sse };
    }) as unknown as typeof fetch;

    const first = await buildTraceEvidence(dir, t, {
      acceptTag: "location.allow",
      rejectTag: "location.decline",
      sam: { apiKey: "k", cacheDir: path.join(dir, "cache"), fetchImpl: counting },
    });
    expect(calls).toBe(1);
    expect(first.traceId).toBe(t.id);
    expect(first.model).toBe("sam-3.1");
    expect(first.steps).toHaveLength(1);
    const [step] = first.steps;
    expect(step.prominenceRatio).toBeCloseTo(0.99, 1);
    expect(step.overlay).toMatch(/^evidence-.*\.png$/);
    expect(step.controls).toMatchObject([
      { tag: "location.allow", objectId: "1", inInitialViewport: true },
      { tag: "location.decline", objectId: "2", inInitialViewport: true },
    ]);
    for (const c of step.controls) expect(c.maskAreaPx).toBeGreaterThan(0);
    expect(await readdir(dir)).toContain("evidence.json");

    // Rerun costs nothing: the cache serves, even with a dead network.
    await buildTraceEvidence(dir, t, {
      acceptTag: "location.allow",
      rejectTag: "location.decline",
      sam: { apiKey: "k", cacheDir: path.join(dir, "cache"), fetchImpl: failing },
    });
    expect(calls).toBe(1);
  });
});
