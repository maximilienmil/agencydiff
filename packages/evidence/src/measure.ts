import type { SegmentationMaskRecord } from "@meta-sam/parser";

/** Count set pixels in a decoded 0/1 raster. */
export function rasterArea(raster: Uint8Array): number {
  let n = 0;
  for (const v of raster) n += v;
  return n;
}

/**
 * Mask area in source-image pixels. The raster covers the record's box, so the
 * set-pixel fraction of the raster scales to the box area.
 */
export function maskFrameArea(record: SegmentationMaskRecord, raster: Uint8Array): number {
  const boxW = record.bounds.right - record.bounds.left;
  const boxH = record.bounds.bottom - record.bounds.top;
  const cells = record.mask.width * record.mask.height;
  if (cells <= 0 || boxW <= 0 || boxH <= 0) return 0;
  return (rasterArea(raster) / cells) * boxW * boxH;
}

/**
 * Accept mask area divided by reject mask area. Undefined when the reject side
 * has no measurable area, so a missing control never reads as zero prominence.
 */
export function prominenceRatio(acceptArea?: number, rejectArea?: number): number | undefined {
  if (acceptArea === undefined || rejectArea === undefined || rejectArea <= 0) return undefined;
  return acceptArea / rejectArea;
}
