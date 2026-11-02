import { useEffect, useState } from "react";
import type { AgencyContract, AgencyReport, Finding, IntentAggregate, Trace } from "@agencydiff/core";
import { Table, proportional, type TableColumn } from "@astryxdesign/core/Table";
import { Badge } from "@astryxdesign/core/Badge";
import { aggregatesByIntent, loadContract, loadReport, loadTrace, shotUrl } from "../data";
import { STATUS_LABEL, fmtNum, intentStatus, polarityLabel, shotList, type RowStatus } from "../format";
import { link } from "../App";
import { Delta, Phone, Readout, RouteMap, VisDelta, stepCaption } from "../components";

function replay(runId: string, intentId: string): string {
  return link({ page: "replay", run: runId, intent: intentId });
}

const times = (v: unknown) => (typeof v === "number" ? `${fmtNum(v)}×` : "n/a");
const pct = (v: unknown) => (typeof v === "number" ? `${Math.round(v * 100)}%` : "—");
const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
const SEVERITY_BADGE: Record<string, "error" | "warning" | "neutral"> = { high: "error", medium: "warning", low: "neutral" };
const STATUS_BADGE: Record<RowStatus, "error" | "success" | "neutral"> = { regression: "error", improvement: "success", unchanged: "neutral" };

const KIND_LABEL: Record<string, string> = {
  action_cost: "Steps needed",
  navigation_depth: "Screens deep",
  visibility: "On the first screen",
  goal_unreachable: "Success rate",
  default_flip: "Default value",
  asymmetry: "Cost of no against yes",
};

function FindingReadout({ f, size = "lg" }: { f: Finding; size?: "md" | "lg" }) {
  if (f.kind === "visibility") {
    const w = (v: unknown) => (v === "visible" ? "Visible" : v === "hidden" ? "Hidden" : fmtNum(v));
    return <Readout b={f.baseline} c={f.candidate} fmt={w} size={size} />;
  }
  if (f.kind === "goal_unreachable") return <Readout b={f.baseline} c={f.candidate} higherIsBetter fmt={pct} size={size} />;
  if (f.kind === "asymmetry") return <Readout b={f.baseline} c={f.candidate} fmt={times} size={size} />;
  return <Readout b={f.baseline} c={f.candidate} size={size} />;
}

/** Baseline against candidate for the headline Finding: where each Probe
 *  started, how far it went, and the route it took. */
function Evidence({ runId, report, finding }: { runId: string; report: AgencyReport; finding: Finding }) {
  const [traces, setTraces] = useState<{ baseline?: Trace; candidate?: Trace }>({});
  useEffect(() => {
    let live = true;
    const pick = (v: "baseline" | "candidate") => {
      const id = report.aggregates.find((a) => a.intentId === finding.intentId && a.variant === v)?.traceIds.slice().sort()[0];
      return id ? loadTrace(runId, id).catch(() => undefined) : Promise.resolve(undefined);
    };
    Promise.all([pick("baseline"), pick("candidate")]).then(([baseline, candidate]) => live && setTraces({ baseline, candidate }));
    return () => {
      live = false;
    };
  }, [runId, report, finding]);
  const atStart = finding.kind === "visibility";
  const side = (v: "baseline" | "candidate") => {
    const t = traces[v];
    const shots = t ? shotList(t) : [];
    const src = t ? shotUrl(runId, t.id, shots[atStart ? 0 : shots.length - 1]) : undefined;
    return (
      <div className="side">
        <div className={`phone-label ${v}`}>
          <span className="name">{v === "baseline" ? "Baseline" : "Candidate"}</span>
          <span className="step-note">{t ? `${t.steps.length} step${t.steps.length === 1 ? "" : "s"}` : ""}</span>
        </div>
        <Phone src={src} alt={`${v} screen`} />
        <div className="phone-caption">{t ? stepCaption(t, atStart ? 0 : t.steps.length) : ""}</div>
        {t && <RouteMap trace={t} compact />}
      </div>
    );
  };
  const agg = (v: "baseline" | "candidate") => report.aggregates.find((x) => x.intentId === finding.intentId && x.variant === v);
  return (
    <div className="stage">
      {side("baseline")}
      <div className="stage-mid">
        <div className="finding">
          <h4>Finding</h4>
          <p style={{ margin: "0 0 18px", fontSize: 16, lineHeight: 1.45 }}>{finding.title}</p>
          <dl>
            <div>
              <dt>{KIND_LABEL[finding.kind] ?? finding.kind}</dt>
              <dd>
                <FindingReadout f={finding} />
              </dd>
            </div>
            {finding.kind !== "action_cost" && (
              <div>
                <dt>Steps needed, median of {agg("baseline")?.runs ?? "—"} runs</dt>
                <dd>
                  <Readout b={agg("baseline")?.actionCount} c={agg("candidate")?.actionCount} size="md" />
                </dd>
              </div>
            )}
          </dl>
        </div>
        {finding.intentId && (
          <a className="cta primary" href={replay(runId, finding.intentId)} style={{ alignSelf: "flex-start" }}>
            Replay this Intent
          </a>
        )}
      </div>
      {side("candidate")}
    </div>
  );
}

interface IntentRow extends Record<string, unknown> {
  id: string;
  goal: string;
  polarity: string;
  status: RowStatus;
  b: IntentAggregate;
  c: IntentAggregate;
}

function intentColumns(runId: string): TableColumn<IntentRow>[] {
  return [
    {
      key: "goal",
      header: "Intent",
      width: proportional(2.6),
      renderCell: (r) => (
        <span>
          <a href={replay(runId, r.id)} style={{ fontWeight: 600, textDecoration: "none" }}>
            {r.goal}
          </a>
          <br />
          <span className="muted" style={{ fontSize: 13 }}>
            {polarityLabel(r.polarity)} · <span className="mono">{r.id}</span>
          </span>
        </span>
      ),
    },
    { key: "status", header: "Status", renderCell: (r) => <Badge variant={STATUS_BADGE[r.status]} label={STATUS_LABEL[r.status]} /> },
    { key: "success", header: "Success", renderCell: (r) => <Delta b={r.b.successRate} c={r.c.successRate} higherIsBetter fmt={pct} /> },
    { key: "steps", header: "Steps", renderCell: (r) => <Delta b={r.b.actionCount} c={r.c.actionCount} /> },
    { key: "depth", header: "Screens", renderCell: (r) => <Delta b={r.b.navigationDepth} c={r.c.navigationDepth} /> },
    { key: "vis", header: "First screen", width: proportional(1.6), renderCell: (r) => <VisDelta b={r.b.initiallyVisible} c={r.c.initiallyVisible} /> },
    { key: "def", header: "Default", renderCell: (r) => <Delta b={r.b.defaultValue} c={r.c.defaultValue} /> },
  ];
}

interface AsymRow extends Record<string, unknown> {
  key: string;
  accept: string;
  reject: string;
  baseline?: number;
  candidate?: number;
}

export function DiffPage({ runId }: { runId: string }) {
  const [report, setReport] = useState<AgencyReport | null>(null);
  const [contract, setContract] = useState<AgencyContract | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReport(null);
    setContract(null);
    setError(null);
    loadReport(runId).then(setReport, (e) => setError(String(e)));
    loadContract(runId).then(setContract, () => setContract(null));
  }, [runId]);

  if (error) return <div className="error">Could not load run {runId}: {error}</div>;
  if (!report) return <p className="muted">Loading diff…</p>;

  const byIntent = aggregatesByIntent(report);
  const intentGoal = new Map((contract?.intents ?? []).map((i) => [i.id, i]));
  const order = contract?.intents.map((i) => i.id) ?? [...byIntent.keys()];
  const sorted = [...report.findings].sort((a, b) => (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3));
  const headline = sorted.find((f) => f.intentId && f.kind === "visibility") ?? sorted.find((f) => f.intentId);
  const rows: IntentRow[] = order.flatMap((id) => {
    const slot = byIntent.get(id);
    if (!slot?.baseline || !slot?.candidate) return [];
    const goal = intentGoal.get(id);
    return [{ id, goal: goal?.goal ?? id, polarity: goal?.polarity ?? "neutral", status: intentStatus(slot.baseline, slot.candidate, report.findings), b: slot.baseline, c: slot.candidate }];
  });
  const asym: AsymRow[] = report.asymmetry.map((a) => ({ key: `${a.accept}/${a.reject}`, accept: a.accept, reject: a.reject, baseline: a.baseline, candidate: a.candidate }));
  const asymColumns: TableColumn<AsymRow>[] = [
    { key: "accept", header: "Saying yes", width: proportional(2), renderCell: (r) => <a href={replay(runId, r.accept)}>{intentGoal.get(r.accept)?.goal ?? r.accept}</a> },
    { key: "reject", header: "Saying no", width: proportional(2), renderCell: (r) => <a href={replay(runId, r.reject)}>{intentGoal.get(r.reject)?.goal ?? r.reject}</a> },
    { key: "ratio", header: "Baseline to candidate", renderCell: (r) => <Delta b={r.baseline} c={r.candidate} fmt={times} /> },
  ];

  return (
    <>
      <div className="page-head">
        <h1>{report.promise}</h1>
        <div className="meta">
          <Badge variant={report.passed ? "success" : "error"} label={report.passed ? "Check passed" : "Check failed"} />
          {(["high", "medium", "low"] as const).map((s) => {
            const n = report.findings.filter((f) => f.severity === s).length;
            return n > 0 ? <Badge key={s} variant={SEVERITY_BADGE[s]} label={`${n} ${s}`} /> : null;
          })}
          <a className="text-link" href={link({ page: "contract", run: runId })} style={{ marginLeft: 8 }}>
            Read the Contract
          </a>
        </div>
      </div>

      {headline && <Evidence runId={runId} report={report} finding={headline} />}

      <div className="section-head">
        <h2>Findings</h2>
      </div>
      {report.findings.length === 0 && <div className="notice">No Findings: the candidate matches the baseline on every Intent.</div>}
      <div className="findings">
        {sorted.map((f) => (
          <article key={f.id}>
            <span className="kind">
              <Badge variant={SEVERITY_BADGE[f.severity]} label={f.severity} /> &nbsp;{KIND_LABEL[f.kind] ?? f.kind.replace(/_/g, " ")} · {f.evidence.length} Trace
              {f.evidence.length === 1 ? "" : "s"}
            </span>
            <h3>{f.title}</h3>
            <FindingReadout f={f} size="md" />
            <p style={{ margin: "14px 0 0" }}>
              <a className="text-link" href={f.intentId ? replay(runId, f.intentId) : link({ page: "replay", run: runId })}>
                {f.intentId ? "Open the Traces behind this number" : "Inspect the Traces"}
              </a>
            </p>
          </article>
        ))}
      </div>

      <div className="section-head">
        <h2>Per-Intent comparison</h2>
      </div>
      <p className="lede">Baseline to candidate for every Intent in the Contract. Red is worse, green is better.</p>
      <div className="table-block">
        <Table<IntentRow> data={rows} columns={intentColumns(runId)} idKey="id" density="spacious" hasHover />
      </div>

      <div className="section-head">
        <h2>Asymmetry</h2>
      </div>
      <p className="lede">
        The cost of the Protective side of each Intent Pair divided by the cost of the other side. Above 1× means saying no
        is harder than saying yes.
      </p>
      <div className="table-block">
        <Table<AsymRow> data={asym} columns={asymColumns} idKey="key" density="balanced" />
      </div>
    </>
  );
}
