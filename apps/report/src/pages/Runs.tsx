import { Table, proportional, type TableColumn } from "@astryxdesign/core/Table";
import { Badge } from "@astryxdesign/core/Badge";
import { type RunIndex } from "../data";
import { fmtDate } from "../format";
import { link } from "../App";
import { BenchmarkSection, useBenchmark } from "./Benchmark";

type Run = RunIndex["runs"][number];
interface RunRow extends Record<string, unknown> {
  id: string;
  run: Run;
}

const columns: TableColumn<RunRow>[] = [
  { key: "date", header: "Date", width: proportional(1.4), renderCell: (r) => <a href={link({ page: "diff", run: r.run.id })}>{fmtDate(r.run.date)}</a> },
  { key: "decision", header: "Decision", width: proportional(1.4), renderCell: (r) => <span className="mono">{r.run.decision}</span> },
  { key: "driver", header: "Driver", renderCell: (r) => <span className="mono">{r.run.driver}</span> },
  { key: "verdict", header: "Verdict", renderCell: (r) => <Badge variant={r.run.passed ? "success" : "error"} label={r.run.passed ? "Pass" : "Fail"} /> },
  { key: "traces", header: "Probes", align: "end", renderCell: (r) => <span className="mono">{r.run.traces}</span> },
  { key: "high", header: "High", align: "end", renderCell: (r) => <span className="mono">{r.run.findings.high}</span> },
  { key: "med", header: "Medium", align: "end", renderCell: (r) => <span className="mono">{r.run.findings.medium}</span> },
  { key: "low", header: "Low", align: "end", renderCell: (r) => <span className="mono">{r.run.findings.low}</span> },
];

export function RunsPage({ index }: { index: RunIndex }) {
  const bench = useBenchmark();
  return (
    <>
      <div className="page-head">
        <h1>Runs</h1>
        <p className="lede">
          Each run probes the same Intents against a baseline and a candidate Variant and decides pass or fail from the
          Oracle on final app state.
        </p>
      </div>
      <div className="table-block">
        <Table<RunRow> data={index.runs.map((run) => ({ id: run.id, run }))} columns={columns} idKey="id" density="spacious" hasHover />
      </div>
      {bench ? <BenchmarkSection bench={bench} /> : <p className="muted">Loading benchmark…</p>}
    </>
  );
}
