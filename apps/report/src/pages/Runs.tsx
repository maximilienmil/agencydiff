import { useEffect, useState } from "react";
import { loadEval, type EvalResults, type RunIndex } from "../data";
import { fmtDate, fmtPct } from "../format";
import { link } from "../App";

function Verdict({ passed }: { passed: boolean }) {
  return passed ? <span className="pill pass">Pass</span> : <span className="pill fail">Fail</span>;
}

export function RunsPage({ index }: { index: RunIndex }) {
  const [evalRes, setEvalRes] = useState<EvalResults | null>(null);
  useEffect(() => {
    loadEval().then(setEvalRes, () => setEvalRes(null));
  }, []);

  return (
    <>
      <h1>Runs</h1>
      <p className="lede">
        Each run probes the same Intents against a baseline and a candidate Variant and
        decides pass or fail from the Oracle on final app state.
      </p>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Decision</th>
            <th>Driver</th>
            <th>Verdict</th>
            <th className="num">Probes</th>
            <th className="num">High</th>
            <th className="num">Med</th>
            <th className="num">Low</th>
          </tr>
        </thead>
        <tbody>
          {index.runs.map((r) => (
            <tr key={r.id}>
              <td>
                <a href={link({ page: "diff", run: r.id })}>{fmtDate(r.date)}</a>
              </td>
              <td>{r.decision}</td>
              <td>{r.driver}</td>
              <td>
                <Verdict passed={r.passed} />
              </td>
              <td className="num">{r.traces}</td>
              <td className="num">{r.findings.high}</td>
              <td className="num">{r.findings.medium}</td>
              <td className="num">{r.findings.low}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Benchmark</h2>
      {!evalRes ? (
        <div className="notice">
          No benchmark results yet (<code>data/eval.json</code> is absent). When the seeded
          benchmark runs, precision, recall, false alarms on controls, and the
          AgencyDiff-vs-judge comparison appear here.
        </div>
      ) : (
        <Benchmark evalRes={evalRes} />
      )}
    </>
  );
}

function Benchmark({ evalRes }: { evalRes: EvalResults }) {
  const s = evalRes.summary;
  return (
    <>
      {evalRes.sample && (
        <div className="notice">
          Sample benchmark figures illustrating the layout; replaced by measured results when
          the seeded benchmark runs.
        </div>
      )}
      <div className="stat-row">
        <div className="stat">
          <div className="v">{fmtPct(s.precision)}</div>
          <div className="k">Precision on seeded regressions</div>
        </div>
        <div className="stat">
          <div className="v">{fmtPct(s.recall)}</div>
          <div className="k">Recall on seeded regressions</div>
        </div>
        <div className="stat">
          <div className="v">{s.falseAlarms}</div>
          <div className="k">False alarms on control runs</div>
        </div>
        <div className="stat">
          <div className="v">{s.controls}</div>
          <div className="k">Control runs checked</div>
        </div>
      </div>
      <h3>Seeded regressions</h3>
      <table>
        <thead>
          <tr>
            <th>Seed</th>
            <th>What changed</th>
            <th>Detected</th>
          </tr>
        </thead>
        <tbody>
          {evalRes.seeds.map((sd) => (
            <tr key={sd.seed}>
              <td>
                <code>{sd.seed}</code>
              </td>
              <td>{sd.description}</td>
              <td>{sd.detected ? <span className="pill pass">Detected</span> : <span className="pill fail">Missed</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>AgencyDiff vs Muse-as-judge</h3>
      <table>
        <thead>
          <tr>
            <th>Grader</th>
            <th className="num">Precision</th>
            <th className="num">Recall</th>
            <th className="num">False alarms</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>AgencyDiff (Oracle on final state)</td>
            <td className="num">{fmtPct(evalRes.judges.agencyDiff.precision)}</td>
            <td className="num">{fmtPct(evalRes.judges.agencyDiff.recall)}</td>
            <td className="num">{evalRes.judges.agencyDiff.falseAlarms}</td>
          </tr>
          <tr>
            <td>Muse as judge (model opinion)</td>
            <td className="num">{fmtPct(evalRes.judges.museAsJudge.precision)}</td>
            <td className="num">{fmtPct(evalRes.judges.museAsJudge.recall)}</td>
            <td className="num">{evalRes.judges.museAsJudge.falseAlarms}</td>
          </tr>
        </tbody>
      </table>
    </>
  );
}
