import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decodeRecordRaster, maskRecordsOf, parseSamOutput } from "../src/parse.js";

const fixtures = path.resolve(import.meta.dirname, "..", "fixtures");

async function fixtureResponse(): Promise<string> {
  return readFile(path.join(fixtures, "sam-response.txt"), "utf8");
}

describe("parseSamOutput", () => {
  it("parses the recorded Circle response into two masks", async () => {
    const result = await parseSamOutput(await fixtureResponse());
    expect(result.outcome.status).toBe("completed");
    expect(result.diagnostics).toEqual([]);
    const masks = maskRecordsOf(result);
    expect(masks.map((m) => m.objectId).sort()).toEqual(["1", "2"]);
    for (const m of masks) {
      expect(m.bounds.right).toBeLessThanOrEqual(430);
      expect(m.bounds.bottom).toBeLessThanOrEqual(860);
      const raster = decodeRecordRaster(m);
      expect(raster.length).toBe(m.mask.width * m.mask.height);
      expect([...new Set(raster)].every((v) => v === 0 || v === 1)).toBe(true);
      expect(raster.some((v) => v === 1)).toBe(true);
    }
  });

  it("treats empty output as zero matches, not an error", async () => {
    const result = await parseSamOutput("");
    expect(result.outcome.status).toBe("completed");
    expect(maskRecordsOf(result)).toEqual([]);
  });
});
