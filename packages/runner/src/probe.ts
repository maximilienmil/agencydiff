import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  checkDomAssertions,
  checkOracle,
  type AgencyContract,
  type IntentSpec,
  type OracleAdapter,
  type Trace,
  type Variant,
} from "@agencydiff/core";
import type { Driver } from "./drivers.js";
import { AuditBlockedError, BrowserEnv } from "./env.js";

export interface ProbeTarget {
  baseline: string;
  candidate: string;
}

export interface ProbeOracle {
  /** Defaults to "state-hook" (Circle behaviour). "model-judged" needs audit. */
  adapter?: OracleAdapter;
  /** Called with the final screenshot when the adapter is "model-judged". */
  judge?: (png: Buffer) => Promise<boolean>;
  /** Read-only discovery: the env refuses submits, credentials and purchases. */
  audit?: boolean;
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
  oracle?: ProbeOracle;
}): Promise<Trace> {
  const { contract, intent, variant, repeat, driver } = opts;
  const adapter = opts.oracle?.adapter ?? "state-hook";
  if (adapter === "model-judged" && !opts.oracle?.audit) {
    throw new Error('model-judged oracle is allowed only in Audit mode (opts.oracle.audit)');
  }
  const id = `${contract.decision}.${intent.id}.${variant}.${repeat}`;
  const dir = path.join(opts.outDir, id);
  const env = await BrowserEnv.open(withFixture(opts.target[variant], intent.fixture), dir, {
    audit: opts.oracle?.audit,
  });
  const t0 = Date.now();
  try {
    const initialState = await env.state();
    const initial = await env.observe();
    const result = await driver.run(intent, env, t0, initial.png);
    const finalState = await env.state();

    let passed: boolean | undefined;
    let modelJudged: true | undefined;
    if (adapter === "state-hook") {
      passed = checkOracle(intent.oracle, finalState);
    } else if (adapter === "dom") {
      const selectors = [...new Set((intent.domOracle ?? []).map((a) => a.selector))];
      const facts = await env.collectDomFacts(selectors);
      passed = checkDomAssertions(intent.domOracle, facts);
    } else {
      if (!opts.oracle?.judge) throw new Error("model-judged oracle needs opts.oracle.judge");
      const { png } = await env.screenshot();
      passed = await opts.oracle.judge(png);
      modelJudged = true;
    }

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
    if (modelJudged) trace.modelJudged = true;
    await writeFile(path.join(dir, "trace.json"), JSON.stringify(trace, null, 2));
    return trace;
  } catch (e) {
    if (e instanceof AuditBlockedError) {
      const trace: Trace = {
        id,
        decision: contract.decision,
        intentId: intent.id,
        variant,
        repeat,
        driver: { kind: driver.kind, model: driver.model },
        startedAt: new Date(t0).toISOString(),
        initial: { state: undefined, observation: { url: "", tags: [], screenshot: "" } },
        steps: [],
        final: {},
        oracle: { checked: false },
        stoppedReason: "error",
        error: e.message,
      };
      await writeFile(path.join(dir, "trace.json"), JSON.stringify(trace, null, 2));
      return trace;
    }
    throw e;
  } finally {
    await env.close();
  }
}
