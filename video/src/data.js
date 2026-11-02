import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
// Every number in the film is read from the repo's own evidence files at
// render time. Nothing is hard-coded: a re-render after a new eval run picks
// up the new numbers, and anything missing renders as [PENDING].
function readJson(path) {
    if (!existsSync(path))
        return null;
    try {
        return JSON.parse(readFileSync(path, "utf8"));
    }
    catch {
        return null;
    }
}
function readText(path) {
    if (!existsSync(path))
        return null;
    return readFileSync(path, "utf8");
}
const str = (v) => v === null || v === undefined ? null : String(v);
function dmvTimeToFact(auditMd) {
    if (!auditMd)
        return null;
    // The DMV before/after table in docs/audit.md: real-id-docs is the one
    // Intent whose time-to-fact improved on both sides of the comparison.
    const row = auditMd
        .split("\n")
        .find((l) => l.startsWith("| real-id-docs") && l.includes("/3"));
    if (!row)
        return null;
    const cells = row.split("|").map((c) => c.trim());
    // | Intent | Success before -> after | To fact before -> after | ... |
    return cells[3] ? `REAL ID documents: ${cells[3].replaceAll("→", "->")}` : null;
}
export function loadVideoData(repoRoot) {
    const summary = readJson(join(repoRoot, "eval/results/summary.json"));
    const sus = readJson(join(repoRoot, "eval/susbench/results.json"));
    const auditMd = readText(join(repoRoot, "docs/audit.md"));
    const index = readJson(join(repoRoot, "apps/report/public/data/index.json"));
    const runId = index?.runs?.[0]?.id;
    const report = runId
        ? readJson(join(repoRoot, `apps/report/public/data/${runId}/report.json`))
        : null;
    const agg = (intent, variant) => report?.aggregates?.find((a) => a.intentId === intent && a.variant === variant);
    const withholdB = agg("withhold", "baseline");
    const withholdC = agg("withhold", "candidate");
    const revokeB = agg("revoke", "baseline");
    const revokeC = agg("revoke", "candidate");
    const asym = report?.asymmetry?.[0];
    const findings = (report?.findings ?? []).slice(0, 5).map((f) => ({
        intentId: f.intentId ?? "pair",
        kind: f.kind,
        title: f.title,
        baseline: str(f.baseline) ?? "—",
        candidate: str(f.candidate) ?? "—",
    }));
    const agreement = summary?.judge?.consistencyK3?.agreement;
    return {
        scriptedCaught: summary?.agencydiff?.scripted?.caught ?? null,
        scriptedFalseAlarms: summary?.agencydiff?.scripted?.falseAlarms ?? null,
        judgeCaught: summary?.judge?.caught ?? null,
        judgeFalseAlarms: summary?.judge?.falseAlarms ?? null,
        judgeConsistency: typeof agreement === "number" ? `${Math.round(agreement * 100)}% agreement (k=3)` : null,
        museProbes: summary?.agencydiff?.muse ? "run recorded" : null,
        susDetected: sus?.summary && sus.summary.detectedPairs !== undefined && sus.summary.injectedPairs !== undefined
            ? `${sus.summary.detectedPairs}/${sus.summary.injectedPairs} injected patterns`
            : null,
        susFalseAlarms: sus?.summary?.falseAlarms !== undefined && sus?.summary?.controlPairs !== undefined
            ? `${sus.summary.falseAlarms}/${sus.summary.controlPairs} controls`
            : null,
        dmvTimeToFact: dmvTimeToFact(auditMd),
        declineBaseline: str(withholdB?.actionCount),
        declineCandidate: str(withholdC?.actionCount),
        declineVisibility: withholdC?.initiallyVisible === undefined
            ? null
            : withholdC.initiallyVisible
                ? "visible"
                : "hidden",
        revokeBaseline: str(revokeB?.actionCount),
        revokeCandidate: str(revokeC?.actionCount),
        asymmetryBaseline: str(asym?.baseline),
        asymmetryCandidate: str(asym?.candidate),
        findings,
        repoUrl: "github.com/maximilianmilovidov/agencydiff",
    };
}
