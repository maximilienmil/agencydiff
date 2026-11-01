import {
  decodeMaskToRaster,
  parseImageStream,
  recordsOfKind,
  type ImageSegmentationResult,
  type SegmentationMaskRecord,
} from "@meta-sam/parser";

/** Parse one image's raw SAM output text (a single `<0f>...` line, possibly empty). */
export async function parseSamOutput(text: string): Promise<ImageSegmentationResult> {
  async function* events(): AsyncGenerator<{
    type: string;
    delta?: string;
    text?: string;
    item_id?: string;
    output_index?: number;
    content_index?: number;
  }> {
    const lane = { item_id: "evidence", output_index: 0, content_index: 0 };
    if (text.trim()) yield { type: "response.output_text.delta", delta: text, ...lane };
    yield { type: "response.output_text.done", text, ...lane };
    yield { type: "response.completed" };
  }
  return parseImageStream(events()).finalResult;
}

export function maskRecordsOf(result: ImageSegmentationResult): readonly SegmentationMaskRecord[] {
  return recordsOfKind(result.records, "mask");
}

export function decodeRecordRaster(record: SegmentationMaskRecord): Uint8Array {
  return decodeMaskToRaster(record.mask);
}
