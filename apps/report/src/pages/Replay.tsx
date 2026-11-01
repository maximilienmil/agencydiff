import { useEffect, useMemo, useState } from "react";
import type { AgencyContract, Trace } from "@agencydiff/core";
import { loadContract, loadReport, loadTrace, samUrl, shotUrl } from "../data";
import { actionLabel, shotList } from "../format";

const W = 430;
const H = 860;

interface Pane {
  trace: Trace;
  shots: string[];
}

function Markers({ trace, step }: { trace: Trace; step: number }) {
  if (step === 0) return null;
  const s = trace.steps[Math.min(step, trace.steps.length) - 1];
  if (!s) return null;
  return (
    <svg className="markers" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      {s.actions.map((a, i) => {
        if (a.type === "click" || a.type === "double_click") {
          return (
            <g key={i}>
              <circle cx={a.x} cy={a.y} r={26} fill="none" stroke="#e8b10e" strokeWidth={5} />
              <circle cx={a.x} cy={a.y} r={5} fill="#e8b10e" />
            </g>
          );
        }
        if (a.type === "drag") {
          const pts = a.path.map((p) => `${p.x},${p.y}`).join(" ");
          return <polyline key={i} points={pts} fill="none" stroke="#e8b10e" strokeWidth={5} />;
        }
        if (a.type === "scroll") {
          return (
            <g key={i}>
              <circle cx={a.x} cy={a.y} r={26} fill="none" stroke="#e8b10e" strokeWidth={5} />
              <line x1={a.x} y1={a.y - 14} x2={a.x} y2={a.y + 14} stroke="#e8b10e" strokeWidth={5} />
            </g>
          );
        }
        return null;
      })}
    </svg>
  );
}

function Shot({
  runId,
  trace,
  step,
  showOverlay,
  onOverlayResult,
}: {
  runId: string;
  trace: Trace;
  step: number;
  showOverlay: boolean;
  onOverlayResult: (ok: boolean) => void;
}) {
  const shots = shotList(trace);
  const shot = shots[Math.min(step, shots.length - 1)];
  const [overlayOk, setOverlayOk] = useState(true);
  useEffect(() => setOverlayOk(true), [runId, trace.id, step]);
  return (
    <div className="shot">
      <img src={shotUrl(runId, trace.id, shot)} alt={`Step ${step} screenshot`} />
      {showOverlay && overlayOk && (
        <img
          className="overlay"
          src={samUrl(runId, trace.id, shot)}
          alt=""
          onLoad={() => onOverlayResult(true)}
          onError={() => {
            setOverlayOk(false);
            onOverlayResult(false);
          }}
        />
      )}
      <Markers trace={trace} step={step} />
    </div>
  );
}

function caption(trace: Trace, step: number): string {
  if (step === 0) return "Starting screen, before the Probe acts.";
  const s = trace.steps[Math.min(step, trace.steps.length) - 1];
  if (!s) return "";
  const bits = [`Step ${s.index + 1}: ${actionLabel(s.actions)}`];
  if (s.note) bits.push(` — ${s.note}`);
  return bits.join("");
}

export function ReplayPage({
  runId,
  intent,
  trace: traceParam,
  variant: variantParam,
}: {
  runId: string;
  intent?: string;
  trace?: string;
  variant?: string;
}) {
  const [contract, setContract] = useState<AgencyContract | null>(null);
  const [panes, setPanes] = useState<{ baseline?: Pane; candidate?: Pane }>({});
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);
  const [overlaySeen, setOverlaySeen] = useState(false);

  const intents = contract?.intents ?? [];
  const activeIntent = intent ?? intents[0]?.id;

  useEffect(() => {
    loadContract(runId).then(setContract, () => setContract(null));
  }, [runId]);

  useEffect(() => {
    setError(null);
    setPanes({});
    setStep(0);
    setPlaying(false);
    if (!activeIntent) return;
    let live = true;
    (async () => {
      try {
        const report = await loadReport(runId);
        const pick = async (variant: "baseline" | "candidate"): Promise<Pane | undefined> => {
          const agg = report.aggregates.find(
            (a) => a.intentId === activeIntent && a.variant === variant,
          );
          if (!agg || agg.traceIds.length === 0) return undefined;
          const preferred =
            traceParam && variantParam === variant
              ? traceParam
              : agg.traceIds.slice().sort()[0];
          const id = agg.traceIds.includes(preferred) ? preferred : agg.traceIds[0];
          const trace = await loadTrace(runId, id);
          return { trace, shots: shotList(trace) };
        };
        const [baseline, candidate] = await Promise.all([pick("baseline"), pick("candidate")]);
        if (live) setPanes({ baseline, candidate });
      } catch (e) {
        if (live) setError(String(e));
      }
    })();
    return () => {
      live = false;
    };
  }, [runId, activeIntent, traceParam, variantParam]);

  const maxStep = useMemo(
    () => Math.max(panes.baseline?.shots.length ?? 1, panes.candidate?.shots.length ?? 1) - 1,
    [panes],
  );

  useEffect(() => {
    if (!playing) return;
    if (step >= maxStep) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(() => setStep((s) => Math.min(s + 1, maxStep)), 1200);
    return () => window.clearTimeout(t);
  }, [playing, step, maxStep]);

  const goal = intents.find((i) => i.id === activeIntent)?.goal;

  return (
    <>
      <h1>Replay</h1>
      <p className="lede">
        Side-by-side Trace playback for one Intent: the same Probe steps against the baseline
        and the candidate Variant, with each action drawn on its screenshot
        {overlaySeen ? " and segment overlays where the runner stored them" : ""}. Both panes
        advance together.
      </p>

      <div className="run-picker">
        <label htmlFor="intent">Intent</label>
        <select
          id="intent"
          value={activeIntent ?? ""}
          onChange={(e) => {
            window.location.hash = `#/replay?run=${runId}&intent=${e.target.value}`;
            setStep(0);
          }}
        >
          {intents.map((i) => (
            <option key={i.id} value={i.id}>
              {i.goal}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="error">{error}</div>}
      {!error && !panes.baseline && !panes.candidate && <p className="muted">Loading traces…</p>}

      {(panes.baseline || panes.candidate) && (
        <>
          <div className="controls">
            <button onClick={() => setStep(0)} disabled={step === 0}>
              Start
            </button>
            <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              Back
            </button>
            <button onClick={() => setPlaying((p) => !p)}>
              {playing ? "Pause" : step >= maxStep ? "Replay" : "Play"}
            </button>
            <button
              onClick={() => {
                setPlaying(false);
                setStep((s) => Math.min(s + 1, maxStep));
              }}
              disabled={step >= maxStep}
            >
              Next
            </button>
            <input
              type="range"
              min={0}
              max={maxStep}
              value={step}
              aria-label="Playback step"
              onChange={(e) => {
                setPlaying(false);
                setStep(Number(e.target.value));
              }}
            />
            <span className="step-note">
              Step {step} of {maxStep}
            </span>
            <label className="step-note" style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={showOverlay}
                onChange={(e) => setShowOverlay(e.target.checked)}
              />
              Segment overlays
            </label>
          </div>

          <div className="replay-stage">
            {(["baseline", "candidate"] as const).map((v) => {
              const pane = panes[v];
              return (
                <div className="pane" key={v}>
                  <header>
                    <span>{v === "baseline" ? "Baseline" : "Candidate"}</span>
                    <span>{goal ?? activeIntent}</span>
                  </header>
                  {pane ? (
                    <>
                      <Shot
                        runId={runId}
                        trace={pane.trace}
                        step={step}
                        showOverlay={showOverlay}
                        onOverlayResult={(ok) => ok && setOverlaySeen(true)}
                      />
                      <div className="caption">
                        <strong>{pane.trace.id}</strong>
                        <br />
                        {caption(pane.trace, step)}
                      </div>
                    </>
                  ) : (
                    <div className="caption">No successful Trace for this Variant.</div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
