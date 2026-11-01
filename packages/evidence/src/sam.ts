import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface SamRequestOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  /** Directory for cached responses. Skipped when omitted. */
  cacheDir?: string;
  fetchImpl?: typeof fetch;
}

export interface SamResponse {
  /** Raw SAM output text (one line per frame for an image). */
  text: string;
  /** Hex cache key for this image + prompt + model. */
  key: string;
  cached: boolean;
}

export const SAM_MODEL = "sam-3.1";

export function samCacheKey(image: Buffer, prompt: string, model: string): string {
  return createHash("sha256")
    .update(model, "utf8")
    .update("\0", "utf8")
    .update(prompt, "utf8")
    .update("\0", "utf8")
    .update(image)
    .digest("hex");
}

async function readCache(cacheDir: string, key: string): Promise<string | undefined> {
  try {
    return await readFile(path.join(cacheDir, `${key}.txt`), "utf8");
  } catch {
    return undefined;
  }
}

/** POST one image + box prompt to SAM and accumulate the streamed output text. */
export async function requestSamOutputText(
  imagePng: Buffer,
  prompt: string,
  opts: SamRequestOptions,
): Promise<SamResponse> {
  const model = opts.model ?? SAM_MODEL;
  const baseUrl = opts.baseUrl ?? "https://api.meta.ai/v1";
  const key = samCacheKey(imagePng, prompt, model);
  if (opts.cacheDir) {
    const hit = await readCache(opts.cacheDir, key);
    if (hit !== undefined) return { text: hit, key, cached: true };
  }

  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(`${baseUrl}/responses`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${opts.apiKey}`,
      accept: "text/event-stream",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          type: "message",
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: `data:image/png;base64,${imagePng.toString("base64")}` },
          ],
        },
      ],
      stream: true,
    }),
  });
  if (!res.ok) throw new Error(`SAM ${res.status}: ${await res.text()}`);
  const text = collectOutputText(await res.text());

  if (opts.cacheDir) {
    await mkdir(opts.cacheDir, { recursive: true });
    await writeFile(path.join(opts.cacheDir, `${key}.txt`), text, "utf8");
  }
  return { text, key, cached: false };
}

/** Fold a Responses SSE body into the concatenated output_text deltas. */
export function collectOutputText(sse: string): string {
  const parts: string[] = [];
  for (const line of sse.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const data = line.slice("data: ".length).trim();
    if (!data || data === "[DONE]") continue;
    let event: { type?: string; delta?: string; response?: { error?: { message?: string } }; message?: string };
    try {
      event = JSON.parse(data);
    } catch {
      continue;
    }
    if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
      parts.push(event.delta);
    } else if (event.type === "response.failed") {
      throw new Error(`SAM response failed: ${event.response?.error?.message ?? "unknown"}`);
    } else if (event.type === "error") {
      throw new Error(`SAM stream error: ${event.message ?? "unknown"}`);
    }
  }
  return parts.join("");
}
