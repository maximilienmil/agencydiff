import { countActions, type AgencyReport, type Trace } from "@agencydiff/core";

/** Contributor pricing in USD per million tokens. */
export const PRICE_PER_MTOK_IN = 0.1;
export const PRICE_PER_MTOK_OUT = 0.2;

export function usdForTokens(inputTokens: number, outputTokens: number): number {
  return (inputTokens * PRICE_PER_MTOK_IN + outputTokens * PRICE_PER_MTOK_OUT) / 1e6;
}

export interface GroundTruthEntry {
  seed: string;
  intents: string[];
  direction: "regression" | "none";
  metric: string;
}

export type HitVia = "finding" | "default" | "behavior" | "judge" | "none";

export interface ExpectedHit {
  intent: string;
  metric: string;
  /** Strict hit: a Finding names this intent (or a decision-level default
   *  finding, for default seeds). Trace-difference hits are lenient only. */
  hit: boolean;
  via: HitVia;
}

export interface SeedVerdict {
  seed: string;
  kind: "regression" | "control";
  contracts: string[];
  /** Strict: every expected intent has a Finding on it. */
  detected: boolean;
  /** Lenient: strict, or every expected intent was hit when observable trace
   *  differences count alongside Findings. */
  lenientDetected: boolean;
  falseAlarm: boolean;
  expected: ExpectedHit[];
  missed: string[];
  unexpected: { intentId?: string; kind: string; title: string }[];
  oraclePassRate: Record<string, { baseline: number; candidate: number }>;
}

/** True when the candidate traces for an intent differ observably from the
 *  baseline ones: oracle outcome, final screen, final app state, or effort.
 *  Catches regressions a same-cost replay cannot, e.g. an intent whose
 *  oracle is already satisfied but which now strands the user in a dialog. */
export function tracesDiffer(baseline: Trace[], candidate: Trace[]): boolean {
  if (baseline.length === 0 || candidate.length === 0) return false;
  const sig = (t: Trace) =>
    JSON.stringify({
      oracle: t.oracle.passed,
      screen: t.steps.length ? t.steps[t.steps.length - 1].after.screen : t.initial.observation.screen,
      state: t.final.state,
      actions: countActions(t),
      error: t.error ?? null,
    });
  const b = new Set(baseline.map(sig));
  return candidate.some((t) => !b.has(sig(t)));
}

/** Population variance of action counts across repeats. */
export function actionVariance(traces: Trace[]): number {
  if (traces.length === 0) return 0;
  const xs = traces.map(countActions);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((a, x) => a + (x - mean) ** 2, 0) / xs.length;
}

export function oracleRate(traces: Trace[]): number {
  if (traces.length === 0) return 0;
  return traces.filter((t) => t.oracle.passed === true).length / traces.length;
}

/**
 * Score one seed against ground truth. A regression seed is strictly
 * detected when every expected intent is hit by a Finding that names it, or
 * by a decision-level default finding when the seed is about the default.
 * An observable trace difference without a Finding counts only toward the
 * lenient verdict, reported separately. Findings on other intents are
 * recorded as unexpected but do not fail the seed; the control false-alarm
 * rate is measured on the UI_* seeds only, where any Finding is a false
 * alarm.
 */
export function scoreSeed(opts: {
  seed: string;
  truth: GroundTruthEntry;
  contracts: string[];
  reports: AgencyReport[];
  tracesByIntent: Map<string, { baseline: Trace[]; candidate: Trace[] }>;
}): SeedVerdict {
  const { seed, truth, contracts, reports, tracesByIntent } = opts;
  const findings = reports.flatMap((r) => r.findings);
  const expected: ExpectedHit[] = truth.intents.map((intent) => {
    if (findings.some((f) => f.intentId !== undefined && sameIntent(f.intentId, f.decision, intent))) {
      return { intent, metric: truth.metric, hit: true, via: "finding" as const };
    }
    if (
      truth.metric === "default" &&
      findings.some(
        (f) =>
          f.kind === "default_flip" &&
          truth.intents.some((i) => i === f.decision || i.startsWith(`${f.decision}.`)),
      )
    ) {
      return { intent, metric: truth.metric, hit: true, via: "default" as const };
    }
    const pair = tracesByIntent.get(qualify(intent, contracts[0]));
    if (pair && tracesDiffer(pair.baseline, pair.candidate)) {
      return { intent, metric: truth.metric, hit: false, via: "behavior" as const };
    }
    return { intent, metric: truth.metric, hit: false, via: "none" as const };
  });
  const missed = expected.filter((e) => !e.hit).map((e) => e.intent);
  const expectedSet = new Set(truth.intents.map((i) => qualify(i, contracts[0])));
  const unexpected = findings
    .filter((f) => f.intentId !== undefined && !expectedSet.has(qualify(f.intentId, f.decision)))
    .map((f) => ({ intentId: f.intentId, kind: f.kind, title: f.title }));

  const oraclePassRate: Record<string, { baseline: number; candidate: number }> = {};
  for (const [key, pair] of tracesByIntent) {
    oraclePassRate[key] = { baseline: oracleRate(pair.baseline), candidate: oracleRate(pair.candidate) };
  }

  const isControl = truth.direction === "none";
  const detected = !isControl && missed.length === 0;
  // Lenient: every expected intent is hit once observable trace differences
  // count alongside Findings.
  const lenientDetected = !isControl && expected.every((e) => e.hit || e.via === "behavior");
  const falseAlarm = isControl ? findings.length > 0 : false;
  return { seed, kind: isControl ? "control" : "regression", contracts, detected, lenientDetected, falseAlarm, expected, missed, unexpected, oraclePassRate };
}

export function qualify(intent: string, decision: string): string {
  return intent.includes(".") ? intent : `${decision}.${intent}`;
}

/** True when a Finding's (bare intentId, decision) names a ground-truth intent
 *  (qualified "decision.intent" or bare). */
export function sameIntent(intentId: string, decision: string, truth: string): boolean {
  return qualify(intentId, decision) === qualify(truth, decision);
}

export interface BenchTotals {
  seeds: number;
  regressions: number;
  controls: number;
  detected: number;
  missed: string[];
  falseAlarms: string[];
  recall: number;
  precision: number;
  controlFalseAlarmRate: number;
  /** Regression seeds caught only under the lenient trace-difference rule. */
  lenientOnly: string[];
}

/** Seed-level classification totals: true positives are detected regression
 *  seeds, false positives are flagged control seeds. */
export function summarizeVerdicts(verdicts: SeedVerdict[]): BenchTotals {
  const regressions = verdicts.filter((v) => v.kind === "regression");
  const controls = verdicts.filter((v) => v.kind === "control");
  const detected = regressions.filter((v) => v.detected).length;
  const flaggedControls = controls.filter((v) => v.falseAlarm).map((v) => v.seed);
  const missed = regressions.filter((v) => !v.detected).map((v) => v.seed);
  const lenientOnly = regressions.filter((v) => !v.detected && v.lenientDetected).map((v) => v.seed);
  const tp = detected;
  const fp = flaggedControls.length;
  return {
    seeds: verdicts.length,
    regressions: regressions.length,
    controls: controls.length,
    detected,
    missed,
    falseAlarms: flaggedControls,
    recall: regressions.length ? tp / regressions.length : 0,
    precision: tp + fp ? tp / (tp + fp) : 0,
    controlFalseAlarmRate: controls.length ? fp / controls.length : 0,
    lenientOnly,
  };
}

/** Score judge verdicts (harder/easier/unchanged per intent) for one seed. */
export function scoreJudgeSeed(opts: {
  seed: string;
  truth: GroundTruthEntry;
  contracts: string[];
  verdicts: Record<string, "harder" | "easier" | "unchanged">;
}): SeedVerdict {
  const { seed, truth, contracts, verdicts } = opts;
  const byQualified = new Map(Object.entries(verdicts).map(([k, v]) => [qualify(k, contracts[0]), v]));
  const expected: ExpectedHit[] = truth.intents.map((intent) => {
    const v = byQualified.get(qualify(intent, contracts[0]));
    return v === "harder"
      ? { intent, metric: truth.metric, hit: true, via: "judge" as const }
      : { intent, metric: truth.metric, hit: false, via: "none" as const };
  });
  const expectedSet = new Set(truth.intents.map((i) => qualify(i, contracts[0])));
  const unexpected = [...byQualified.entries()]
    .filter(([k, v]) => v !== "unchanged" && !expectedSet.has(k))
    .map(([k, v]) => ({ intentId: k, kind: `judge:${v}`, title: `Judge rated ${k} ${v}` }));
  const isControl = truth.direction === "none";
  const missed = expected.filter((e) => !e.hit).map((e) => e.intent);
  const detected = !isControl && missed.length === 0;
  return {
    seed,
    kind: isControl ? "control" : "regression",
    contracts,
    detected,
    lenientDetected: detected,
    falseAlarm: isControl && unexpected.length > 0,
    expected,
    missed,
    unexpected,
    oraclePassRate: {},
  };
}
