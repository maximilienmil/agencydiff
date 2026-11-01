import { PNG } from "pngjs";

export interface OverlayMask {
  bounds: { left: number; top: number; right: number; bottom: number };
  raster: Uint8Array;
  maskWidth: number;
  maskHeight: number;
  fill: [r: number, g: number, b: number];
}

export interface OverlayOptions {
  /** Opacity of the mask tint, 0-1. */
  fillOpacity?: number;
}

/**
 * Tint each mask over the screenshot and outline its boundary. Mask cells map
 * onto the bounds box with nearest-neighbour scaling; boundary cells (any
 * 4-neighbour unset or outside the raster) draw fully opaque.
 */
export function renderOverlay(screenshot: Buffer, masks: OverlayMask[], opts?: OverlayOptions): Buffer {
  const png = PNG.sync.read(screenshot);
  const alpha = opts?.fillOpacity ?? 0.35;
  for (const m of masks) {
    paintMask(png, m, alpha);
  }
  return PNG.sync.write(png);
}

function paintMask(png: PNG, m: OverlayMask, alpha: number): void {
  const boxW = m.bounds.right - m.bounds.left;
  const boxH = m.bounds.bottom - m.bounds.top;
  if (boxW <= 0 || boxH <= 0 || m.maskWidth <= 0 || m.maskHeight <= 0) return;
  const at = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= png.width || y >= png.height) return -1;
    return (y * png.width + x) * 4;
  };
  const cellOn = (cx: number, cy: number): boolean =>
    cx >= 0 && cy >= 0 && cx < m.maskWidth && cy < m.maskHeight && m.raster[cy * m.maskWidth + cx] === 1;

  for (let cy = 0; cy < m.maskHeight; cy++) {
    for (let cx = 0; cx < m.maskWidth; cx++) {
      if (!cellOn(cx, cy)) continue;
      const x0 = Math.floor(m.bounds.left + (cx * boxW) / m.maskWidth);
      const x1 = Math.floor(m.bounds.left + ((cx + 1) * boxW) / m.maskWidth);
      const y0 = Math.floor(m.bounds.top + (cy * boxH) / m.maskHeight);
      const y1 = Math.floor(m.bounds.top + ((cy + 1) * boxH) / m.maskHeight);
      const boundary =
        !cellOn(cx - 1, cy) || !cellOn(cx + 1, cy) || !cellOn(cx, cy - 1) || !cellOn(cx, cy + 1);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = at(x, y);
          if (i < 0) continue;
          if (boundary) {
            png.data[i] = m.fill[0];
            png.data[i + 1] = m.fill[1];
            png.data[i + 2] = m.fill[2];
            png.data[i + 3] = 255;
          } else {
            png.data[i] = Math.round(png.data[i] * (1 - alpha) + m.fill[0] * alpha);
            png.data[i + 1] = Math.round(png.data[i + 1] * (1 - alpha) + m.fill[1] * alpha);
            png.data[i + 2] = Math.round(png.data[i + 2] * (1 - alpha) + m.fill[2] * alpha);
          }
        }
      }
    }
  }
}
