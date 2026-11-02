import { useEffect, useState } from "react";
import { loadBenchmark, type BenchMethod, type Benchmark as Bench } from "../data";
import { fmtPct } from "../format";
import { blob } from "../components";

export function useBenchmark(): Bench | undefined {
  const [bench, setBench] = useState<Bench | undefined>(undefined);
  useEffect(() => {
    loadBenchmark().then(setBench, () => setBench({ summary: null, susbench: null, agentPrs: null }));
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

/** "19/20" -> 0.95, for the inline bar. */
function ratio(s?: string): number {
  const m = s?.match(/^(\d+)\s*\/\s*(\d+)$/);
  return m && Number(m[2]) > 0 ? Number(m[1]) / Number(m[2]) : 0;
}

function money(v?: number): string {
  if (typeof v !== "number") return "—";
  return v === 0 ? "$0" : `$${v.toFixed(2)}`;
}

function Row({ name, note, m, highlight }: { name: string; note: string; m?: BenchMethod | null; highlight?: boolean }) {
  if (!m) {
    return (
      <tr>
        <td>
          <strong>{name}</strong>
          <br />
          <span className="muted">{note}</span>
        </td>
        <td className="num" colSpan={3}>
          pending
        </td>
      </tr>
    );
  }
  const r = ratio(m.caught);
  return (
    <tr className={highlight ? "highlight" : undefined}>
      <td>
        <strong>{name}</strong>
        <br />
        <span className="muted">{note}</span>
      </td>
      <td className="num">
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
          <span className="bars" style={{ margin: 0, width: 96 }} aria-hidden>
            <span className="track" style={{ display: "block" }}>
              <span className={`fill ${r >= 0.9 ? "blue" : r < 0.25 ? "red" : ""}`} style={{ display: "block", width: `${r * 100}%` }} />
            </span>
          </span>
          <strong>{m.caught}</strong>
        </span>
      </td>
      <td className="num">{m.falseAlarms}</td>
      <td className="num">{money(m.costUsd)}</td>
    </tr>
  );
}

export function BenchmarkSection({ bench }: { bench: Bench }) {
  const { summary, susbench } = bench;
  const walk = summary?.judge.walkthrough;
  return (
    <>
      <div className="section-head">
        <h2 id="benchmark">Benchmark</h2>
        <a className="text-link" href={blob("eval/RESULTS.md")}>
          Method and per-seed results →
        </a>
      </div>
      <p className="lede">
        26 seeded changes to Circle, each run in isolation and scored against ground truth: 20
        regressions and 6 no-change controls. Caught means every Intent a seed should move was
        flagged; a false alarm means a control produced a Finding.
      </p>
      {!summary ? (
        <Pending what="Seeded benchmark (eval/results/summary.json)" />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Method</th>
                <th className="num">Caught</th>
                <th className="num">False alarms</th>
                <th className="num">Cost per run</th>
              </tr>
            </thead>
            <tbody>
              <Row
                highlight
                name="AgencyDiff replay gate"
                note="Scripted Probes replay the baseline path on the candidate"
                m={summary.agencydiff.scripted}
              />
              <Row
                name="Hybrid: gate + Muse cost probe"
                note="Muse measures cost only where the gate fires"
                m={summary.agencydiff.hybrid}
              />
              <Row
                name="Muse computer-use Probes alone"
                note="Free-roaming, k=3; noisy without the gate"
                m={summary.agencydiff.muse}
              />
              <Row
                name="Muse as judge, with a walkthrough"
                note="Model opinion over every screen on the reference path"
                m={walk}
              />
              <Row
                name="Muse as judge, first screens"
                note="What a reviewer sees in PR screenshots"
                m={summary.judge.firstScreens}
              />
            </tbody>
          </table>
        </div>
      )}
      {walk?.consistencyK3 && (
        <p className="muted" style={{ fontSize: 13.5 }}>
          Judge k=3 consistency: {fmtPct(walk.consistencyK3.agreement)} agreement over{" "}
          {walk.consistencyK3.pairs} verdicts ({walk.consistencyK3.seeds.join(", ")}).
        </p>
      )}

      <div className="section-head">
        <h3 style={{ fontSize: 20, marginTop: 48 }}>SusBench-derived lab pages</h3>
        <a className="text-link" href={blob("docs/susbench.md")}>
          About this benchmark →
        </a>
      </div>
      {!susbench ? (
        <Pending what="SusBench (eval/susbench/results.json)" />
      ) : (
        <>
          <div className="stat-row">
            <div className="stat">
              <div className="v">
                {susbench.summary.detectedPairs}/{susbench.summary.injectedPairs}
              </div>
              <div className="k">Injected patterns detected</div>
            </div>
            <div className="stat">
              <div className="v">
                {susbench.summary.falseAlarms}/{susbench.summary.controlPairs}
              </div>
              <div className="k">False alarms on controls</div>
            </div>
            <div className="stat">
              <div className="v">k={susbench.repeats}</div>
              <div className="k">Repeats per Probe · {susbench.model}</div>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Pattern</th>
                  <th>Kind</th>
                  <th>Result</th>
                  <th>Metrics moved</th>
                </tr>
              </thead>
              <tbody>
                {susbench.pairs.map((p) => (
                  <tr key={p.pair}>
                    <td>
                      <strong>{p.pattern}</strong>
                    </td>
                    <td className="muted">{p.control ? "Control" : "Injected"}</td>
                    <td>
                      {p.control ? (
                        p.detected || p.metricsMoved.length > 0 ? (
                          <span className="pill fail">False alarm</span>
                        ) : (
                          <span className="pill unchanged">Quiet</span>
                        )
                      ) : p.detected ? (
                        <span className="pill pass">Detected</span>
                      ) : (
                        <span className="pill fail">Missed</span>
                      )}
                    </td>
                    <td className="muted">{p.metricsMoved.join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
