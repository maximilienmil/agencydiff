import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { renderOverlay } from "../src/overlay.js";

function whitePng(width: number, height: number): Buffer {
  const png = new PNG({ width, height });
  png.data.fill(255);
  return PNG.sync.write(png);
}

describe("renderOverlay", () => {
  it("tints masked pixels and leaves the rest alone", () => {
    const out = PNG.sync.read(
      renderOverlay(whitePng(4, 4), [
        {
          bounds: { left: 0, top: 0, right: 4, bottom: 4 },
          raster: new Uint8Array([1, 0, 0, 0]),
          maskWidth: 2,
          maskHeight: 2,
          fill: [220, 38, 38],
        },
      ]),
    );
    expect(out.width).toBe(4);
    expect(out.height).toBe(4);
    // Top-left 2x2 block is the single set cell; its boundary draws opaque.
    expect([...out.data.subarray(0, 3)]).toEqual([220, 38, 38]);
    // Bottom-right pixel is outside the mask and stays white.
    const last = (4 * 4 - 1) * 4;
    expect([...out.data.subarray(last, last + 3)]).toEqual([255, 255, 255]);
  });

  it("round-trips a real screenshot's dimensions", async () => {
    const { readFile } = await import("node:fs/promises");
    const { default: path } = await import("node:path");
    const png = await readFile(path.resolve(import.meta.dirname, "..", "fixtures", "circle-baseline.png"));
    const before = PNG.sync.read(png);
    const after = PNG.sync.read(renderOverlay(png, []));
    expect([after.width, after.height]).toEqual([before.width, before.height]);
    expect(after.data.equals(before.data)).toBe(true);
  });
});
