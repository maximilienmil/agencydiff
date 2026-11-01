import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { collectOutputText, requestSamOutputText, samCacheKey } from "../src/sam.js";

function sse(...events: unknown[]): string {
  return events.map((e) => `data: ${JSON.stringify(e)}\n`).join("\n") + "data: [DONE]\n";
}

describe("samCacheKey", () => {
  it("is stable and input-sensitive", () => {
    const png = Buffer.from([1, 2, 3]);
    expect(samCacheKey(png, "p", "sam-3.1")).toBe(samCacheKey(png, "p", "sam-3.1"));
    expect(samCacheKey(png, "p", "sam-3.1")).not.toBe(samCacheKey(png, "q", "sam-3.1"));
    expect(samCacheKey(png, "p", "sam-3.1")).not.toBe(samCacheKey(Buffer.from([9]), "p", "sam-3.1"));
  });
});

describe("collectOutputText", () => {
  it("folds delta events and skips the terminator", () => {
    const body = sse(
      { type: "response.output_text.delta", delta: "<0f>1" },
      { type: "response.output_text.delta", delta: "<|box|>" },
      { type: "response.completed" },
    );
    expect(collectOutputText(body)).toBe("<0f>1<|box|>");
  });

  it("throws on stream errors", () => {
    expect(() =>
      collectOutputText(sse({ type: "error", message: "boom" })),
    ).toThrow(/boom/);
    expect(() =>
      collectOutputText(sse({ type: "response.failed", response: { error: { message: "nope" } } })),
    ).toThrow(/nope/);
  });
});

describe("requestSamOutputText", () => {
  it("serves cache hits without touching the network", async () => {
    const cacheDir = await mkdtemp(path.join(tmpdir(), "sam-cache-"));
    const png = Buffer.from([1, 2, 3]);
    await writeFile(path.join(cacheDir, `${samCacheKey(png, "p", "sam-3.1")}.txt`), "<0f>cached");
    const fetchImpl = (() => {
      throw new Error("network must not be used");
    }) as unknown as typeof fetch;
    const res = await requestSamOutputText(png, "p", { apiKey: "k", cacheDir, fetchImpl });
    expect(res).toMatchObject({ text: "<0f>cached", cached: true });
  });

  it("stores live responses for reruns", async () => {
    const cacheDir = await mkdtemp(path.join(tmpdir(), "sam-cache-"));
    const png = Buffer.from([4, 5, 6]);
    const body = sse({ type: "response.output_text.delta", delta: "<0f>fresh" });
    const fetchImpl = (async () => ({ ok: true, text: async () => body })) as unknown as typeof fetch;
    const first = await requestSamOutputText(png, "p", { apiKey: "k", cacheDir, fetchImpl });
    expect(first.cached).toBe(false);
    expect(await readFile(path.join(cacheDir, `${first.key}.txt`), "utf8")).toBe("<0f>fresh");
    const throwing = (() => {
      throw new Error("network must not be used");
    }) as unknown as typeof fetch;
    const second = await requestSamOutputText(png, "p", { apiKey: "k", cacheDir, fetchImpl: throwing });
    expect(second).toMatchObject({ text: "<0f>fresh", cached: true, key: first.key });
  });
});
