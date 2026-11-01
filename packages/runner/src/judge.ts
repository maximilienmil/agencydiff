/**
 * Model judgement for Audit mode. The model sees only the final screenshot
 * and says whether the Intent looks fulfilled. Results are always labelled
 * modelJudged and are never evidence in a two-Variant Diff.
 */
export async function judgeScreenshot(opts: {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  goal: string;
  png: Buffer;
}): Promise<boolean> {
  const res = await fetch(`${opts.baseUrl ?? "https://api.meta.ai/v1"}/responses`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${opts.apiKey}` },
    body: JSON.stringify({
      model: opts.model ?? "muse-spark-1.3",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `A person using a web app had this intention: "${opts.goal}". Does the attached screenshot of the app's final state show that intention fulfilled? Reply with exactly PASS or FAIL and nothing else.`,
            },
            { type: "input_image", image_url: `data:image/png;base64,${opts.png.toString("base64")}` },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Muse judge ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { output?: { content?: { text?: string }[] }[] };
  const text =
    body.output?.flatMap((o) => o.content ?? []).map((c) => c.text ?? "").join("\n") ?? "";
  if (/\bPASS\b/i.test(text)) return true;
  if (/\bFAIL\b/i.test(text)) return false;
  throw new Error(`Unparseable judge verdict: ${JSON.stringify(text.slice(0, 200))}`);
}
