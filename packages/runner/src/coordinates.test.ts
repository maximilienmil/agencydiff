import { describe, expect, it } from "vitest";
import { assertScreenshotSpace, pngDimensions, toCssPixels } from "./coordinates";

/** Minimal PNG bytes with the given IHDR size, no IDAT needed for parsing. */
function pngBytes(width: number, height: number): Buffer {
  const buf = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12);
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

describe("pngDimensions", () => {
  it("reads IHDR width and height", () => {
    expect(pngDimensions(pngBytes(430, 860))).toEqual({ width: 430, height: 860 });
  });

  it("rejects non-PNG bytes", () => {
    expect(() => pngDimensions(Buffer.from("not a png"))).toThrow(/png/i);
  });
});

describe("toCssPixels", () => {
  it("is the identity at deviceScaleFactor 1", () => {
    expect(toCssPixels(215, 368, 1)).toEqual({ x: 215, y: 368 });
  });

  it("divides screenshot pixels by the scale factor", () => {
    expect(toCssPixels(860, 1720, 2)).toEqual({ x: 430, y: 860 });
    expect(toCssPixels(431, 861, 2)).toEqual({ x: 216, y: 431 });
  });
});

describe("assertScreenshotSpace", () => {
  it("accepts a 430x860 shot for the default viewport at scale 1", () => {
    expect(() =>
      assertScreenshotSpace(pngBytes(430, 860), { width: 430, height: 860 }, 1),
    ).not.toThrow();
  });

  it("accepts a 2x shot when the scale factor is 2", () => {
    expect(() =>
      assertScreenshotSpace(pngBytes(860, 1720), { width: 430, height: 860 }, 2),
    ).not.toThrow();
  });

  it("throws when the shot does not match viewport times scale", () => {
    expect(() =>
      assertScreenshotSpace(pngBytes(860, 1720), { width: 430, height: 860 }, 1),
    ).toThrow(/860x1720.*430x860/s);
  });
});
