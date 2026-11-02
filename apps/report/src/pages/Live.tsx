import { useEffect, useMemo, useRef, useState } from "react";
import type { AgencyContract, AgencyReport, LiveEvent, Trace, Variant } from "@agencydiff/core";
import { loadContract, loadReport, loadTrace, samUrl, shotUrl } from "../data";
import { shotList } from "../format";
import { findingLines, initialLiveState, nextSpeed, paneAtStep, reduceLiveEvent, replayMaxStep, SPEEDS, type LiveState } from "../live";
import { Phone, stepCaption, stepNote } from "../components";
import { useTheme } from "../App";

export function LivePage({ runId, intent, liveUrl, source }: { runId: string; intent?: string; liveUrl?: string; source?: string }) {
  const isLive = source === "live";
  const liveBase = (liveUrl ?? "http://localhost:5175").replace(/\/$/, "");
  const [contract, setContract] = useState<AgencyContract | null>(null);
  const [report, setReport] = useState<AgencyReport | null>(null);
  const [traces, setTraces] = useState<{ baseline?: Trace; candidate?: Trace }>({});
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showOverlay, setShowOverlay] = useState(true);
  const [, toggleTheme] = useTheme();
  const [liveState, setLiveState] = useState<LiveState>(initialLiveState);
  const [liveError, setLiveError] = useState<string | null>(null);
  const stateRef = useRef(liveState);
  stateRef.current = liveState;

  const intents = contract?.intents ?? [];
  const activeIntent = intent ?? liveState.intentId ?? intents[0]?.id;
  const goal = liveState.goal ?? intents.find((i) => i.id === activeIntent)?.goal ?? activeIntent ?? "Live probes";

  useEffect(() => { if (!isLive) loadContract(runId).then(setContract, () => setContract(null)); }, [runId, isLive]);

  useEffect(() => {
    if (isLive || !activeIntent) return;
    let live = true;
    (async () => {
      try {
        const [c, r] = await Promise.all([loadContract(runId), loadReport(runId)]);
        if (!live) return;
        setContract(c); setReport(r);
        const pick = async (v: Variant) => {
          const agg = r.aggregates.find((a) => a.intentId === activeIntent && a.variant === v);
          if (!agg?.traceIds.length) return undefined;
          return loadTrace(runId, agg.traceIds.slice().sort()[0]);
        };
        const [baseline, candidate] = await Promise.all([pick("baseline"), pick("candidate")]);
        if (live) { setTraces({ baseline, candidate }); setStep(0); }
      } catch { /* run picker shows empty state */ }
    })();
    return () => { live = false; };
  }, [runId, activeIntent, isLive]);

  useEffect(() => {
    if (!isLive) return;
    setLiveError(null);
    const es = new EventSource(`${liveBase}/events`);
    es.onmessage = (m) => { try { const e = JSON.parse(m.data) as LiveEvent; setLiveState((s) => reduceLiveEvent(s, e, liveBase)); } catch { /* ignore */ } };
    const named = (type: string) => es.addEventListener(type, (m) => { try { const e = JSON.parse((m as MessageEvent).data) as LiveEvent; setLiveState((s) => reduceLiveEvent(s, e, liveBase)); } catch { /* ignore */ } });
    ["run_started","probe_started","step_started","screenshot","action","oracle_result","probe_finished","finding","run_finished"].forEach(named);
    es.onerror = () => setLiveError(`Cannot reach live runner at ${liveBase}. Start one with pnpm diff --live, or switch to Replay.`);
    return () => es.close();
  }, [isLive, liveBase]);

  const maxStep = useMemo(() => replayMaxStep([traces.baseline, traces.candidate]), [traces]);
  const bothDone = isLive ? liveState.panes.baseline.finished && liveState.panes.candidate.finished : step >= maxStep && maxStep > 0;
  const showFinding = bothDone && (isLive ? liveState.findings.length > 0 || liveState.finished : !!report);

  useEffect(() => {
    if (!playing || isLive) return;
    if (step >= maxStep) { setPlaying(false); return; }
    const t = window.setTimeout(() => setStep((s) => Math.min(s + 1, maxStep)), 1100 / speed);
    return () => window.clearTimeout(t);
  }, [playing, step, maxStep, speed, isLive]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "SELECT" || (e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.code === "Space") { e.preventDefault(); if (step >= maxStep) setStep(0); setPlaying((p) => !p); }
      else if (e.key === "ArrowRight") { e.preventDefault(); setPlaying(false); setStep((s) => Math.min(s + 1, maxStep)); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); setPlaying(false); setStep((s) => Math.max(0, s - 1)); }
      else if (e.key === "Home") { e.preventDefault(); setStep(0); }
      else if (e.key === "End") { e.preventDefault(); setStep(maxStep); }
      else if (e.key === "o" || e.key === "O") setShowOverlay((v) => !v);
      else if (e.key === "t" || e.key === "T") toggleTheme();
      else if (e.key === "s" || e.key === "S") setSpeed((v) => nextSpeed(v));
      else if (["1", "2", "4"].includes(e.key)) setSpeed(Number(e.key));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [maxStep, step]);

  const lines = report && activeIntent ? findingLines(report, activeIntent, { baseline: traces.baseline?.steps.length, candidate: traces.candidate?.steps.length }) : [];
  const liveLines = liveState.findings.map((f) => ({ label: f.title, text: `${String(f.baseline)} → ${String(f.candidate)}` }));

  const renderPane = (variant: Variant) => {
    const label = variant === "baseline" ? "Baseline" : "Candidate";
    if (isLive) {
      const p = liveState.panes[variant];
      return (
        <div className="side pane live-pane" key={variant}>
          <div className={`phone-label ${variant}`}><span className="name">{label}</span><span className="step-note live-stepcount" key={p.step}>Step {p.step}</span></div>
          <Phone src={p.screenshotUrl} alt={`${variant} step ${p.step}`} actions={p.actions} tick={`${p.traceId}-${p.step}`}>Waiting for Probe…</Phone>
          <div className="phone-caption"><strong>{p.finished ? `Oracle ${p.oraclePassed === undefined ? "not checked" : p.oraclePassed ? "passed" : "failed"}` : p.step === 0 ? "Starting screen" : `Step ${p.step}${stepNote(p.note) ? ` · ${stepNote(p.note)}` : ""}`}</strong></div>
        </div>
      );
    }
    const trace = traces[variant];
    const view = paneAtStep(trace, step);
    const shots = trace ? shotList(trace) : [];
    const shot = view.screenshot ?? shots[0];
    const decisive = trace && showFinding;
    const finished = trace && view.current >= trace.steps.length;
    return (
      <div className="side pane live-pane" key={variant}>
        <div className={`phone-label ${variant}`}><span className="name">{label}</span><span className="step-note">Step {view.current} of {trace?.steps.length ?? 0}</span></div>
        <Phone
          src={trace && shot ? shotUrl(runId, trace.id, shot) : undefined}
          alt={`${variant} step ${view.current}`}
          actions={trace?.steps[view.current]?.actions ?? []}
          tick={`${trace?.id}-${view.current}`}
          overlay={trace && decisive && showOverlay && variant === "candidate" ? samUrl(runId, trace.id, shots[shots.length - 1]) : undefined}
          onOverlayError={() => setShowOverlay(false)}
        >No Trace for this Variant.</Phone>
        <div className="phone-caption">
          <strong>{trace ? stepCaption(trace, view.current) : ""}</strong>
          {finished && trace && <><br /><span className={`pill ${trace.oracle.passed ? "pass" : "fail"}`} style={{ marginTop: 8 }}>Oracle {trace.oracle.passed ? "passed" : "failed"}</span></>}
        </div>
      </div>
    );
  };

  const counts = isLive
    ? { b: liveState.panes.baseline.step, c: liveState.panes.candidate.step }
    : { b: Math.min(step, traces.baseline?.steps.length ?? 0), c: Math.min(step, traces.candidate?.steps.length ?? 0) };
  const shownLines = isLive ? liveLines : lines;

  return (
    <div className="live-page">
      <div className="live-head">
        <h1>{goal}</h1>
      </div>
      {!isLive && (
        <div className="intent-select">
          <label htmlFor="live-intent">Intent</label>
          <select id="live-intent" value={activeIntent ?? ""} onChange={(e) => { window.location.hash = `#/live?run=${runId}&intent=${e.target.value}`; setStep(0); }}>{intents.map((i) => <option key={i.id} value={i.id}>{i.goal}</option>)}</select>
        </div>
      )}
      <div className="toolbar" role="group" aria-label="Playback">
        {!isLive && <>
          <button onClick={() => { setPlaying(false); setStep(0); }} disabled={step === 0}>Start</button>
          <button onClick={() => { setPlaying(false); setStep((s) => Math.max(0, s - 1)); }} disabled={step === 0}>Back</button>
          <button className="primary" onClick={() => { if (step >= maxStep) setStep(0); setPlaying((p) => !p); }}>{playing ? "Pause" : step >= maxStep ? "Replay" : "Play"}</button>
          <button onClick={() => { setPlaying(false); setStep((s) => Math.min(s + 1, maxStep)); }} disabled={step >= maxStep}>Next</button>
          <span className="grow"><input type="range" min={0} max={maxStep} value={step} aria-label="Playback step" onChange={(e) => { setPlaying(false); setStep(Number(e.target.value)); }} /><span className="step-note">Step {step} of {maxStep}</span></span>
        </>}
        <label>Speed <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} style={{ height: 32, padding: "4px 30px 4px 12px" }}>{SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}</select></label>
        <label><input type="checkbox" checked={showOverlay} onChange={(e) => setShowOverlay(e.target.checked)} /> SAM overlay</label>
        <a className="live-mode" href={isLive ? `#/live?run=${runId}&intent=${activeIntent ?? ""}` : `#/live?run=${runId}&intent=${activeIntent ?? ""}&source=live&live=${encodeURIComponent(liveBase)}`}>{isLive ? "Replay mode" : "Live mode"}</a>
      </div>
      <p className="keys"><kbd>Space</kbd> play · <kbd>←</kbd> <kbd>→</kbd> step · <kbd>Home</kbd> <kbd>End</kbd> jump · <kbd>S</kbd> speed · <kbd>O</kbd> overlay · <kbd>T</kbd> theme</p>
      {liveError && <div className="error">{liveError}</div>}
      <div className="stage replay-stage live-stage">
        {renderPane("baseline")}
        <div className="stage-mid">
          <div className="counter">
            <div className="k">Steps taken</div>
            <div className="row"><span>Baseline</span><b className="tick" key={`b${counts.b}`}>{counts.b}</b></div>
            <div className="row cand"><span>Candidate</span><b className="tick" key={`c${counts.c}`}>{counts.c}</b></div>
          </div>
          {showFinding && (
            <section className={`finding-card live-finding ${shownLines.length ? "" : "ok"}`} aria-live="polite">
              <h4>Finding</h4>
              {shownLines.length === 0 && <p style={{ margin: 0 }}>No Finding for this Intent. Both Variants cost the same.</p>}
              <dl>{shownLines.slice(0, 3).map((l) => <div key={l.label}><dt>{l.label}</dt><dd className="tnum" style={{ fontWeight: 750 }}>{l.text}</dd></div>)}</dl>
            </section>
          )}
          {!showFinding && <p className="muted" style={{ fontSize: 13, margin: 0 }}>{isLive ? "Success is decided by the Oracle on final state, never the agent's claim." : "Press Play. The Finding slides in when both Traces finish."}</p>}
        </div>
        {renderPane("candidate")}
      </div>
    </div>
  );
}
