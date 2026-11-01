import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildObjectPrompt, recordsOfKind } from "@meta-sam/parser";
import type {
  EvidenceControl,
  Observation,
  StepEvidence,
  TagBox,
  Trace,
  TraceEvidence,
} from "@agencydiff/core";
import { PNG } from "pngjs";
import { maskFrameArea, prominenceRatio } from "./measure.js";
import { decodeRecordRaster, parseSamOutput } from "./parse.js";
import { renderOverlay, type OverlayMask } from "./overlay.js";
import { SAM_MODEL, requestSamOutputText, type SamRequestOptions } from "./sam.js";

export interface EvidenceRequest {
  /** `data-agency` tag of the control fulfilling the intent (accept side). */
  acceptTag: string;
  /** Tag of the opposing control (reject side). */
  rejectTag: string;
  sam: SamRequestOptions;
  /** Where overlay PNGs and evidence.json are written. Defaults to the trace dir. */
  outDir?: string;
  /** Key steps only; at most this many screenshots per trace. */
  maxSteps?: number;
}

const ACCEPT_FILL: [number, number, number] = [22, 163, 74];
const REJECT_FILL: [number, number, number] = [220, 38, 38];

/** Prompt-box integers for one tag, clamped to the image. Undefined when the tag is absent. */
export function promptBox(tag: TagBox, width: number, height: number):
  | { left: number; top: number; right: number; bottom: number }
  | undefined {
  const left = Math.max(0, Math.floor(tag.box[0]));
  const top = Math.max(0, Math.floor(tag.box[1]));
  const right = Math.min(width, left + Math.max(1, Math.round(tag.box[2])));
  const bottom = Math.min(height, top + Math.max(1, Math.round(tag.box[3])));
  if (right <= left || bottom <= top) return undefined;
  return { left, top, right, bottom };
}

/**
 * Build SAM evidence for the key steps of one recorded trace: the initial
 * screen, the first screen showing either control, and the final screen.
 * Screenshots, overlays and evidence.json live next to trace.json.
 */
export async function buildTraceEvidence(
  traceDir: string,
  trace: Trace,
  req: EvidenceRequest,
): Promise<TraceEvidence> {
  const outDir = req.outDir ?? traceDir;
  const initialInViewport = new Set(
    trace.initial.observation.tags.filter((t) => t.inViewport).map((t) => t.tag),
  );

  const candidates: { step: number; observation: Observation }[] = [
    { step: -1, observation: trace.initial.observation },
    ...trace.steps.map((s) => ({ step: s.index, observation: s.after })),
  ];
  const firstVisible = candidates.findIndex(
    (c) => c.step >= 0 && c.observation.tags.some((t) => t.inViewport && isSide(t.tag, req)),
  );
  const picked = new Map<string, { step: number; observation: Observation }>();
  const take = (c: { step: number; observation: Observation }) => {
    if (!picked.has(c.observation.screenshot)) picked.set(c.observation.screenshot, c);
  };
  take(candidates[0]);
  if (firstVisible > 0) take(candidates[firstVisible]);
  take(candidates[candidates.length - 1]);
  const steps = [...picked.values()].slice(0, req.maxSteps ?? 3);

  const evidence: TraceEvidence = {
    traceId: trace.id,
    model: req.sam.model ?? SAM_MODEL,
    producedAt: new Date().toISOString(),
    steps: [],
  };
  for (const { step, observation } of steps) {
    evidence.steps.push(await evidenceForScreenshot(traceDir, outDir, step, observation, req, initialInViewport));
  }
  await writeFile(path.join(outDir, "evidence.json"), JSON.stringify(evidence, null, 2));
  return evidence;
}

function isSide(tag: string, req: EvidenceRequest): boolean {
  return tag === req.acceptTag || tag === req.rejectTag;
}

async function evidenceForScreenshot(
  traceDir: string,
  outDir: string,
  step: number,
  observation: Observation,
  req: EvidenceRequest,
  initialInViewport: Set<string>,
): Promise<StepEvidence> {
  const png = await readFile(path.join(traceDir, observation.screenshot));
  const { width, height } = PNG.sync.read(png);
  const sides = [
    { tag: req.acceptTag, id: 1, fill: ACCEPT_FILL },
    { tag: req.rejectTag, id: 2, fill: REJECT_FILL },
  ];
  const prompted = sides.flatMap((s) => {
    const found = observation.tags.find((t) => t.tag === s.tag);
    const box = found && promptBox(found, width, height);
    return box ? [{ ...s, box }] : [];
  });

  const base: StepEvidence = {
    step,
    screenshot: observation.screenshot,
    controls: sides.map((s) => ({ tag: s.tag, inInitialViewport: initialInViewport.has(s.tag) })),
  };
  if (prompted.length === 0) return base;

  const prompt = buildObjectPrompt({
    size: { width, height },
    objects: prompted.map((p) => ({ id: p.id, prompts: [{ box: p.box }] })),
  });
  const { text, key } = await requestSamOutputText(png, prompt, req.sam);
  const result = await parseSamOutput(text);
  const masks = recordsOfKind(result.records, "mask");
  const boxes = recordsOfKind(result.records, "box");

  const overlays: OverlayMask[] = [];
  for (const p of prompted) {
    const control = base.controls.find((c) => c.tag === p.tag)!;
    const mask = masks.find((m) => m.objectId === String(p.id));
    const box = boxes.find((b) => b.objectId === String(p.id));
    if (!mask) continue;
    const raster = decodeRecordRaster(mask);
    control.objectId = String(p.id);
    control.maskAreaPx = maskFrameArea(mask, raster);
    if (box) control.box = { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
    overlays.push({
      bounds: mask.bounds,
      raster,
      maskWidth: mask.mask.width,
      maskHeight: mask.mask.height,
      fill: p.fill,
    });
  }
  const acceptArea = base.controls.find((c) => c.tag === req.acceptTag)?.maskAreaPx;
  const rejectArea = base.controls.find((c) => c.tag === req.rejectTag)?.maskAreaPx;
  const ratio = prominenceRatio(acceptArea, rejectArea);
  if (ratio !== undefined) base.prominenceRatio = ratio;

  if (overlays.length > 0) {
    const name = `evidence-${step < 0 ? "initial" : `step-${step}`}.png`;
    await writeFile(path.join(outDir, name), renderOverlay(png, overlays));
    base.overlay = name;
  }
  base.imageHash = key;
  return base;
}

export type { EvidenceControl };
