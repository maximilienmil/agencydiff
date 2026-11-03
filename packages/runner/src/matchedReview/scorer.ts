import { sameIntent } from "../benchScore.js";
import type { AgencyReport, Trace } from "@agencydiff/core";
import type { MatchedCase } from "./cases.js";
import type { ReviewResult, ReviewVerdict } from "./reviewer.js";
import { majorityVerdict } from "./reviewer.js";

export interface ExpectedEntry {
  intent: string;
  metric: string;
}

export interface MethodScore {
  hits: string[];
  misses: string[];
  uncertain: string[];
  /** Qualified intent ids (or "@decision/<kind>" for decision-level findings) flagged worse but not expected. */
  falseFlags: string[];
  recall: number;
  precision: number;
}

/** Comparator hit: a Finding naming the expected intent, or (for default-metric
 *  expectations) a decision-level default_flip on the same decision. */
export function scoreComparator(report: AgencyReport, c: MatchedCase, expected: ExpectedEntry[]): MethodScore {
  const hits: string[] = [];
  const misses: string[] = [];
  for (const e of expected) {
    const named = report.findings.some(
      (f) => f.intentId !== undefined && sameIntent(f.intentId, f.decision, e.intent),
    );
    const viaDefault =
      e.metric === "default" &&
      report.findings.some((f) => f.decision === c.decision && f.kind === "default_flip");
    if (named || viaDefault) hits.push(e.intent);
    else misses.push(e.intent);
  }
  const expectedSet = new Set(expected.map((e) => e.intent));
  const falseFlags = report.findings
    .filter((f) => f.decision === c.decision)
    .filter((f) => (f.intentId === undefined ? !expected.some((e) => e.metric === "default" && f.kind === "default_flip") : !expectedSet.has(`${f.decision}.${f.intentId}`) && !expectedSet.has(f.intentId)))
    .map((f) => (f.intentId === undefined ? `@${f.decision}/${f.kind}` : `${f.decision}.${f.intentId}:${f.kind}`));
  const denom = hits.length + falseFlags.length;
  return {
    hits,
    misses,
    uncertain: [],
    falseFlags,
    recall: expected.length ? hits.length / expected.length : NaN,
    precision: denom ? hits.length / denom : expected.length ? 1 : NaN,
  };
}

/** Reviewer hit: majority verdict "harder" on the expected intent. */
export function scoreReviewer(repeats: ReviewResult[], c: MatchedCase, expected: ExpectedEntry[]): { score: MethodScore; majority: Record<string, ReviewVerdict> } {
  const intents = [...new Set([...expected.map((e) => e.intent), ...repeats.flatMap((r) => Object.keys(r.verdicts))])];
  const majority: Record<string, ReviewVerdict> = {};
  for (const intent of intents) {
    majority[intent] = majorityVerdict(repeats.map((r) => r.verdicts[intent] ?? "uncertain"));
  }
  const hits: string[] = [];
  const misses: string[] = [];
  const uncertain: string[] = [];
  for (const e of expected) {
    if (majority[e.intent] === "harder") hits.push(e.intent);
    else {
      misses.push(e.intent);
      if (majority[e.intent] === "uncertain") uncertain.push(e.intent);
    }
  }
  const expectedSet = new Set(expected.map((e) => e.intent));
  const falseFlags = Object.entries(majority)
    .filter(([k, v]) => v === "harder" && !expectedSet.has(k))
    .map(([k]) => k);
  const denom = hits.length + falseFlags.length;
  return {
    score: {
      hits,
      misses,
      uncertain,
      falseFlags,
      recall: expected.length ? hits.length / expected.length : NaN,
      precision: denom ? hits.length / denom : expected.length ? 1 : NaN,
    },
    majority,
  };
}

/** Infrastructure failures are missing evidence for both methods, not misses or false flags. */
export function scoreMatchedCase(report: AgencyReport, repeats: ReviewResult[], c: MatchedCase, allExpected: ExpectedEntry[], traces: Trace[]) {
  const excluded = allExpected.filter((e) => traces.some((t) =>
    sameIntent(t.intentId, t.decision, e.intent) && t.stoppedReason === "error" &&
    !(t.error ?? "").startsWith("reference tag not found:"),
  )).map((e) => e.intent);
  const expected = allExpected.filter((e) => !excluded.includes(e.intent));
  const filteredReport = { ...report, findings: report.findings.filter((f) =>
    f.intentId === undefined
      ? !(f.kind === "default_flip" && allExpected.some((e) => e.metric === "default" && excluded.includes(e.intent)))
      : !excluded.some((id) => sameIntent(f.intentId!, f.decision, id)),
  ) };
  const filteredRepeats = repeats.map((r) => ({ ...r, verdicts: Object.fromEntries(
    Object.entries(r.verdicts).filter(([id]) => !excluded.includes(id)),
  ) }));
  return { expected, excluded, comparator: scoreComparator(filteredReport, c, expected), reviewer: scoreReviewer(filteredRepeats, c, expected) };
}
