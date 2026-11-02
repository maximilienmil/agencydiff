/**
 * Coordinate-space guard for computer-use probes.
 *
 * The native `computer` tool reports actions in pixels of the last screenshot
 * sent (`(0, 0)` top-left, max = image width/height), so the driver must
 * execute them against that same image. Playwright's mouse takes CSS pixels,
 * which equal screenshot pixels only when deviceScaleFactor is 1. These
 * helpers keep the two spaces in sync and fail loudly when they drift.
 */

export interface Size {
  width: number;
  height: number;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Width and height from a PNG's IHDR chunk, without decoding the image. */
export function pngDimensions(png: Buffer): Size {
  if (png.length < 24 || !png.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("expected a PNG screenshot");
  }
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/** Screenshot pixels to the CSS pixels Playwright's mouse expects. */
export function toCssPixels(x: number, y: number, deviceScaleFactor: number): { x: number; y: number } {
  return { x: Math.round(x / deviceScaleFactor), y: Math.round(y / deviceScaleFactor) };
}

/**
 * Throw when a captured screenshot is not exactly viewport times
 * deviceScaleFactor. A resized, downscaled or full-page shot would silently
 * shift every click, so the probe fails here instead of mis-tapping.
 */
export function assertScreenshotSpace(png: Buffer, viewport: Size, deviceScaleFactor: number): void {
  const actual = pngDimensions(png);
  const expected = {
    width: viewport.width * deviceScaleFactor,
    height: viewport.height * deviceScaleFactor,
  };
  if (actual.width !== expected.width || actual.height !== expected.height) {
    throw new Error(
      `screenshot is ${actual.width}x${actual.height} but the viewport is ` +
        `${viewport.width}x${viewport.height} at deviceScaleFactor ${deviceScaleFactor} ` +
        `(expected ${expected.width}x${expected.height}): clicks would land off target`,
    );
  }
}
