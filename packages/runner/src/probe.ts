import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  checkDomAssertions,
  checkOracle,
  firstSatisfaction,
  type AgencyContract,
  type DomAssertion,
  type IntentSpec,
  type OracleAdapter,
  type Trace,
  type Variant,
} from "@agencydiff/core";
import type { Driver } from "./drivers.js";
import { AuditBlockedError, BrowserEnv } from "./env.js";
import {
  ANDROID_STATE_PORT,
  adbRunner,
  androidActivityFor,
  ensureStateForward,
  launchAndroidApp,
  MobileEnv,
} from "./mobile.js";

export interface ProbeTarget {
  baseline: string;
  candidate: string;
  /** "web" (default) opens a browser; "android" drives the native build. */
  platform?: "web" | "android";
  /** adb serial for `adb -s`. Defaults to the single attached device. */
  serial?: string;
  /** Host-side URL of the app's state endpoint (needs `adb forward`). */
  stateUrl?: string;
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

/** Every selector an oracle reads, descending into anyOf disjunctions. */
export function oracleSelectors(assertions: DomAssertion[] | undefined): string[] {
  const out: string[] = [];
  const walk = (list: DomAssertion[] | undefined) => {
    for (const a of list ?? []) {
      if (a.kind === "anyOf") walk(a.assertions);
      else out.push(a.selector);
    }
  };
  walk(assertions);
  return [...new Set(out)];
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
  const android = opts.target.platform === "android";
  if (android && adapter === "dom") {
    throw new Error("android probes need the state-hook oracle (no DOM on device)");
  }
  let env: BrowserEnv | MobileEnv;
  if (android) {
    const run = adbRunner(opts.target.serial);
    await ensureStateForward(run);
    await launchAndroidApp(run, {
      activity: androidActivityFor(contract.decision),
      variant,
      fixture: intent.fixture,
    });
    env = await MobileEnv.open(dir, {
      serial: opts.target.serial,
      stateUrl: opts.target.stateUrl ?? `http://127.0.0.1:${ANDROID_STATE_PORT}/`,
      run,
    });
  } else {
    env = await BrowserEnv.open(withFixture(opts.target[variant], intent.fixture), dir, {
      audit: opts.oracle?.audit,
    });
  }
  const t0 = Date.now();
  try {
    const initialState = await env.state();
    const initial = await env.observe();
    // The dom oracle is cheap local DOM, so evaluate it after every step
    // and stop the probe once the needed fact is on screen. The recorded
    // cost is actions until that point, not the step budget.
    const domSelectors = adapter === "dom" ? oracleSelectors(intent.domOracle) : [];
    // Android rejects the dom adapter above, so this cast is unreachable there.
    const browser = env as BrowserEnv;
    const isSatisfied =
      adapter === "dom"
        ? async () => checkDomAssertions(intent.domOracle, await browser.collectDomFacts(domSelectors)) === true
        : undefined;
    const initialSatisfied = isSatisfied ? await isSatisfied() : false;
    const result = initialSatisfied
      ? { steps: [], stoppedReason: "satisfied" as const, satisfiedFlags: [] as boolean[] }
      : await driver.run(intent, env, t0, initial.png, isSatisfied ? { isSatisfied } : undefined);
    const finalState = await env.state();

    let passed: boolean | undefined;
    let modelJudged: true | undefined;
    if (adapter === "state-hook") {
      passed = checkOracle(intent.oracle, finalState);
    } else if (adapter === "dom") {
      const facts = await browser.collectDomFacts(domSelectors);
      passed = checkDomAssertions(intent.domOracle, facts);
    } else {
      if (!opts.oracle?.judge) throw new Error("model-judged oracle needs opts.oracle.judge");
      const { png } = await env.screenshot();
      passed = await opts.oracle.judge(png);
      modelJudged = true;
    }

    const satisfaction =
      adapter === "dom"
        ? firstSatisfaction(result.steps, {
            initialSatisfied,
            satisfiedFlags: result.satisfiedFlags ?? [],
            finalPassed: passed === true,
          })
        : {};
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
      ...satisfaction,
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
