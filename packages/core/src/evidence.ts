// Evidence semantics: distinguish a failed reference replay or an
// infrastructure error from an independently established outcome.
// Never silently turns unknown into pass: unknown stays review-required
// (a blocking finding of a different kind), never success.

import type { Trace } from "./types.js";

/** Per-trace outcome classification from error provenance + oracle state. */
export type TraceOutcome =
  | "success"
  | "outcome_failure"
  | "replay_blocked"
  | "inconclusive";

/** Reference-path failure signatures: the driver could not replay a named
 *  control. Matches the shipped ScriptedDriver ("reference tag not found")
 *  and the ntfy core adapter ("Unsubscribe menuitem absent",
 *  "mute menuitem absent"), plus generic Playwright waits for a named
 *  control/selector. Deliberately narrow: bare timeouts without a named
 *  control are infrastructure, not path evidence. */
const PATH_PATTERNS: RegExp[] = [
  /reference tag not found/i,
  /menuitems? absent/i,
  /menu items? absent/i,
  /\bcontrol\b.{0,40}\b(absent|not found|missing)\b/i,
  /\btag\b.{0,40}\b(absent|not found|missing)\b/i,
  /\bselector\b.{0,60}\b(absent|not found|missing)\b/i,
  /\blocator\b.{0,60}\b(absent|not found|missing)\b/i,
  /waiting for.{0,80}(getbyrole|locator|selector|menuitem)/i,
];

const INFRA_PATTERNS: RegExp[] = [
  /timeout|timed out/i,
  /browser.{0,40}(closed|crashed|disconnected)/i,
  /page.{0,40}(closed|crashed)/i,
  /\bnet::/i,
  /\bERR_/i,
  /\b429\b|rate.limit/i,
  /protocol error/i,
  /connection (reset|refused|aborted)/i,
  /scripted driver needs a browser env/i,
];

export function isReferencePathError(error?: string): boolean {
  if (!error) return false;
  return PATH_PATTERNS.some((re) => re.test(error));
}

export function isInfrastructureError(error?: string): boolean {
  if (!error) return false;
  return INFRA_PATTERNS.some((re) => re.test(error));
}

/**
 * Classify one trace from its own error provenance and oracle state.
 * - oracle checked + passed => success (even when the driver errored
 *   afterwards; the independent final state establishes the outcome).
 * - oracle checked + failed + reference-path error => replay_blocked
 *   (a rename and a removal look identical here; removal is NOT established).
 * - oracle checked + failed + completed run (no error stop) => outcome_failure
 *   (the driver finished its path and the independent state still failed).
 * - oracle checked + failed + non-path error stop => inconclusive
 *   (infrastructure or unknown; must not read as removal).
 * - oracle unchecked + agent_done (black-box targets) => success (preserved
 *   backcompat; agent claim is the only signal those targets have).
 * - oracle unchecked otherwise => inconclusive, or replay_blocked when the
 *   error names a reference control.
 */
export function traceOutcome(trace: Trace): TraceOutcome {
  const { checked, passed } = trace.oracle;
  if (checked && passed === true) return "success";
  if (checked && passed === false) {
    if (isReferencePathError(trace.error)) return "replay_blocked";
    if (trace.stoppedReason === "error") return "inconclusive";
    return "outcome_failure";
  }
  // Oracle unchecked: no independent final state.
  if (trace.stoppedReason === "agent_done") return "success";
  if (isReferencePathError(trace.error)) return "replay_blocked";
  return "inconclusive";
}

/** Per-variant counts for one intent, from trace-level outcomes. */
export interface IntentEvidence {
  successes: number;
  outcomeFailures: number;
  replayBlocked: number;
  inconclusive: number;
  total: number;
}

export function summarizeIntentEvidence(traces: Trace[]): IntentEvidence {
  const out: IntentEvidence = {
    successes: 0,
    outcomeFailures: 0,
    replayBlocked: 0,
    inconclusive: 0,
    total: traces.length,
  };
  for (const t of traces) {
    switch (traceOutcome(t)) {
      case "success": out.successes++; break;
      case "outcome_failure": out.outcomeFailures++; break;
      case "replay_blocked": out.replayBlocked++; break;
      case "inconclusive": out.inconclusive++; break;
    }
  }
  return out;
}

/**
 * Evidence-based rediscovery comparison: does an independently collected
 * set of traces (a Muse probe searching freely, or a second scripted
 * path with different labels) establish that the intent is still reachable
 * on the candidate, and at what cost? Uses ONLY oracle-checked successes
 * and effortful action counts: no label-substring guesses, no model claims
 * (oracle-unchecked agent_done traces never count as reachable here).
 */
export interface RediscoveryAssessment {
  /** True when at least one oracle-checked success exists. */
  reachable: boolean;
  verifiedSuccesses: number;
  /** Median effortful actions over verified successes, when reachable. */
  medianActions?: number;
  traceIds: string[];
}

function effortfulActions(trace: Trace): number {
  const effortful = new Set(["click", "double_click", "drag", "keypress", "scroll", "type"]);
  return trace.steps.reduce(
    (n, s) => n + s.actions.filter((a) => effortful.has(a.type)).length,
    0,
  );
}

function median(xs: number[]): number | undefined {
  if (xs.length === 0) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1]! + s[m]!) / 2;
}

export function assessRediscovery(independentTraces: Trace[]): RediscoveryAssessment {
  const verified = independentTraces.filter(
    (t) => t.oracle.checked && t.oracle.passed === true,
  );
  return {
    reachable: verified.length > 0,
    verifiedSuccesses: verified.length,
    medianActions: median(verified.map(effortfulActions)),
    traceIds: verified.map((t) => t.id),
  };
}

/**
 * Compare a baseline cost against an independently rediscovered candidate
 * path. Both sides use only oracle-checked successes. Returns the cost
 * delta (positive = rediscovered path costs more) or undefined when
 * either side has no verified success.
 */
export function compareReachableCost(
  baselineTraces: Trace[],
  rediscoveryTraces: Trace[],
): { reachable: boolean; baselineCost?: number; rediscoveryCost?: number; delta?: number } {
  const b = assessRediscovery(baselineTraces);
  const r = assessRediscovery(rediscoveryTraces);
  if (!b.reachable || !r.reachable) {
    return { reachable: r.reachable, baselineCost: b.medianActions, rediscoveryCost: r.medianActions };
  }
  return {
    reachable: true,
    baselineCost: b.medianActions,
    rediscoveryCost: r.medianActions,
    delta:
      b.medianActions !== undefined && r.medianActions !== undefined
        ? r.medianActions - b.medianActions
        : undefined,
  };
}
