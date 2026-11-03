/** Finding rule for the external-app pilot (pure; DOM-free, unit-tested). */

export interface ProbeRun {
  variant: string;
  decision: string;
  rep: number;
  taps: number;
  oraclePass: boolean;
  detail?: string;
}

export type FindingKind =
  | "goal_unreachable"
  | "action_cost"
  | "navigation_depth"
  | "visibility";

export interface Finding {
  decision: string;
  kind: FindingKind;
  baseline: string;
  candidate: string;
}

export interface NoFinding {
  finding: null;
  reason: "equal" | "improvement" | "baseline-broken";
  detail: string;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Deterministic mode (smoke showed zero run-to-run variance): baseline all
 * pass with identical taps. Any candidate oracle failure is
 * goal_unreachable; any tap increase >= 1 with oracles passing is
 * action_cost; tap decreases are improvements, never findings.
 */
export function decideDeterministic(
  baseline: ProbeRun[],
  candidate: ProbeRun[],
): Finding | NoFinding {
  if (baseline.length === 0 || candidate.length === 0) {
    return { finding: null, reason: "baseline-broken", detail: "empty run set" };
  }
  const decision = candidate[0].decision;
  if (baseline.some((r) => !r.oraclePass)) {
    return { finding: null, reason: "baseline-broken", detail: "baseline oracle failed" };
  }
  const baseTaps = baseline[0].taps;
  if (!baseline.every((r) => r.taps === baseTaps)) {
    return {
      finding: null,
      reason: "baseline-broken",
      detail: "baseline taps vary; use noisy mode",
    };
  }
  if (!candidate.every((r) => r.taps === candidate[0].taps)) {
    return {
      finding: null,
      reason: "baseline-broken",
      detail: "candidate taps vary; use noisy mode",
    };
  }
  if (candidate.some((r) => !r.oraclePass)) {
    return { decision, kind: "goal_unreachable", baseline: "pass", candidate: "fail" };
  }
  const delta = candidate[0].taps - baseTaps;
  if (delta >= 1) {
    return { decision, kind: "action_cost", baseline: `${baseTaps}`, candidate: `${candidate[0].taps}` };
  }
  if (delta < 0) {
    return {
      finding: null,
      reason: "improvement",
      detail: `taps ${baseTaps} -> ${candidate[0].taps}`,
    };
  }
  return { finding: null, reason: "equal", detail: `taps ${baseTaps} both sides` };
}

/**
 * Noisy mode (separated-ranges rule, mirrors eval/RESULTS.md): a cost
 * finding needs candidate min above baseline max with median diff >= 1; a
 * success finding needs >= 2/3 of runs flipping pass -> fail.
 */
export function decideNoisy(baseline: ProbeRun[], candidate: ProbeRun[]): Finding | NoFinding {
  if (baseline.length === 0 || candidate.length === 0) {
    return { finding: null, reason: "baseline-broken", detail: "empty run set" };
  }
  const decision = candidate[0].decision;
  const baseTaps = baseline.map((r) => r.taps).sort((a, b) => a - b);
  const candTaps = candidate.map((r) => r.taps).sort((a, b) => a - b);
  const basePass = baseline.filter((r) => r.oraclePass).length / baseline.length;
  const candFail = candidate.filter((r) => !r.oraclePass).length / candidate.length;
  if (basePass === 1 && candFail >= 2 / 3) {
    return { decision, kind: "goal_unreachable", baseline: "pass", candidate: "fail" };
  }
  const delta = median(candTaps) - median(baseTaps);
  if (candTaps[0] > baseTaps[baseTaps.length - 1] && delta >= 1) {
    return {
      decision,
      kind: "action_cost",
      baseline: `median ${median(baseTaps)}`,
      candidate: `median ${median(candTaps)}`,
    };
  }
  if (delta < 0 && candTaps[candTaps.length - 1] < baseTaps[0]) {
    return {
      finding: null,
      reason: "improvement",
      detail: `median ${median(baseTaps)} -> ${median(candTaps)}`,
    };
  }
  return { finding: null, reason: "equal", detail: "ranges overlap" };
}
