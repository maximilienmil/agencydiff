import type { Action, IntentSpec, TraceStep } from "@agencydiff/core";
import type { BrowserEnv } from "./env.js";

export interface DriverResult {
  steps: TraceStep[];
  stoppedReason: "agent_done" | "script_done" | "step_budget" | "error";
  agentMessage?: string;
  error?: string;
}

export interface Driver {
  kind: "scripted" | "muse";
  model?: string;
  run(intent: IntentSpec, env: BrowserEnv, t0: number, initialPng: Buffer): Promise<DriverResult>;
}

/**
 * Clicks a known reference path of `data-agency` tags. It validates the
 * measurement pipeline without a model, and its paths double as ground truth
 * for the minimum action count of each intent.
 */
export class ScriptedDriver implements Driver {
  kind = "scripted" as const;

  constructor(private path: (intent: IntentSpec) => string[]) {}

  async run(intent: IntentSpec, env: BrowserEnv, t0: number): Promise<DriverResult> {
    const steps: TraceStep[] = [];
    for (const tag of this.path(intent)) {
      // A control a regression removed never appears: record it as an error
      // trace (which the diff reports as goal_unreachable) instead of throwing.
      const box = await env.page
        .locator(`[data-agency="${tag}"]`)
        .first()
        .boundingBox({ timeout: 5000 })
        .catch(() => null);
      if (!box) {
        return { steps, stoppedReason: "error", error: `reference tag not found: ${tag}` };
      }
      const action: Action = {
        type: "click",
        x: Math.round(box.x + box.width / 2),
        y: Math.round(box.y + box.height / 2),
      };
      await env.execute([action]);
      const { observation } = await env.observe();
      steps.push({ index: steps.length, tMs: Date.now() - t0, actions: [action], after: observation, note: tag });
    }
    return { steps, stoppedReason: "script_done" };
  }
}

const SYSTEM_PROMPT = `You are a computer-use agent operating a mobile web app in a browser. You receive
screenshots and choose the next action or actions.

Coordinates are pixels in the screenshot you were last shown: (0, 0) is the top-left. Click
the center of the target element.

You are acting on behalf of a user who has one specific intention. Carry out exactly that
intention, using only what is visible on screen. Do not change anything unrelated to it.

Return a short batch of actions only when they do not depend on intermediate visual
feedback. Do not batch across screen transitions or dialogs.

Finish by replying with a normal message that starts with DONE: when the intention is visibly
fulfilled, or INFEASIBLE: when it cannot be done from the available UI.

Do not guess hidden UI state and do not claim completion unless the screenshot supports it.`;

interface MuseOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  maxSteps?: number;
}

type OutputItem =
  | {
      type: "computer_call";
      call_id: string;
      actions: Action[];
      pending_safety_checks?: { id: string; code: string; message: string }[];
    }
  | { type: "message"; content: { type: string; text?: string }[] }
  | { type: string };

/**
 * Muse computer-use loop over the Responses API (native `computer` tool).
 * The agent sees only screenshots; it is a standardized probe, not a simulated user.
 */
export class MuseDriver implements Driver {
  kind = "muse" as const;
  readonly model: string;
  private baseUrl: string;
  private maxSteps: number;

  constructor(private opts: MuseOptions) {
    this.model = opts.model ?? "muse-spark-1.3";
    this.baseUrl = opts.baseUrl ?? "https://api.meta.ai/v1";
    this.maxSteps = opts.maxSteps ?? 20;
  }

  private async respond(body: Record<string, unknown>): Promise<{ id: string; output: OutputItem[] }> {
    const res = await fetch(`${this.baseUrl}/responses`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.opts.apiKey}` },
      body: JSON.stringify({ model: this.model, tools: [{ type: "computer" }], ...body }),
    });
    if (!res.ok) throw new Error(`Muse ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async run(intent: IntentSpec, env: BrowserEnv, t0: number, initialPng: Buffer): Promise<DriverResult> {
    const steps: TraceStep[] = [];
    const dataUrl = (png: Buffer) => `data:image/png;base64,${png.toString("base64")}`;
    try {
      let response = await this.respond({
        instructions: SYSTEM_PROMPT,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: `My intention: ${intent.goal}` },
              { type: "input_image", image_url: dataUrl(initialPng) },
            ],
          },
        ],
      });

      for (let i = 0; i < this.maxSteps; i++) {
        const call = response.output.find((o) => o.type === "computer_call") as
          | Extract<OutputItem, { type: "computer_call" }>
          | undefined;
        if (!call) {
          const text = response.output
            .flatMap((o) => ("content" in o ? o.content : []))
            .map((c) => c.text ?? "")
            .join("\n")
            .trim();
          return { steps, stoppedReason: "agent_done", agentMessage: text };
        }

        // Targets are local sandboxed test apps, so checks are logged and acknowledged.
        const checks = call.pending_safety_checks ?? [];
        await env.execute(call.actions);
        const { observation, png } = await env.observe();
        steps.push({
          index: steps.length,
          tMs: Date.now() - t0,
          actions: call.actions,
          after: observation,
          note: checks.length ? `safety checks acknowledged: ${checks.map((c) => c.code).join(", ")}` : undefined,
        });

        response = await this.respond({
          previous_response_id: response.id,
          input: [
            {
              type: "computer_call_output",
              call_id: call.call_id,
              acknowledged_safety_checks: checks,
              output: { type: "computer_screenshot", image_url: dataUrl(png) },
            },
          ],
        });
      }
      return { steps, stoppedReason: "step_budget" };
    } catch (e) {
      return { steps, stoppedReason: "error", error: String(e) };
    }
  }
}
