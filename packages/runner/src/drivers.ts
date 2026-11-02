import type { Action, IntentSpec, TraceStep } from "@agencydiff/core";
import { AUDIT_INSTRUCTIONS } from "./auditGuard.js";
import { PROD_SAFE_INSTRUCTIONS } from "./prodSafe.js";
import { AuditBlockedError, type BrowserEnv } from "./env.js";

export interface DriverResult {
  steps: TraceStep[];
  stoppedReason: "agent_done" | "script_done" | "step_budget" | "satisfied" | "error";
  agentMessage?: string;
  error?: string;
  /** One flag per step, true when the oracle held after that step.
   *  Present only when the run carried an `isSatisfied` hook. */
  satisfiedFlags?: boolean[];
}

/** Per-step hooks a probe can attach to a driver run. */
export interface DriverHooks {
  /** Cheap local check after each step; a true value stops the run early. */
  isSatisfied?: () => Promise<boolean>;
  /** Called with each recorded step as soon as it is observed (live probes). */
  onStep?: (step: TraceStep) => void | Promise<void>;
}

export interface Driver {
  kind: "scripted" | "muse";
  model?: string;
  run(
    intent: IntentSpec,
    env: BrowserEnv,
    t0: number,
    initialPng: Buffer,
    hooks?: DriverHooks,
  ): Promise<DriverResult>;
}

/**
 * Clicks a known reference path of `data-agency` tags. It validates the
 * measurement pipeline without a model, and its paths double as ground truth
 * for the minimum action count of each intent.
 */
export class ScriptedDriver implements Driver {
  kind = "scripted" as const;

  constructor(private path: (intent: IntentSpec) => string[]) {}

  async run(
    intent: IntentSpec,
    env: BrowserEnv,
    t0: number,
    _initialPng?: Buffer,
    hooks?: DriverHooks,
  ): Promise<DriverResult> {
    const steps: TraceStep[] = [];
    const satisfiedFlags: boolean[] = [];
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
      const step: TraceStep = { index: steps.length, tMs: Date.now() - t0, actions: [action], after: observation, note: tag };
      steps.push(step);
      await hooks?.onStep?.(step);
      if (hooks?.isSatisfied) {
        const satisfied = await hooks.isSatisfied();
        satisfiedFlags.push(satisfied);
        if (satisfied) return { steps, stoppedReason: "satisfied", satisfiedFlags };
      }
    }
    return { steps, stoppedReason: "script_done", satisfiedFlags: hooks?.isSatisfied ? satisfiedFlags : undefined };
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

export interface MuseUsage {
  inputTokens: number;
  outputTokens: number;
  calls: number;
}

export interface MuseOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  maxSteps?: number;
  /** Read-only discovery: extra safety instructions, no submits or purchases. */
  audit?: boolean;
  /** Production-safe probing: allow-listed settings only, restores after. */
  prodSafe?: boolean;
  /** When true, a guard refusal becomes a recorded no-op step (the agent sees
   *  the unchanged screen and retries) instead of aborting the probe. Off by
   *  default: ordinary runs stop at the first refusal. */
  tolerateBlocked?: boolean;
  /** Keep only the last N screenshots in the request history. Unset means
   *  server-side chaining (previous_response_id) with full history. */
  historyLimit?: number;
  /** Accumulates API usage across run() calls when provided. */
  usage?: MuseUsage;
}

type OutputItem =
  | {
      type: "computer_call";
      id?: string;
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

  private instructions(): string {
    let extra = "";
    if (this.opts.audit) extra += `\n\n${AUDIT_INSTRUCTIONS}`;
    if (this.opts.prodSafe) extra += `\n\n${PROD_SAFE_INSTRUCTIONS}`;
    return `${SYSTEM_PROMPT}${extra}`;
  }

  private async respond(body: Record<string, unknown>): Promise<{ id: string; output: OutputItem[] }> {
    // Server errors are transient: retry the same request with backoff so
    // one 5xx does not sink the whole probe. Client errors throw at once.
    let lastError = "";
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
      const res = await fetch(`${this.baseUrl}/responses`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.opts.apiKey}` },
        body: JSON.stringify({ model: this.model, tools: [{ type: "computer" }], ...body }),
      });
      if (res.ok) {
        const json = (await res.json()) as {
          id: string;
          output: OutputItem[];
          usage?: { input_tokens?: number; output_tokens?: number };
        };
        if (this.opts.usage && json.usage) {
          this.opts.usage.inputTokens += json.usage.input_tokens ?? 0;
          this.opts.usage.outputTokens += json.usage.output_tokens ?? 0;
          this.opts.usage.calls += 1;
        }
        return json;
      }
      lastError = `Muse ${res.status}: ${await res.text()}`;
      if (res.status < 500 || res.status >= 600) throw new Error(lastError);
    }
    throw new Error(lastError);
  }

  async run(
    intent: IntentSpec,
    env: BrowserEnv,
    t0: number,
    initialPng: Buffer,
    hooks?: DriverHooks,
  ): Promise<DriverResult> {
    if (this.opts.historyLimit !== undefined) {
      return this.runWindowed(intent, env, t0, initialPng, hooks);
    }
    const steps: TraceStep[] = [];
    const satisfiedFlags: boolean[] | undefined = hooks?.isSatisfied ? [] : undefined;
    const dataUrl = (png: Buffer) => `data:image/png;base64,${png.toString("base64")}`;
    try {
      let response = await this.respond({
        instructions: this.instructions(),
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
          return { steps, stoppedReason: "agent_done", agentMessage: text, satisfiedFlags };
        }

        // Targets are local sandboxed test apps, so checks are logged and acknowledged.
        const checks = call.pending_safety_checks ?? [];
        let note = checks.length
          ? `safety checks acknowledged: ${checks.map((c) => c.code).join(", ")}`
          : undefined;
        try {
          await env.execute(call.actions);
        } catch (e) {
          if (!(e instanceof AuditBlockedError) || !this.opts.tolerateBlocked) throw e;
          note = [note, `refused: ${e.message}`].filter(Boolean).join("; ");
        }
        const { observation, png } = await env.observe();
        { const s: TraceStep = { index: steps.length, tMs: Date.now() - t0, actions: call.actions, after: observation, note }; steps.push(s); await hooks?.onStep?.(s); }
        if (hooks?.isSatisfied) {
          const satisfied = await hooks.isSatisfied();
          satisfiedFlags!.push(satisfied);
          if (satisfied) return { steps, stoppedReason: "satisfied", satisfiedFlags };
        }

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
      return { steps, stoppedReason: "step_budget", satisfiedFlags };
    } catch (e) {
      return { steps, stoppedReason: "error", error: String(e), satisfiedFlags };
    }
  }

  /**
   * Computer-use loop with a bounded screenshot window. Turns chain through
   * previous_response_id (the only continuation shape the API accepts), but
   * every `historyLimit` screenshots the chain re-roots: a fresh request with
   * the goal, a compact action summary, and the latest screenshot. Input
   * tokens per call stay flat instead of growing with the probe.
   */
  private async runWindowed(
    intent: IntentSpec,
    env: BrowserEnv,
    t0: number,
    initialPng: Buffer,
    hooks?: DriverHooks,
  ): Promise<DriverResult> {
    const steps: TraceStep[] = [];
    const dataUrl = (png: Buffer) => `data:image/png;base64,${png.toString("base64")}`;
    const keep = Math.max(1, this.opts.historyLimit ?? 3);
    const done: string[] = [];
    let previousId: string | undefined;
    let lastOutput: Record<string, unknown> | undefined;
    let segmentShots = 0;
    let latestPng = initialPng;
    const agentText = (output: OutputItem[]): string =>
      output
        .flatMap((o) => ("content" in o ? o.content : []))
        .map((c) => c.text ?? "")
        .join("\n")
        .trim();
    try {
      for (let i = 0; i < this.maxSteps; i++) {
        const fresh = previousId === undefined;
        const response = fresh
          ? await this.respond({
              instructions: this.instructions(),
              input: [
                {
                  role: "user",
                  content: [
                    {
                      type: "input_text",
                      text:
                        `My intention: ${intent.goal}` +
                        (done.length
                          ? `\nActions taken so far (do not repeat what already worked): ${done.join("; ")}`
                          : ""),
                    },
                    { type: "input_image", image_url: dataUrl(latestPng) },
                  ],
                },
              ],
            })
          : await this.respond({
              previous_response_id: previousId,
              input: [lastOutput!],
            });
        const call = response.output.find((o) => o.type === "computer_call") as
          | Extract<OutputItem, { type: "computer_call" }>
          | undefined;
        if (!call) {
          return { steps, stoppedReason: "agent_done", agentMessage: agentText(response.output) };
        }
        const checks = call.pending_safety_checks ?? [];
        await env.execute(call.actions);
        const { observation, png } = await env.observe();
        { const s: TraceStep = { index: steps.length, tMs: Date.now() - t0, actions: call.actions, after: observation, note: checks.length ? `safety checks acknowledged: ${checks.map((c) => c.code).join(", ")}` : undefined }; steps.push(s); await hooks?.onStep?.(s); }
        for (const a of call.actions) {
          done.push(
            a.type === "click" || a.type === "double_click"
              ? `${a.type} (${a.x},${a.y})`
              : a.type === "type"
                ? `type "${a.text.slice(0, 40)}"`
                : a.type,
          );
        }
        latestPng = png;
        lastOutput = {
          type: "computer_call_output",
          call_id: call.call_id,
          acknowledged_safety_checks: checks,
          output: { type: "computer_screenshot", image_url: dataUrl(png) },
        };
        segmentShots++;
        // Re-root once the segment holds `keep` screenshots so the server
        // never carries more than that many in one chain.
        previousId = segmentShots >= keep ? undefined : response.id;
        if (previousId === undefined) segmentShots = 0;
      }
      return { steps, stoppedReason: "step_budget" };
    } catch (e) {
      return { steps, stoppedReason: "error", error: String(e) };
    }
  }
}
