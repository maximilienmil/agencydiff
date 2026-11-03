import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { VideoData } from "./types.js";

// Every number in the film is read from the repo's own evidence files at
// render time. Anything missing renders as [PENDING].

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

function readText(path: string): string | null {
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
}

const str = (v: unknown): string | null =>
  v === null || v === undefined ? null : String(v);

interface SummaryJson {
  agencydiff?: {
    scripted?: { caught?: string; falseAlarms?: string; costUsd?: number } | null;
  } | null;
  judge?: {
    walkthrough?: { caught?: string } | null;
    firstScreens?: { caught?: string } | null;
  } | null;
}

interface SusJson {
  summary?: { injectedPairs?: number; detectedPairs?: number; controlPairs?: number; falseAlarms?: number };
  pairs?: Array<{ pattern: string; control?: boolean; detected?: boolean }>;
}

interface ReportJson {
  aggregates?: Array<{ intentId: string; variant: string; actionCount?: number; initiallyVisible?: boolean }>;
  findings?: Array<{ intentId?: string; kind: string; title: string }>;
}

interface AttemptJson {
  arm?: string;
  task?: string;
  confirmedRegressions?: string[] | null;
  gateClaim?: string;
}

interface TasksJson {
  tasks?: Array<{ id: string; title: string; prompt: string }>;
}

function money(v: unknown): string | null {
  if (typeof v !== "number") return null;
  return v === 0 ? "$0" : `$${v.toFixed(2)}`;
}

function agentGate(attempts: AttemptJson[] | undefined): { noGate: string | null; gated: string | null } {
  if (!attempts) return { noGate: null, gated: null };
  const count = (arm: string) =>
    attempts.filter((a) => a.arm === arm && (a.confirmedRegressions ?? []).length > 0).length;
  const denom = (arm: string) => attempts.filter((a) => a.arm === arm).length;
  const na = denom("a");
  const nb = denom("b");
  return {
    noGate: na ? `${count("a")}/${na}` : null,
    gated: nb ? `${count("b")}/${nb}` : null,
  };
}

function auditRealId(auditMd: string | null): string | null {
  if (!auditMd) return null;
  const row = auditMd
    .split("\n")
    .find((l) => l.startsWith("| real-id-docs") && l.includes("→"));
  if (!row) return null;
  const cells = row.split("|").map((c) => c.trim());
  // | Intent | Success before → after | To fact before → after | ... |
  if (!cells[2] || !cells[3]) return null;
  const toFact = cells[3].replace(/^—\s*→\s*/, "");
  return `REAL ID documents: ${cells[2]} · ${toFact} actions to fact`;
}

function diffExcerpt(root: string, name: string, maxLines: number): string[] {
  const text = readText(join(root, "eval/agent-prs/demo", name));
  if (!text) return [];
  return text
    .split("\n")
    .filter((l) => l.startsWith("+") || l.startsWith("-") || l.startsWith("@@"))
    .filter((l) => !l.startsWith("+++") && !l.startsWith("---"))
    .slice(0, maxLines)
    .map((l) => l.slice(0, 88));
}

function firstFindingTitle(root: string, decision: string): string | null {
  const report = readJson<ReportJson>(join(root, `apps/report/public/data/${decision}/report.json`));
  const findings = report?.findings ?? [];
  // The film's red card names the visibility finding ("no longer on first
  // screen"); fall back to the first finding when there is none.
  return findings.find((f) => f.kind === "visibility")?.title ?? findings[0]?.title ?? null;
}

function withholdAggregates(root: string): {
  declineBaseline: string | null;
  declineCandidate: string | null;
  declineVisibility: string | null;
} {
  const report = readJson<ReportJson>(join(root, "apps/report/public/data/precise_location/report.json"));
  const agg = (variant: string) =>
    report?.aggregates?.find((a) => a.intentId === "withhold" && a.variant === variant);
  const candidate = agg("candidate");
  return {
    declineBaseline: str(agg("baseline")?.actionCount),
    declineCandidate: str(candidate?.actionCount),
    declineVisibility:
      candidate?.initiallyVisible === undefined
        ? null
        : candidate.initiallyVisible
          ? "visible"
          : "hidden",
  };
}

export function loadVideoData(repoRoot: string): VideoData {
  const summary = readJson<SummaryJson>(join(repoRoot, "eval/results/summary.json"));
  const sus = readJson<SusJson>(join(repoRoot, "eval/susbench/results.json"));
  const auditMd = readText(join(repoRoot, "docs/audit.md"));
  const tasks = readJson<TasksJson>(join(repoRoot, "eval/agent-prs/tasks.json"));
  const agentPrs = readJson<{ attempts?: AttemptJson[] }>(join(repoRoot, "eval/agent-prs/results.json"));
  const gate = agentGate(agentPrs?.attempts);
  const withhold = withholdAggregates(repoRoot);
  const onboard = tasks?.tasks?.find((t) => t.id === "onboard") ?? null;

  const gateRow = summary?.agencydiff?.scripted;
  return {
    agentNoGate: gate.noGate,
    agentGated: gate.gated,
    gateCaught: gateRow?.caught ?? null,
    gateFalseAlarms: gateRow?.falseAlarms ?? null,
    gateCost: gateRow ? money(gateRow.costUsd) : null,
    screensCaught: summary?.judge?.firstScreens?.caught ?? null,
    walkthroughCaught: summary?.judge?.walkthrough?.caught ?? null,
    susDetected:
      sus?.summary && sus.summary.detectedPairs !== undefined && sus.summary.injectedPairs !== undefined
        ? `${sus.summary.detectedPairs}/${sus.summary.injectedPairs}`
        : null,
    susPairs: (sus?.pairs ?? []).filter((p) => !p.control).map((p) => ({ pattern: p.pattern, detected: !!p.detected })),
    susFalseAlarms:
      sus?.summary?.falseAlarms !== undefined && sus?.summary?.controlPairs !== undefined
        ? `${sus.summary.falseAlarms}/${sus.summary.controlPairs}`
        : null,
    auditRealId: auditRealId(auditMd),
    onboardPrompt: onboard?.prompt ?? null,
    onboardTitle: onboard?.title ?? null,
    regressingDiff: diffExcerpt(repoRoot, "onboard-regressing-armA-attempt0.diff", 12),
    fixedDiff: diffExcerpt(repoRoot, "onboard-fixed-armB-attempt0.diff", 12),
    gateClaimB: agentPrs?.attempts?.find((a) => a.arm === "b" && a.task === "onboard")?.gateClaim ?? null,
    withholdFinding: firstFindingTitle(repoRoot, "precise_location"),
    teenFinding: firstFindingTitle(repoRoot, "teen_dm"),
    declineBaseline: withhold.declineBaseline,
    declineCandidate: withhold.declineCandidate,
    declineVisibility: withhold.declineVisibility,
    repoUrl: "github.com/maximilienmil/agencydiff",
  };
}
