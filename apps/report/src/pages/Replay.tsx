import { useEffect, useMemo, useState } from "react";
import type { AgencyContract, AgencyReport, Trace } from "@agencydiff/core";
import { loadContract, loadReport, loadTrace, samUrl, shotUrl } from "../data";
import { shotList } from "../format";
import { paneAtStep } from "../live";
import { Delta, Phone, VisDelta, stepCaption } from "../components";

interface Pane {
  trace: Trace;
  shots: string[];
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
  const [report, setReport] = useState<AgencyReport | null>(null);
  const [panes, setPanes] = useState<{ baseline?: Pane; candidate?: Pane }>({});
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);
  const [overlaySeen, setOverlaySeen] = useState(false);
  const [overlayBroken, setOverlayBroken] = useState<Record<string, boolean>>({});

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
        const rep = await loadReport(runId);
        if (live) setReport(rep);
        const pick = async (variant: "baseline" | "candidate"): Promise<Pane | undefined> => {
          const agg = rep.aggregates.find((a) => a.intentId === activeIntent && a.variant === variant);
          if (!agg || agg.traceIds.length === 0) return undefined;
          const preferred = traceParam && variantParam === variant ? traceParam : agg.traceIds.slice().sort()[0];
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
    const t = window.setTimeout(() => setStep((s) => Math.min(s + 1, maxStep)), 1100);
    return () => window.clearTimeout(t);
  }, [playing, step, maxStep]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "SELECT" || tag === "INPUT" || tag === "BUTTON") return;
      if (e.key === "ArrowRight") { setPlaying(false); setStep((s) => Math.min(s + 1, maxStep)); }
      else if (e.key === "ArrowLeft") { setPlaying(false); setStep((s) => Math.max(0, s - 1)); }
      else if (e.code === "Space") { e.preventDefault(); if (step >= maxStep) setStep(0); setPlaying((p) => !p); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [maxStep, step]);

  const goal = intents.find((i) => i.id === activeIntent)?.goal;
  const agg = (v: "baseline" | "candidate") => report?.aggregates.find((a) => a.intentId === activeIntent && a.variant === v);
  const findings = report?.findings.filter((f) => f.intentId === activeIntent) ?? [];
  const done = step >= maxStep && maxStep > 0;

  const side = (v: "baseline" | "candidate") => {
    const pane = panes[v];
    const view = paneAtStep(pane?.trace, step);
    const shot = pane ? (view.screenshot ?? pane.shots[0]) : undefined;
    const key = pane ? `${pane.trace.id}/${shot}` : "";
    const finished = pane && view.current >= pane.trace.steps.length;
    return (
      <div className="side pane" key={v}>
        <div className={`phone-label ${v}`}>
          <span className="name">{v === "baseline" ? "Baseline" : "Candidate"}</span>
          <span className="step-note">
            {pane ? `Step ${view.current} of ${pane.trace.steps.length}` : ""}
          </span>
        </div>
        <Phone
          src={pane && shot ? shotUrl(runId, pane.trace.id, shot) : undefined}
          alt={`${v} step ${view.current}`}
          actions={pane?.trace.steps[view.current]?.actions ?? []}
          tick={`${pane?.trace.id}-${view.current}`}
          overlay={pane && shot && showOverlay && !overlayBroken[key] ? samUrl(runId, pane.trace.id, shot) : undefined}
          onOverlayError={() => setOverlayBroken((m) => ({ ...m, [key]: true }))}
          onOverlayLoad={() => setOverlaySeen(true)}
        >
          No Trace recorded for this Variant.
        </Phone>
        <div className="phone-caption">
          {pane ? (
            <>
              <strong>{stepCaption(pane.trace, view.current)}</strong>
              {finished && (
                <>
                  <br />
                  {pane.trace.oracle.passed ? (
                    <span className="pill pass" style={{ marginTop: 8 }}>Oracle passed</span>
                  ) : (
                    <span className="pill fail" style={{ marginTop: 8 }}>Oracle failed</span>
                  )}
                </>
              )}
            </>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="page-head compact">
        <p className="eyebrow">Replay · {contract?.decision?.replace(/_/g, " ") ?? runId}</p>
        <h1 style={{ maxWidth: "26ch" }}>{goal ?? "Replay"}</h1>
        <p className="lede" style={{ marginBottom: 0 }}>
          The same Intent on both Variants, step by step. Each tap is drawn on the screen where
          it happened{overlaySeen ? ", with SAM segment overlays where the runner stored them" : ""}.
        </p>
      </div>

      <div className="intent-select">
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
      {!error && !panes.baseline && !panes.candidate && <p className="muted">Loading Traces…</p>}

      {(panes.baseline || panes.candidate) && (
        <>
          <div className="toolbar" role="group" aria-label="Playback">
            <button onClick={() => { setPlaying(false); setStep(0); }} disabled={step === 0}>
              Start
            </button>
            <button onClick={() => { setPlaying(false); setStep((s) => Math.max(0, s - 1)); }} disabled={step === 0}>
              Back
            </button>
            <button
              className="primary"
              onClick={() => {
                if (step >= maxStep) setStep(0);
                setPlaying((p) => !p);
              }}
            >
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
            <span className="grow">
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
            </span>
            <label>
              <input type="checkbox" checked={showOverlay} onChange={(e) => setShowOverlay(e.target.checked)} />
              Segment overlays
            </label>
          </div>

          <div className="stage replay-stage">
            {side("baseline")}
            <div className="stage-mid">
              <div className="counter">
                <div className="k">Steps taken</div>
                <div className="row">
                  <span>Baseline</span>
                  <b className="tick" key={`b${Math.min(step, panes.baseline?.trace.steps.length ?? 0)}`}>
                    {Math.min(step, panes.baseline?.trace.steps.length ?? 0)}
                  </b>
                </div>
                <div className="row cand">
                  <span>Candidate</span>
                  <b className="tick" key={`c${Math.min(step, panes.candidate?.trace.steps.length ?? 0)}`}>
                    {Math.min(step, panes.candidate?.trace.steps.length ?? 0)}
                  </b>
                </div>
              </div>
              {report && done && (
                <div className={`finding-card ${findings.length ? "" : "ok"}`}>
                  <h4>{findings.length ? `${findings.length} Finding${findings.length === 1 ? "" : "s"}` : "No Finding"}</h4>
                  <dl>
                    <div>
                      <dt>Steps needed (median)</dt>
                      <dd>
                        <Delta b={agg("baseline")?.actionCount} c={agg("candidate")?.actionCount} />
                      </dd>
                    </div>
                    <div>
                      <dt>On the first screen</dt>
                      <dd>
                        <VisDelta b={agg("baseline")?.initiallyVisible} c={agg("candidate")?.initiallyVisible} />
                      </dd>
                    </div>
                    <div>
                      <dt>Success rate</dt>
                      <dd>
                        <Delta
                          b={agg("baseline")?.successRate}
                          c={agg("candidate")?.successRate}
                          higherIsBetter
                          fmt={(v) => (typeof v === "number" ? `${Math.round(v * 100)}%` : "—")}
                        />
                      </dd>
                    </div>
                  </dl>
                </div>
              )}
              {!done && (
                <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                  Play or step through. The Finding appears when both Traces finish. Keys: ← → step, Space play.
                </p>
              )}
            </div>
            {side("candidate")}
          </div>
        </>
      )}
    </>
  );
}
