import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  countActions,
  median,
  navigationDepth,
  type AgencyContract,
  type AuditReport,
  type Trace,
} from "@agencydiff/core";

/** One decision's report plus the traces behind it, with trace directories. */
export interface LoadedAudit {
  dir: string;
  decision: string;
  report: AuditReport;
  traces: { trace: Trace; dir: string }[];
}

/** Read every <decision>/audit.json and its sibling trace.json files. */
export async function loadAuditRuns(runDir: string): Promise<LoadedAudit[]> {
  const out: LoadedAudit[] = [];
  const entries = await readdir(runDir, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const dir = path.join(runDir, e.name);
    let report: AuditReport;
    try {
      report = JSON.parse(await readFile(path.join(dir, "audit.json"), "utf8"));
    } catch {
      continue;
    }
    const traces: LoadedAudit["traces"] = [];
    for (const sub of await readdir(dir, { withFileTypes: true })) {
      if (!sub.isDirectory()) continue;
      const tdir = path.join(dir, sub.name);
      try {
        const trace = JSON.parse(await readFile(path.join(tdir, "trace.json"), "utf8")) as Trace;
        traces.push({ trace, dir: tdir });
      } catch {
        /* not a trace dir */
      }
    }
    out.push({ dir, decision: report.decision, report, traces });
  }
  return out;
}

/** Screen label for a step observation: data-screen, else the URL path. */
export function screenKey(o: { screen?: string; url: string }): string {
  if (o.screen) return o.screen;
  try {
    const u = new URL(o.url);
    return `${u.host}${u.pathname}`;
  } catch {
    return o.url;
  }
}

/** Distinct screens entered across a trace's steps (after the initial one). */
export function screensVisited(t: Trace): string[] {
  const start = screenKey(t.initial.observation);
  const seen: string[] = [];
  for (const s of t.steps) {
    const k = screenKey(s.after);
    if (k !== start && !seen.includes(k)) seen.push(k);
  }
  return seen;
}

export interface IntentSummary {
  intentId: string;
  goal?: string;
  attempts: number;
  successes: number;
  successRate: number;
  /** Medians over successful runs only, mirroring core aggregate(); undefined when none succeeded. */
  medianSteps?: number;
  medianActions?: number;
  medianDepth?: number;
  medianMs?: number;
  screens: string[];
  traceIds: string[];
}

/** Per-Intent cost summary over one audit's traces, mirroring core metrics:
 *  success rate plus medians over successful runs. */
export function summarizeIntent(
  intentId: string,
  traces: Trace[],
  contract?: { intents: { id: string; goal?: string }[] },
): IntentSummary {
  const goal = contract?.intents.find((i) => i.id === intentId)?.goal;
  const ok = traces.filter((t) => t.oracle.passed === true);
  const durations = ok.map((t) => t.steps.at(-1)?.tMs ?? 0);
  return {
    intentId,
    goal,
    attempts: traces.length,
    successes: ok.length,
    successRate: traces.length ? ok.length / traces.length : 0,
    medianSteps: median(ok.map((t) => t.steps.length)),
    medianActions: median(ok.map(countActions)),
    medianDepth: median(ok.map(navigationDepth)),
    medianMs: median(durations),
    screens: [...new Set(traces.flatMap(screensVisited))],
    traceIds: traces.map((t) => t.id),
  };
}

/** Find the contract whose decision matches, scanning <root>/contracts. */
export async function findContract(root: string, decision: string): Promise<AgencyContract | undefined> {
  for (const f of await readdir(path.join(root, "contracts"))) {
    if (!f.endsWith(".json")) continue;
    try {
      const c = JSON.parse(await readFile(path.join(root, "contracts", f), "utf8"));
      if (c.decision === decision) return c as AgencyContract;
    } catch {
      /* skip unreadable */
    }
  }
  return undefined;
}

/** "my_decision" -> "my-decision". */
export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Pull the HTML document out of a model reply (fences or prose tolerated). */
export function extractHtml(reply: string): string {
  const fence = reply.match(/```(?:html)?\s*([\s\S]*?)```/i);
  const raw = fence ? fence[1] : reply;
  const start = raw.search(/<!doctype html|<html[\s>]/i);
  if (start === -1) throw new Error("Model reply contained no HTML document");
  const end = raw.toLowerCase().lastIndexOf("</html>");
  return (end === -1 ? raw.slice(start) : raw.slice(start, end + "</html>".length)).trim();
}

export interface ComparisonRow {
  intentId: string;
  goal?: string;
  before: IntentSummary;
  after: IntentSummary;
}

/** Pair two audits' Intent summaries for a before/after comparison. */
export function compareAudits(
  before: LoadedAudit[],
  after: LoadedAudit[],
  contract?: AgencyContract,
): ComparisonRow[] {
  const byIntent = new Map<string, { b: Trace[]; a: Trace[] }>();
  const take = (slot: "b" | "a", audits: LoadedAudit[]) => {
    for (const audit of audits) {
      for (const { trace } of audit.traces) {
        const slot_ = byIntent.get(trace.intentId) ?? { b: [], a: [] };
        slot_[slot].push(trace);
        byIntent.set(trace.intentId, slot_);
      }
    }
  };
  take("b", before);
  take("a", after);
  return [...byIntent.entries()]
    .sort(([x], [y]) => (x < y ? -1 : 1))
    .map(([intentId, { b, a }]) => ({
      intentId,
      goal: contract?.intents.find((i) => i.id === intentId)?.goal,
      before: summarizeIntent(intentId, b, contract),
      after: summarizeIntent(intentId, a, contract),
    }));
}
