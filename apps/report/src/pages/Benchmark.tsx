import { useEffect, useState } from "react";
import { Table, proportional, type TableColumn } from "@astryxdesign/core/Table";
import { Badge } from "@astryxdesign/core/Badge";
import { loadBenchmark, type BenchMethod, type Benchmark as Bench, type SusPair } from "../data";
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
      {what}: pending. No results file was found when this site was built, so no numbers are shown.
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

interface MethodRow extends Record<string, unknown> {
  id: string;
  name: string;
  note: string;
  m: BenchMethod | null | undefined;
  lead?: boolean;
}

const methodColumns: TableColumn<MethodRow>[] = [
  {
    key: "name",
    header: "Method",
    width: proportional(2.4),
    renderCell: (r) => (
      <span>
        <strong style={{ fontWeight: 650 }}>{r.name}</strong>
        <br />
        <span className="muted" style={{ fontSize: 14 }}>
          {r.note}
        </span>
      </span>
    ),
  },
  {
    key: "caught",
    header: "Caught",
    width: proportional(1.4),
    renderCell: (r) =>
      r.m ? (
        <span className="bench-bar">
          <span className="track" aria-hidden>
            <span className={`fill ${r.lead ? "blue" : ratio(r.m.caught) < 0.25 ? "red" : ""}`} style={{ width: `${ratio(r.m.caught) * 100}%` }} />
          </span>
          <span className="mono">{r.m.caught}</span>
        </span>
      ) : (
        <span className="muted">pending</span>
      ),
  },
  { key: "fa", header: "False alarms", align: "end", renderCell: (r) => <span className="mono">{r.m?.falseAlarms ?? "—"}</span> },
  { key: "cost", header: "Cost per run", align: "end", renderCell: (r) => <span className="mono">{money(r.m?.costUsd)}</span> },
];

interface SusRow extends Record<string, unknown> {
  pair: string;
  p: SusPair;
}

const susColumns: TableColumn<SusRow>[] = [
  { key: "pattern", header: "Pattern", width: proportional(1.4), renderCell: (r) => <strong style={{ fontWeight: 650 }}>{r.p.pattern}</strong> },
  { key: "kind", header: "Kind", renderCell: (r) => <span className="muted">{r.p.control ? "Control" : "Injected"}</span> },
  {
    key: "result",
    header: "Result",
    renderCell: (r) => {
      const moved = r.p.detected || r.p.metricsMoved.length > 0;
      if (r.p.control) return moved ? <Badge variant="error" label="False alarm" /> : <Badge variant="neutral" label="Quiet" />;
      return r.p.detected ? <Badge variant="success" label="Detected" /> : <Badge variant="error" label="Missed" />;
    },
  },
  {
    key: "moved",
    header: "Metrics moved",
    width: proportional(1.6),
    renderCell: (r) => <span className="mono muted">{r.p.metricsMoved.join(", ") || "—"}</span>,
  },
];

export function BenchmarkSection({ bench }: { bench: Bench }) {
  const { summary, susbench } = bench;
  const walk = summary?.judge.walkthrough;
  const rows: MethodRow[] = summary
    ? [
        { id: "gate", name: "AgencyDiff replay gate", note: "Scripted Probes replay the baseline path on the candidate", m: summary.agencydiff.scripted, lead: true },
        { id: "hybrid", name: "Gate plus Muse cost probe", note: "Muse measures cost only where the gate fires", m: summary.agencydiff.hybrid },
        { id: "muse", name: "Muse computer-use Probes alone", note: "Free-roaming at k=3, noisy without the gate", m: summary.agencydiff.muse },
        { id: "walk", name: "Muse as judge, with a walkthrough", note: "Model opinion over every screen on the reference path", m: walk },
        { id: "first", name: "Muse as judge, start screens only", note: "What a reviewer sees in PR screenshots", m: summary.judge.firstScreens },
      ]
    : [];
  return (
    <>
      <div className="section-head">
        <h2 id="benchmark">Benchmark</h2>
        <a className="text-link" href={blob("eval/RESULTS.md")}>
          Method and per-seed results
        </a>
      </div>
      <p className="lede">
        26 seeded changes to Circle, each run in isolation and scored against ground truth: 20 regressions and 6 no-change
        controls. Caught means every Intent a seed should move was flagged; a false alarm means a control produced a Finding.
      </p>
      {!summary ? (
        <Pending what="Seeded benchmark (eval/results/summary.json)" />
      ) : (
        <div className="table-block">
          <Table<MethodRow> data={rows} columns={methodColumns} idKey="id" density="spacious" hasHover />
        </div>
      )}
      {walk?.consistencyK3 && (
        <p className="fig">
          Judge k=3 consistency: {fmtPct(walk.consistencyK3.agreement)} agreement over {walk.consistencyK3.pairs} verdicts (
          {walk.consistencyK3.seeds.join(", ")}).
        </p>
      )}

      <div className="section-head" style={{ marginTop: 72 }}>
        <h2 style={{ fontSize: 30 }}>SusBench-derived lab pages</h2>
        <a className="text-link" href={blob("docs/susbench.md")}>
          About this benchmark
        </a>
      </div>
      {!susbench ? (
        <Pending what="SusBench (eval/susbench/results.json)" />
      ) : (
        <>
          <div className="sus-stats">
            <div>
              <div className="v">
                {susbench.summary.detectedPairs}/{susbench.summary.injectedPairs}
              </div>
              <div className="k">Injected patterns detected</div>
            </div>
            <div>
              <div className="v">
                {susbench.summary.falseAlarms}/{susbench.summary.controlPairs}
              </div>
              <div className="k">Controls with a false alarm</div>
            </div>
            <div>
              <div className="v">k={susbench.repeats}</div>
              <div className="k">Repeats per Probe, {susbench.model}</div>
            </div>
          </div>
          <div className="table-block">
            <Table<SusRow>
              data={susbench.pairs.map((p, i) => ({ pair: `${p.pair}-${i}`, p }))}
              columns={susColumns}
              idKey="pair"
              density="compact"
              hasHover
            />
          </div>
        </>
      )}
    </>
  );
}
