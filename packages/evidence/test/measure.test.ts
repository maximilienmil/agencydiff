import { describe, expect, it } from "vitest";
import { maskFrameArea, prominenceRatio, rasterArea } from "../src/measure.js";
import type { SegmentationMaskRecord } from "@meta-sam/parser";

function record(boxW: number, boxH: number, maskW: number, maskH: number): SegmentationMaskRecord {
  return {
    kind: "mask",
    order: 0,
    objectId: "1",
    identity: "1",
    revision: 0,
    bounds: { left: 0, top: 0, right: boxW, bottom: boxH },
    mask: { encoding: "lossless", payload: "", width: maskW, height: maskH },
  };
}

describe("rasterArea", () => {
  it("counts set pixels", () => {
    expect(rasterArea(new Uint8Array([0, 1, 1, 0]))).toBe(2);
  });
});

describe("maskFrameArea", () => {
  it("scales the set fraction to the box", () => {
    // Half the 2x2 raster set over a 10x20 box.
    expect(maskFrameArea(record(10, 20, 2, 2), new Uint8Array([1, 1, 0, 0]))).toBe(100);
  });

  it("is zero for degenerate geometry", () => {
    expect(maskFrameArea(record(0, 20, 2, 2), new Uint8Array([1, 1, 1, 1]))).toBe(0);
    expect(maskFrameArea(record(10, 20, 0, 0), new Uint8Array([]))).toBe(0);
  });
});

describe("prominenceRatio", () => {
  it("divides accept area by reject area", () => {
    expect(prominenceRatio(100, 50)).toBe(2);
  });

  it("is undefined without a measurable reject area", () => {
    expect(prominenceRatio(100, 0)).toBeUndefined();
    expect(prominenceRatio(100, undefined)).toBeUndefined();
    expect(prominenceRatio(undefined, 50)).toBeUndefined();
  });
});
