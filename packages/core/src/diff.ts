import { aggregate, traceMetrics } from "./metrics.js";
import type {
  AgencyContract,
  AgencyReport,
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

    if (intent.mustSucceed && c.successRate < b.successRate) {
      push({
        severity: c.successRate === 0 ? "high" : "medium",
        kind: "goal_unreachable",
        intentId: intent.id,
        title: `"${intent.goal}" succeeds less often`,
        baseline: b.successRate,
        candidate: c.successRate,
        evidence: evidence(b, c),
      });
    }
    if (b.actionCount !== undefined && c.actionCount !== undefined && c.actionCount > b.actionCount) {
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
      c.navigationDepth > b.navigationDepth
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
