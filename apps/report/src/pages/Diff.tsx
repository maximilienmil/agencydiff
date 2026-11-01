import { useEffect, useState } from "react";
import type { AgencyContract, AgencyReport } from "@agencydiff/core";
import { aggregatesByIntent, findingsFor, loadContract, loadReport } from "../data";
import { STATUS_LABEL, fmtNum, fmtPct, intentStatus, polarityLabel } from "../format";
import { link } from "../App";

function replay(runId: string, intentId: string): string {
  return link({ page: "replay", run: runId, intent: intentId });
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

  return (
    <>
      <h1>
        Diff <span className="muted" style={{ fontWeight: 400, fontSize: 18 }}>: {report.decision}</span>
      </h1>
      <p className="lede">{report.promise}</p>
      <p>
        {report.passed ? <span className="pill pass">Pass</span> : <span className="pill fail">Fail</span>}{" "}
        <span className="muted">
          {report.findings.length} finding{report.findings.length === 1 ? "" : "s"}
        </span>
      </p>

      <h2>Per-Intent comparison</h2>
      <table>
        <thead>
          <tr>
            <th>Intent</th>
            <th>Status</th>
            <th className="num">Success</th>
            <th className="num">Steps needed</th>
            <th className="num">Screens entered</th>
            <th>Visible on first screen</th>
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
                <td>
                  <a href={replay(runId, id)}>
                    <strong>{goal?.goal ?? id}</strong>
                  </a>
                  <br />
                  <span className="muted">
                    {polarityLabel(goal?.polarity ?? "neutral")} · <code>{id}</code>
                  </span>
                </td>
                <td>
                  <span className={`pill ${status}`}>{STATUS_LABEL[status]}</span>
                </td>
                <td className="num">
                  <a href={replay(runId, id)}>
                    {fmtPct(b.successRate)} → {fmtPct(c.successRate)}
                  </a>
                </td>
                <td className="num">
                  <a href={replay(runId, id)}>{fmtNum(b.actionCount)} → {fmtNum(c.actionCount)}</a>
                </td>
                <td className="num">
                  <a href={replay(runId, id)}>
                    {fmtNum(b.navigationDepth)} → {fmtNum(c.navigationDepth)}
                  </a>
                </td>
                <td>
                  <a href={replay(runId, id)}>
                    {fmtNum(b.initiallyVisible)} → {fmtNum(c.initiallyVisible)}
                  </a>
                </td>
                <td className="muted">
                  {fmtNum(b.defaultValue)} → {fmtNum(c.defaultValue)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2>Asymmetry</h2>
      <p className="lede">
        Cost of the Protective side of each Intent Pair divided by the cost of the other
        side. Above 1 means saying no is harder than saying yes.
      </p>
      <table>
        <thead>
          <tr>
            <th>Saying yes</th>
            <th>Saying no</th>
            <th className="num">Baseline</th>
            <th className="num">Candidate</th>
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
              <td className="num">{fmtNum(a.baseline)}×</td>
              <td className="num">{fmtNum(a.candidate)}×</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Findings</h2>
      {report.findings.length === 0 && (
        <div className="notice">No Findings: the candidate matches the baseline on every Intent.</div>
      )}
      {report.findings.map((f) => (
        <div className="card" key={f.id}>
          <h3>
            <span className={`pill ${f.severity}`}>{f.severity}</span> {f.title}
          </h3>
          <p>
            <span className="muted">Change: </span>
            <strong>{fmtNum(f.baseline)} → {fmtNum(f.candidate)}</strong>
            {f.intentId && (
              <>
                {" · "}
                <a href={replay(runId, f.intentId)}>Open the Traces behind this number</a>
              </>
            )}
          </p>
          <p className="muted" style={{ fontSize: 13.5 }}>
            {f.kind.replace(/_/g, " ")} · {f.evidence.length} supporting Trace
            {f.evidence.length === 1 ? "" : "s"}
          </p>
        </div>
      ))}
      <UnclaimedFindings runId={runId} report={report} />
    </>
  );
}

function UnclaimedFindings({ runId, report }: { runId: string; report: AgencyReport }) {
  const rest = findingsFor(report);
  if (rest.length === 0) return null;
  return (
    <>
      <h3>Decision-level</h3>
      {rest.map((f) => (
        <div className="card" key={f.id}>
          <h3>
            <span className={`pill ${f.severity}`}>{f.severity}</span> {f.title}
          </h3>
          <p>
            <span className="muted">Change: </span>
            <strong>
              {fmtNum(f.baseline)} → {fmtNum(f.candidate)}
            </strong>{" "}
            · <a href={link({ page: "replay", run: runId })}>Inspect Traces</a>
          </p>
        </div>
      ))}
    </>
  );
}
