import { summarizeIntentEvidence } from "./evidence.js";
import { aggregate, countActions, traceMetrics } from "./metrics.js";
import type {
  AgencyContract,
  AgencyReport,
  AuditReport,
  Finding,
  IntentAggregate,
  Severity,
  Trace,
  Variant,
} from "./types.js";

/** Reject-side cost divided by accept-side cost. >1 means saying no is harder. */
function ratio(reject?: number, accept?: number): number | undefined {
  if (reject === undefined || accept === undefined || accept === 0) return undefined;
  return reject / accept;
}

function costSeverity(base: number, cand: number): Severity {
  if (cand - base >= 3 || cand >= base * 2) return "high";
  if (cand - base >= 2) return "medium";
  return "low";
}

/**
 * Compare baseline and candidate traces for one contract. Every number here is
 * computed from recorded traces; nothing is asked of a model.
 */
export function diffContract(contract: AgencyContract, traces: Trace[]): AgencyReport {
  const aggs = new Map<string, IntentAggregate>();
  const k = (intentId: string, v: Variant) => `${intentId}:${v}`;

  for (const intent of contract.intents) {
    for (const variant of ["baseline", "candidate"] as const) {
      const ts = traces.filter((t) => t.intentId === intent.id && t.variant === variant);
      const ms = ts.map((t) => traceMetrics(t, intent, contract.defaultKey));
      aggs.set(k(intent.id, variant), aggregate(intent.id, variant, ms, !!intent.target));
    }
  }

  const findings: Finding[] = [];
  const evidence = (...as: (IntentAggregate | undefined)[]) =>
    as.flatMap((a) => a?.traceIds.map((traceId) => ({ traceId })) ?? []);
  const push = (f: Omit<Finding, "id" | "decision">) =>
    findings.push({ ...f, id: `${contract.decision}/${f.kind}/${f.intentId ?? "pair"}`, decision: contract.decision });

  for (const intent of contract.intents) {
    const b = aggs.get(k(intent.id, "baseline"));
    const c = aggs.get(k(intent.id, "candidate"));
    if (!b || !c || b.runs === 0 || c.runs === 0) continue;

    // Repeated model probes are noisy: one lucky baseline run must not read
    // as a regression. Cost, depth and success changes count only when the
    // runs separate. Single runs and scripted replays keep the old rule.
    const bTs = traces.filter((t) => t.intentId === intent.id && t.variant === "baseline");
    const cTs = traces.filter((t) => t.intentId === intent.id && t.variant === "candidate");
    const noisy =
      bTs.length > 1 &&
      cTs.length > 1 &&
      (bTs[0]?.driver.kind === "muse" || cTs[0]?.driver.kind === "muse");
    const values = (ts: Trace[], pick: (m: { actionCount: number; navigationDepth: number }) => number) =>
      ts
        .map((t) => traceMetrics(t, intent, contract.defaultKey))
        .filter((m) => m.success)
        .map(pick);
    // Separated when every candidate run cost more than every baseline run
    // (or the reverse), with the medians at least 1 apart.
    const separated = (pick: (m: { actionCount: number; navigationDepth: number }) => number) => {
      if (!noisy) return true;
      const bv = values(bTs, pick);
      const cv = values(cTs, pick);
      if (bv.length === 0 || cv.length === 0) return false;
      const [bMed, cMed] = [b, c].map((a) =>
        pick({ actionCount: a.actionCount ?? NaN, navigationDepth: a.navigationDepth ?? NaN }),
      );
      return Math.min(...cv) > Math.max(...bv) && cMed - bMed >= 1;
    };

    // Success-rate verdicts distinguish what the evidence establishes.
    // A reference-path failure (renamed control) and an infrastructure
    // error look like a lower success rate, but neither establishes
    // removal. Only completed runs whose independent oracle still failed
    // count as outcome regressions; the rest stay review-required and
    // still block the gate, under a different kind.
    if (
      intent.mustSucceed &&
      c.successRate < b.successRate &&
      (!noisy || b.successRate - c.successRate >= 2 / 3 - 1e-9)
    ) {
      const bEv = summarizeIntentEvidence(bTs);
      const cEv = summarizeIntentEvidence(cTs);
      const provenance = {
        baselineSuccesses: bEv.successes,
        candidateSuccesses: cEv.successes,
        candidateOutcomeFailures: cEv.outcomeFailures,
        candidateReplayBlocked: cEv.replayBlocked,
        candidateInconclusive: cEv.inconclusive,
      } as const;
      if (cEv.outcomeFailures > 0) {
        push({
          severity: c.successRate === 0 ? "high" : "medium",
          kind: "goal_unreachable",
          intentId: intent.id,
          title: `"${intent.goal}" succeeds less often`,
          baseline: b.successRate,
          candidate: c.successRate,
          evidence: evidence(b, c),
          provenance: { basis: "outcome", ...provenance },
        });
      } else if (cEv.replayBlocked > 0) {
        push({
          severity: "medium",
          kind: "replay_blocked",
          intentId: intent.id,
          title: `"${intent.goal}" needs review: reference path blocked, removal not established`,
          baseline: b.successRate,
          candidate: c.successRate,
          evidence: evidence(b, c),
          provenance: { basis: "replay-path", ...provenance },
        });
      } else if (cEv.inconclusive > 0) {
        push({
          severity: "medium",
          kind: "probe_inconclusive",
          intentId: intent.id,
          title: `"${intent.goal}" needs review: probe error, outcome unknown`,
          baseline: b.successRate,
          candidate: c.successRate,
          evidence: evidence(b, c),
          provenance: { basis: "infrastructure", ...provenance },
        });
      } else {
        // Success-rate drop with no failing candidate trace classified
        // (e.g. mixed drivers where the failing side left no trace):
        // keep the old verdict rather than silently passing.
        push({
          severity: c.successRate === 0 ? "high" : "medium",
          kind: "goal_unreachable",
          intentId: intent.id,
          title: `"${intent.goal}" succeeds less often`,
          baseline: b.successRate,
          candidate: c.successRate,
          evidence: evidence(b, c),
          provenance: { basis: "outcome", ...provenance },
        });
      }
    }
    if (
      b.actionCount !== undefined &&
      c.actionCount !== undefined &&
      c.actionCount > b.actionCount &&
      separated((m) => m.actionCount)
    ) {
      push({
        severity: costSeverity(b.actionCount, c.actionCount),
        kind: "action_cost",
        intentId: intent.id,
        title: `"${intent.goal}" takes more actions`,
        baseline: b.actionCount,
        candidate: c.actionCount,
        evidence: evidence(b, c),
      });
    }
    if (
      b.navigationDepth !== undefined &&
      c.navigationDepth !== undefined &&
      c.navigationDepth > b.navigationDepth &&
      separated((m) => m.navigationDepth)
    ) {
      push({
        severity: "low",
        kind: "navigation_depth",
        intentId: intent.id,
        title: `"${intent.goal}" is buried deeper`,
        baseline: b.navigationDepth,
        candidate: c.navigationDepth,
        evidence: evidence(b, c),
      });
    }
    if (b.initiallyVisible === true && c.initiallyVisible === false) {
      push({
        severity: intent.polarity === "reject" ? "high" : "medium",
        kind: "visibility",
        intentId: intent.id,
        title: `Option for "${intent.goal}" no longer on first screen`,
        baseline: "visible",
        candidate: "hidden",
        evidence: evidence(b, c),
      });
    }
  }

  // Default flips are a property of the decision, read from any run's initial state.
  if (contract.defaultKey) {
    const first = (v: Variant) =>
      contract.intents.map((i) => aggs.get(k(i.id, v))).find((a) => a && a.runs > 0);
    const b = first("baseline");
    const c = first("candidate");
    if (b && c && b.defaultValue !== c.defaultValue) {
      const acceptValues = contract.intents
        .filter((i) => i.polarity === "accept" && i.oracle)
        .map((i) => i.oracle![contract.defaultKey!]);
      push({
        severity: acceptValues.includes(c.defaultValue as never) ? "high" : "medium",
        kind: "default_flip",
        title: `Default for ${contract.decision} changed`,
        baseline: b.defaultValue,
        candidate: c.defaultValue,
        evidence: evidence(b, c),
      });
    }
  }

  const asymmetry = contract.pairs.map((p) => {
    const r = (v: Variant) =>
      ratio(aggs.get(k(p.reject, v))?.actionCount, aggs.get(k(p.accept, v))?.actionCount);
    return { ...p, baseline: r("baseline"), candidate: r("candidate") };
  });
  for (const a of asymmetry) {
    if (a.baseline !== undefined && a.candidate !== undefined && a.candidate > a.baseline) {
      push({
        severity: a.candidate >= 2 ? "high" : "medium",
        kind: "asymmetry",
        title: `Saying no became ${a.candidate.toFixed(1)}x the effort of saying yes`,
        baseline: a.baseline,
        candidate: a.candidate,
        evidence: evidence(
          aggs.get(k(a.reject, "candidate")),
          aggs.get(k(a.accept, "candidate")),
        ),
      });
    }
  }

  return {
    decision: contract.decision,
    promise: contract.promise,
    aggregates: [...aggs.values()],
    asymmetry,
    findings,
    passed: !findings.some((f) => f.severity !== "low"),
  };
}

/**
 * Single-Variant Audit: per-Intent cost plus pair Asymmetry, no baseline and
 * no Findings. Success comes from the oracle (or is model-judged); the gate
 * below never fails the run, it only reports.
 */
export function auditContract(
  contract: AgencyContract,
  variant: Variant,
  url: string,
  traces: Trace[],
  modelJudged: boolean,
): AuditReport {
  const aggs = new Map<string, IntentAggregate>();
  for (const intent of contract.intents) {
    const ts = traces.filter((t) => t.intentId === intent.id);
    const ms = ts.map((t) => traceMetrics(t, intent, contract.defaultKey));
    aggs.set(intent.id, aggregate(intent.id, variant, ms, !!intent.target));
  }
  const asymmetry = contract.pairs.map((p) => ({
    ...p,
    ratio: ratio(aggs.get(p.reject)?.actionCount, aggs.get(p.accept)?.actionCount),
  }));
  return {
    decision: contract.decision,
    promise: contract.promise,
    variant,
    target: url,
    aggregates: [...aggs.values()],
    asymmetry,
    traceIds: traces.map((t) => t.id),
    modelJudged,
    cost: {
      totalActions: traces.reduce((n, t) => n + countActions(t), 0),
      totalSteps: traces.reduce((n, t) => n + t.steps.length, 0),
      traces: traces.length,
    },
  };
}
