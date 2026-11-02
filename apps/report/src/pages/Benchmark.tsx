import { useEffect, useState } from "react";
import { loadBenchmark, type Benchmark as Bench } from "../data";
import { fmtPct } from "../format";

export function useBenchmark(): Bench | undefined {
  const [bench, setBench] = useState<Bench | undefined>(undefined);
  useEffect(() => {
    loadBenchmark().then(setBench, () => setBench({ summary: null, susbench: null }));
  }, []);
  return bench;
}

function Pending({ what }: { what: string }) {
  return (
    <div className="notice">
      {what}: pending. No results file was found when this site was built, so no numbers are
      shown.
    </div>
  );
}

export function BenchmarkSection({ bench }: { bench: Bench }) {
  const { summary, susbench } = bench;
  return (
    <>
      <h2>Benchmark</h2>
      <p className="lede">
        Seeded regressions in Circle, scored against ground truth. Caught means every Intent a
        seed should move was flagged; a false alarm means a no-change control produced a
        Finding.
      </p>
      {!summary ? (
        <Pending what="Seeded benchmark (eval/results/summary.json)" />
      ) : (
        <table>
          <thead>
            <tr>
              <th>Method</th>
              <th className="num">Caught</th>
              <th className="num">False alarms</th>
              <th className="num">Cost</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>AgencyDiff, scripted Probes</td>
              <td className="num">{summary.agencydiff.scripted.caught}</td>
              <td className="num">{summary.agencydiff.scripted.falseAlarms}</td>
              <td className="num">${summary.agencydiff.scripted.costUsd.toFixed(2)}</td>
            </tr>
            <tr>
              <td>AgencyDiff, Muse Probes</td>
              {summary.agencydiff.muse ? (
                <>
                  <td className="num">{summary.agencydiff.muse.caught}</td>
                  <td className="num">{summary.agencydiff.muse.falseAlarms}</td>
                  <td className="num">${summary.agencydiff.muse.costUsd.toFixed(2)}</td>
                </>
              ) : (
                <td className="num" colSpan={3}>
                  pending
                </td>
              )}
            </tr>
            <tr>
              <td>Muse as judge (model opinion)</td>
              <td className="num">{summary.judge.caught}</td>
              <td className="num">{summary.judge.falseAlarms}</td>
              <td className="num">${summary.judge.costUsd.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      )}
      {summary?.judge.consistencyK3 && (
        <p className="muted">
          Judge k=3 consistency: {fmtPct(summary.judge.consistencyK3.agreement)} agreement over{" "}
          {summary.judge.consistencyK3.pairs} verdicts ({summary.judge.consistencyK3.seeds.join(", ")}).
        </p>
      )}

      <h3>SUSBench snapshots</h3>
      {!susbench ? (
        <Pending what="SUSBench (eval/susbench/results.json)" />
      ) : (
        <>
          <div className="stat-row">
            <div className="stat">
              <div className="v">
                {susbench.summary.detectedPairs}/{susbench.summary.injectedPairs}
              </div>
              <div className="k">Injected pairs detected</div>
            </div>
            <div className="stat">
              <div className="v">{susbench.summary.falseAlarms}</div>
              <div className="k">False alarms on {susbench.summary.controlPairs} controls</div>
            </div>
            <div className="stat">
              <div className="v">{susbench.repeats}</div>
              <div className="k">Repeats per Probe (model: {susbench.model})</div>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Pattern</th>
                <th>Kind</th>
                <th>Detected</th>
                <th>Metrics moved</th>
              </tr>
            </thead>
            <tbody>
              {susbench.pairs.map((p) => (
                <tr key={p.pair}>
                  <td>{p.pattern}</td>
                  <td>{p.control ? "Control" : "Injected"}</td>
                  <td>
                    {p.detected ? (
                      <span className="pill pass">Detected</span>
                    ) : (
                      <span className="pill fail">Missed</span>
                    )}
                  </td>
                  <td>{p.metricsMoved.join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
