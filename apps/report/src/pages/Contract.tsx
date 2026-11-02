import { useEffect, useState } from "react";
import type { AgencyContract } from "@agencydiff/core";
import { loadContract } from "../data";
import { polarityLabel } from "../format";

function oracleText(oracle?: AgencyContract["intents"][number]["oracle"]): string {
  if (!oracle) return "Not specified (black-box target: success is agent-claimed).";
  return Object.entries(oracle)
    .map(([k, v]) => `${k} = ${JSON.stringify(v)}`)
    .join("\n");
}

export function ContractPage({ runId }: { runId: string }) {
  const [contract, setContract] = useState<AgencyContract | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setContract(null);
    setError(null);
    loadContract(runId).then(setContract, () => setError(`No contract stored for run ${runId}.`));
  }, [runId]);

  if (error) return <div className="error">{error}</div>;
  if (!contract) return <p className="muted">Loading contract…</p>;

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">Agency Contract · {contract.decision.replace(/_/g, " ")}</p>
        <h1 style={{ maxWidth: "30ch" }}>{contract.promise}</h1>
      </div>

      <h2>Decision</h2>
      <dl className="deflist">
        <dt>Name</dt>
        <dd>{contract.decision}</dd>
        <dt>Promise</dt>
        <dd>{contract.promise}</dd>
        {contract.defaultKey && (
          <>
            <dt>Default</dt>
            <dd>
              State key <code>{contract.defaultKey}</code>: the value before the person chooses.
            </dd>
          </>
        )}
      </dl>

      <h2>Intent Pairs</h2>
      <p className="lede">
        Each pair holds two opposing Intents on the same Decision so the cost of saying no can
        be compared against the cost of saying yes.
      </p>
      <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Saying yes</th>
            <th>Saying no (Protective)</th>
          </tr>
        </thead>
        <tbody>
          {contract.pairs.map((p) => (
            <tr key={`${p.accept}/${p.reject}`}>
              <td>{contract.intents.find((i) => i.id === p.accept)?.goal ?? p.accept}</td>
              <td>{contract.intents.find((i) => i.id === p.reject)?.goal ?? p.reject}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <h2>Intents</h2>
      {contract.intents.map((i) => (
        <div className="card" key={i.id}>
          <h3>{i.goal}</h3>
          <dl className="deflist">
            <dt>Kind</dt>
            <dd>
              {polarityLabel(i.polarity)}
              {i.polarity === "reject" && (
                <span className="muted"> — limits exposure, withdraws consent, or leaves</span>
              )}
            </dd>
            {i.fixture && (
              <>
                <dt>Starting state</dt>
                <dd>
                  <code>{i.fixture}</code>
                </dd>
              </>
            )}
            {i.target && (
              <>
                <dt>Target control</dt>
                <dd>
                  <code>{i.target}</code>{" "}
                  <span className="muted">(measured for visibility, never shown to the Probe)</span>
                </dd>
              </>
            )}
            <dt>Must succeed</dt>
            <dd>{i.mustSucceed ? "Yes — failure here fails the run" : "No"}</dd>
          </dl>
          <h3>Oracle</h3>
          <p className="muted" style={{ fontSize: 13.5 }}>
            Checked against the app&apos;s final state. The Probe&apos;s own claim never counts.
          </p>
          <pre className="oracle">{oracleText(i.oracle)}</pre>
        </div>
      ))}

      <h2>Invariants</h2>
      <p className="lede">
        Every number in this report is computed from recorded Traces. Nothing is asked of a
        model after the Probe runs: success comes from the Oracle, costs from counted actions,
        visibility from instrumentation the Probe never sees.
      </p>
    </>
  );
}
