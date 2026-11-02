import { useEffect, useState } from "react";
import type { AgencyContract, AgencyReport, Finding, Trace } from "@agencydiff/core";
import { aggregatesByIntent, findingsFor, loadContract, loadReport, loadTrace, shotUrl } from "../data";
import { STATUS_LABEL, fmtNum, intentStatus, polarityLabel, shotList } from "../format";
import { link } from "../App";
import { Delta, Phone, VisDelta, stepCaption } from "../components";

function replay(runId: string, intentId: string): string {
  return link({ page: "replay", run: runId, intent: intentId });
}

const pct = (v: unknown) => (typeof v === "number" ? `${Math.round(v * 100)}%` : "—");
const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

function FindingDelta({ f }: { f: Finding }) {
  if (f.kind === "visibility") {
    return <VisDelta b={f.baseline === "visible"} c={f.candidate === "visible"} />;
  }
  if (f.kind === "goal_unreachable") return <Delta b={f.baseline} c={f.candidate} higherIsBetter fmt={pct} />;
  if (f.kind === "asymmetry") return <Delta b={f.baseline} c={f.candidate} fmt={(v) => `${fmtNum(v)}×`} />;
  return <Delta b={f.baseline} c={f.candidate} />;
}

const KIND_LABEL: Record<string, string> = {
  action_cost: "Steps needed",
  navigation_depth: "Screens deep",
  visibility: "On the first screen",
  goal_unreachable: "Success rate",
  default_flip: "Default value",
  asymmetry: "Cost of no vs yes",
};

/** Baseline vs candidate screens for the headline Finding: the start screen
 *  for a visibility Finding, the last recorded screen otherwise. */
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
  const view = (t?: Trace) => {
    if (!t) return { src: undefined, caption: "" };
    const shots = shotList(t);
    const i = atStart ? 0 : shots.length - 1;
    return { src: shotUrl(runId, t.id, shots[i]), caption: stepCaption(t, atStart ? 0 : t.steps.length) };
  };
  const b = view(traces.baseline);
  const c = view(traces.candidate);
  return (
    <div className="stage">
      <div className="side">
        <div className="phone-label baseline">
          <span className="name">Baseline</span>
          <span className="step-note">{traces.baseline ? `${traces.baseline.steps.length} step${traces.baseline.steps.length === 1 ? "" : "s"}` : ""}</span>
        </div>
        <Phone src={b.src} alt="Baseline screen" />
        <div className="phone-caption">{b.caption}</div>
      </div>
      <div className="stage-mid">
        <div className="finding-card">
          <h4>Headline Finding</h4>
          <p style={{ margin: "0 0 12px", fontWeight: 650, fontSize: 15, lineHeight: 1.35 }}>{finding.title}</p>
          <dl>
            <div>
              <dt>{KIND_LABEL[finding.kind] ?? finding.kind}</dt>
              <dd>
                <FindingDelta f={finding} />
              </dd>
            </div>
            {finding.kind !== "action_cost" && (
              <div>
                <dt>Steps needed (median)</dt>
                <dd>
                  <Delta
                    b={report.aggregates.find((x) => x.intentId === finding.intentId && x.variant === "baseline")?.actionCount}
                    c={report.aggregates.find((x) => x.intentId === finding.intentId && x.variant === "candidate")?.actionCount}
                  />
                </dd>
              </div>
            )}
          </dl>
        </div>
        {finding.intentId && (
          <a className="button-link primary" href={replay(runId, finding.intentId)} style={{ justifyContent: "center" }}>
            Replay this Intent
          </a>
        )}
      </div>
      <div className="side">
        <div className="phone-label candidate">
          <span className="name">Candidate</span>
          <span className="step-note">{traces.candidate ? `${traces.candidate.steps.length} step${traces.candidate.steps.length === 1 ? "" : "s"}` : ""}</span>
        </div>
        <Phone src={c.src} alt="Candidate screen" />
        <div className="phone-caption">{c.caption}</div>
      </div>
    </div>
  );
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
  const counts = (["high", "medium", "low"] as const).map((s) => [s, report.findings.filter((f) => f.severity === s).length] as const);

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">Diff · {report.decision.replace(/_/g, " ")}</p>
        <h1 style={{ maxWidth: "30ch" }}>{report.promise}</h1>
        <div className="meta">
          {report.passed ? <span className="pill pass">Pass</span> : <span className="pill fail">Fail</span>}
          {counts
            .filter(([, n]) => n > 0)
            .map(([s, n]) => (
              <span key={s} className={`pill ${s}`}>
                {n} {s}
              </span>
            ))}
          {report.findings.length === 0 && <span className="muted">No Findings</span>}
          <a className="text-link" href={link({ page: "contract", run: runId })} style={{ fontSize: 14 }}>
            Contract →
          </a>
        </div>
      </div>

      {headline && <Evidence runId={runId} report={report} finding={headline} />}

      <h2>Findings</h2>
      {report.findings.length === 0 && (
        <div className="notice">No Findings: the candidate matches the baseline on every Intent.</div>
      )}
      <div className="grid-2">
        {sorted.map((f) => (
          <div className="card" key={f.id} style={{ margin: 0 }}>
            <p style={{ margin: "0 0 10px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span className={`pill ${f.severity}`}>{f.severity}</span>
              <span className="muted" style={{ fontSize: 13 }}>
                {KIND_LABEL[f.kind] ?? f.kind.replace(/_/g, " ")} · {f.evidence.length} Trace{f.evidence.length === 1 ? "" : "s"}
              </span>
            </p>
            <h3 style={{ margin: "0 0 12px", fontSize: 15.5 }}>{f.title}</h3>
            <div style={{ fontSize: 28, letterSpacing: "-0.03em" }}>
              <FindingDelta f={f} />
            </div>
            <p style={{ margin: "12px 0 0", fontSize: 14 }}>
              <a className="text-link" href={f.intentId ? replay(runId, f.intentId) : link({ page: "replay", run: runId })}>
                {f.intentId ? "Open the Traces behind this number →" : "Inspect Traces →"}
              </a>
            </p>
          </div>
        ))}
      </div>
      {findingsFor(report).length > 0 && <p className="muted" style={{ fontSize: 13.5 }}>Findings without an Intent are Decision-level (defaults, Asymmetry).</p>}

      <h2>Per-Intent comparison</h2>
      <p className="lede">Baseline → candidate for every Intent in the Contract. Red is worse, green is better.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Intent</th>
              <th>Status</th>
              <th className="num">Success</th>
              <th className="num">Steps needed</th>
              <th className="num">Screens entered</th>
              <th>First screen</th>
              <th>Default</th>
            </tr>
          </thead>
          <tbody>
            {order.map((id) => {
              const slot = byIntent.get(id);
              if (!slot?.baseline || !slot?.candidate) return null;
              const { baseline: b, candidate: c } = slot;
              const status = intentStatus(b, c, report.findings);
              const goal = intentGoal.get(id);
              return (
                <tr key={id} className={`status-${status}`}>
                  <td style={{ minWidth: 240 }}>
                    <a href={replay(runId, id)}>
                      <strong>{goal?.goal ?? id}</strong>
                    </a>
                    <br />
                    <span className="muted" style={{ fontSize: 13 }}>
                      {polarityLabel(goal?.polarity ?? "neutral")} · <code>{id}</code>
                    </span>
                  </td>
                  <td>
                    <span className={`pill ${status}`}>{STATUS_LABEL[status]}</span>
                  </td>
                  <td className="num">
                    <Delta b={b.successRate} c={c.successRate} higherIsBetter fmt={pct} />
                  </td>
                  <td className="num">
                    <Delta b={b.actionCount} c={c.actionCount} />
                  </td>
                  <td className="num">
                    <Delta b={b.navigationDepth} c={c.navigationDepth} />
                  </td>
                  <td>
                    <VisDelta b={b.initiallyVisible} c={c.initiallyVisible} />
                  </td>
                  <td>
                    <Delta b={b.defaultValue} c={c.defaultValue} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2>Asymmetry</h2>
      <p className="lede">
        Cost of the Protective side of each Intent Pair divided by the cost of the other side.
        Above 1× means saying no is harder than saying yes.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Saying yes</th>
              <th>Saying no</th>
              <th className="num">Baseline → candidate</th>
            </tr>
          </thead>
          <tbody>
            {report.asymmetry.map((a) => (
              <tr key={`${a.accept}/${a.reject}`}>
                <td>
                  <a href={replay(runId, a.accept)}>{intentGoal.get(a.accept)?.goal ?? a.accept}</a>
                </td>
                <td>
                  <a href={replay(runId, a.reject)}>{intentGoal.get(a.reject)?.goal ?? a.reject}</a>
                </td>
                <td className="num">
                  <Delta b={a.baseline} c={a.candidate} fmt={(v) => `${fmtNum(v)}×`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
