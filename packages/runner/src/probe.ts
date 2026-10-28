import { writeFile } from "node:fs/promises";
import path from "node:path";
import { checkOracle, type AgencyContract, type IntentSpec, type Trace, type Variant } from "@agencydiff/core";
import type { Driver } from "./drivers.js";
import { BrowserEnv } from "./env.js";

export interface ProbeTarget {
  baseline: string;
  candidate: string;
}

function withFixture(url: string, fixture?: string): string {
  if (!fixture) return url;
  const u = new URL(url);
  u.searchParams.set("fixture", fixture);
  return u.toString();
}

/** Run one intent against one variant from a fresh browser, and save its trace. */
export async function runProbe(opts: {
  contract: AgencyContract;
  intent: IntentSpec;
  variant: Variant;
  repeat: number;
  target: ProbeTarget;
  driver: Driver;
  outDir: string;
}): Promise<Trace> {
  const { contract, intent, variant, repeat, driver } = opts;
  const id = `${contract.decision}.${intent.id}.${variant}.${repeat}`;
  const dir = path.join(opts.outDir, id);
  const env = await BrowserEnv.open(withFixture(opts.target[variant], intent.fixture), dir);
  const t0 = Date.now();
  try {
    const initialState = await env.state();
    const initial = await env.observe();
    const result = await driver.run(intent, env, t0, initial.png);
    const finalState = await env.state();
    const passed = checkOracle(intent.oracle, finalState);

    const trace: Trace = {
      id,
      decision: contract.decision,
      intentId: intent.id,
      variant,
      repeat,
      driver: { kind: driver.kind, model: driver.model },
      startedAt: new Date(t0).toISOString(),
      initial: { state: initialState, observation: initial.observation },
      steps: result.steps,
      final: { state: finalState, agentMessage: result.agentMessage },
      oracle: { checked: passed !== undefined, passed },
      stoppedReason: result.stoppedReason,
      error: result.error,
    };
    await writeFile(path.join(dir, "trace.json"), JSON.stringify(trace, null, 2));
    return trace;
  } finally {
    await env.close();
  }
}
