import type {
  Action,
  IntentAggregate,
  IntentSpec,
  Trace,
  TraceMetrics,
  TraceStep,
  Variant,
} from "./types.js";

/** Actions that cost the user effort. Waits, moves and screenshots are free. */
const EFFORTFUL: ReadonlySet<Action["type"]> = new Set([
  "click",
  "double_click",
  "drag",
  "keypress",
  "scroll",
  "type",
]);

function effortfulIn(steps: Pick<TraceStep, "actions">[]): number {
  return steps.reduce(
    (n, s) => n + s.actions.filter((a) => EFFORTFUL.has(a.type)).length,
    0,
  );
}

export function countActions(trace: Trace): number {
  return effortfulIn(trace.steps);
}

/** Where the dom oracle stood over one probe: whether it held on the
 *  initial observation, after which steps it held, and whether the final
 *  state satisfies it. Steps elapsed count the initial observation as 0. */
export interface SatisfactionInput {
  initialSatisfied: boolean;
  satisfiedFlags: boolean[];
  finalPassed: boolean;
}

/** First step at which the oracle held, and the effortful actions up to
 *  that point: the audit cost of the Intent. Empty when it never held. */
export function firstSatisfaction(
  steps: Pick<TraceStep, "actions">[],
  s: SatisfactionInput,
): { firstSatisfiedStep?: number; actionsToSatisfy?: number } {
  if (s.initialSatisfied) return { firstSatisfiedStep: 0, actionsToSatisfy: 0 };
  const at = s.satisfiedFlags.findIndex(Boolean);
  if (at !== -1) {
    return { firstSatisfiedStep: at + 1, actionsToSatisfy: effortfulIn(steps.slice(0, at + 1)) };
  }
  if (s.finalPassed) {
    return { firstSatisfiedStep: steps.length, actionsToSatisfy: effortfulIn(steps) };
  }
  return {};
}

/** Number of distinct screens entered after the initial one. Falls back to URL
 *  when the app does not label screens. */
export function navigationDepth(trace: Trace): number {
  const key = (o: { screen?: string; url: string }) => o.screen ?? o.url;
  const start = key(trace.initial.observation);
  const seen = new Set<string>();
  for (const s of trace.steps) {
    const k = key(s.after);
    if (k !== start) seen.add(k);
  }
  return seen.size;
}

export function discoveryStep(trace: Trace, target?: string): number | undefined {
  if (!target) return undefined;
  const visible = (tags: Trace["initial"]["observation"]["tags"]) =>
    tags.some((t) => t.tag === target && t.inViewport);
  if (visible(trace.initial.observation.tags)) return 0;
  const hit = trace.steps.find((s) => visible(s.after.tags));
  return hit ? hit.index + 1 : undefined;
}

export function traceMetrics(
  trace: Trace,
  intent: IntentSpec,
  defaultKey?: string,
): TraceMetrics {
  const graded = trace.oracle.checked;
  return {
    traceId: trace.id,
    successGrade: graded ? "oracle" : "agent",
    success: graded ? trace.oracle.passed === true : trace.stoppedReason === "agent_done",
    actionCount: countActions(trace),
    actionsToSatisfy: trace.actionsToSatisfy,
    navigationDepth: navigationDepth(trace),
    discoveryStep: discoveryStep(trace, intent.target),
    defaultValue: defaultKey ? trace.initial.state?.[defaultKey] : undefined,
  };
}

export function median(xs: number[]): number | undefined {
  if (xs.length === 0) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function aggregate(
  intentId: string,
  variant: Variant,
  metrics: TraceMetrics[],
  hasTarget = false,
): IntentAggregate {
  const ok = metrics.filter((m) => m.success);
  const toFact = ok.map((m) => m.actionsToSatisfy).filter((v) => v !== undefined);
  return {
    intentId,
    variant,
    runs: metrics.length,
    successRate: metrics.length ? ok.length / metrics.length : 0,
    actionCount: median(ok.map((m) => m.actionCount)),
    actionsToSatisfy: median(toFact),
    navigationDepth: median(ok.map((m) => m.navigationDepth)),
    // Visible on the first screen in a majority of runs.
    initiallyVisible: hasTarget
      ? metrics.filter((m) => m.discoveryStep === 0).length * 2 > metrics.length
      : undefined,
    defaultValue: metrics[0]?.defaultValue,
    traceIds: metrics.map((m) => m.traceId),
  };
}

export function checkOracle(
  oracle: IntentSpec["oracle"],
  state?: Record<string, unknown>,
): boolean | undefined {
  if (!oracle || !state) return undefined;
  return Object.entries(oracle).every(([k, v]) => state[k] === v);
}
