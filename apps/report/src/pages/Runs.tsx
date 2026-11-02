import { type RunIndex } from "../data";
import { fmtDate } from "../format";
import { link } from "../App";
import { BenchmarkSection, useBenchmark } from "./Benchmark";

function Verdict({ passed }: { passed: boolean }) {
  return passed ? <span className="pill pass">Pass</span> : <span className="pill fail">Fail</span>;
}

export function RunsPage({ index }: { index: RunIndex }) {
  const bench = useBenchmark();

  return (
    <>
      <div className="page-head">
      <h1>Runs</h1>
      <p className="lede">
        Each run probes the same Intents against a baseline and a candidate Variant and
        decides pass or fail from the Oracle on final app state.
      </p>
      </div>
      <div className="table-wrap">
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
      </div>

      {bench ? <BenchmarkSection bench={bench} /> : <p className="muted">Loading benchmark…</p>}
    </>
  );
}
