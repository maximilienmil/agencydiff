import { useEffect, useMemo, useRef, useState } from "react";
import type { AgencyContract, AgencyReport, LiveEvent, Trace, Variant } from "@agencydiff/core";
import { loadContract, loadReport, loadTrace, samUrl, shotUrl } from "../data";
import { actionLabel, shotList } from "../format";
import { cursorFor, findingLines, initialLiveState, nextSpeed, paneAtStep, reduceLiveEvent, replayMaxStep, SPEEDS, type LiveState } from "../live";

const W = 430;
const H = 860;

function Cursor({ actions, tick }: { actions: Trace["steps"][number]["actions"]; tick: string }) {
  const c = cursorFor(actions);
  if (!c) return null;
  return (
    <div key={tick} className="live-cursor" style={{ left: `${(c.x / W) * 100}%`, top: `${(c.y / H) * 100}%` }} aria-hidden>
      <span className="live-ripple" /><span className="live-dot" />
    </div>
  );
}

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
  const [dark, setDark] = useState(false);
  const [liveState, setLiveState] = useState<LiveState>(initialLiveState);
  const [liveError, setLiveError] = useState<string | null>(null);
  const stateRef = useRef(liveState);
  stateRef.current = liveState;

  const intents = contract?.intents ?? [];
  const activeIntent = intent ?? liveState.intentId ?? intents[0]?.id;
  const goal = liveState.goal ?? intents.find((i) => i.id === activeIntent)?.goal ?? activeIntent ?? "Live probes";

  useEffect(() => { document.documentElement.dataset.theme = dark ? "dark" : "light"; }, [dark]);
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
      else if (e.key === "t" || e.key === "T") setDark((v) => !v);
      else if (e.key === "s" || e.key === "S") setSpeed((v) => nextSpeed(v));
      else if (["1", "2", "4"].includes(e.key)) setSpeed(Number(e.key));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [maxStep, step]);

  const lines = report && activeIntent ? findingLines(report, activeIntent, { baseline: traces.baseline?.steps.length, candidate: traces.candidate?.steps.length }) : [];
  const liveLines = liveState.findings.map((f) => ({ label: f.title, text: `${String(f.baseline)} → ${String(f.candidate)}` }));

  const renderPane = (variant: Variant) => {
    if (isLive) {
      const p = liveState.panes[variant];
      return (
        <div className="pane live-pane" key={variant}>
          <header><span>{variant === "baseline" ? "Baseline" : "Candidate"}</span><span className="live-stepcount" key={p.step}>Step {p.step}</span></header>
          <div className="shot"><div className="live-shotwrap">{p.screenshotUrl ? <img src={p.screenshotUrl} alt={`${variant} step ${p.step}`} /> : <div className="live-wait">Waiting for Probe…</div>}<Cursor actions={p.actions} tick={`${p.traceId}-${p.step}`} /></div></div>
          <div className="caption"><strong>{p.traceId ?? variant}</strong><br />{p.actions.length ? `${actionLabel(p.actions)}${p.note ? ` — ${p.note}` : ""}` : p.finished ? `Oracle ${p.oraclePassed === undefined ? "not checked" : p.oraclePassed ? "passed" : "failed"}` : "Starting screen, before the Probe acts."}</div>
        </div>
      );
    }
    const trace = traces[variant];
    const view = paneAtStep(trace, step);
    const shots = trace ? shotList(trace) : [];
    const shot = view.screenshot ?? shots[0];
    const decisive = trace && showFinding;
    return (
      <div className="pane live-pane" key={variant}>
        <header><span>{variant === "baseline" ? "Baseline" : "Candidate"}</span><span className="live-stepcount" key={view.current}>Step {view.current} of {trace?.steps.length ?? 0}</span></header>
        <div className="shot"><div className="live-shotwrap">{trace && shot ? <img src={shotUrl(runId, trace.id, shot)} alt={`${variant} step ${view.current}`} /> : <div className="live-wait">No Trace for this Variant.</div>}
          {trace && decisive && showOverlay && variant === "candidate" && <img className="overlay" src={samUrl(runId, trace.id, shots[shots.length - 1])} alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />}
          {trace && <Cursor actions={view.actions} tick={`${trace.id}-${view.current}`} />}</div></div>
        <div className="caption"><strong>{trace?.id ?? variant}</strong><br />{view.current === 0 ? "Starting screen, before the Probe acts." : `Step ${view.current}: ${actionLabel(view.actions)}${view.note ? ` — ${view.note}` : ""}`}{trace && view.current >= trace.steps.length ? ` · Oracle ${trace.oracle.passed ? "passed" : "failed"}` : ""}</div>
      </div>
    );
  };

  return (
    <div className="live-page">
      <p className="live-eyebrow">{isLive ? "Live probes" : "Replay"} · {contract?.decision ?? liveState.decision ?? "AgencyDiff"}</p>
      <h1 className="live-intent">{goal}</h1>
      <div className="live-toolbar">
        {!isLive && <><label>Intent <select value={activeIntent ?? ""} onChange={(e) => { window.location.hash = `#/live?run=${runId}&intent=${e.target.value}`; setStep(0); }}>{intents.map((i) => <option key={i.id} value={i.id}>{i.goal}</option>)}</select></label>
        <button onClick={() => setStep(0)}>Start</button><button onClick={() => setStep((s) => Math.max(0, s - 1))}>Back</button>
        <button onClick={() => { if (step >= maxStep) setStep(0); setPlaying((p) => !p); }}>{playing ? "Pause" : step >= maxStep ? "Replay" : "Play"}</button>
        <button onClick={() => setStep((s) => Math.min(s + 1, maxStep))}>Next</button>
        <input type="range" min={0} max={maxStep} value={step} aria-label="Playback step" onChange={(e) => { setPlaying(false); setStep(Number(e.target.value)); }} />
        <span className="step-note">Step {step} of {maxStep}</span></>}
        <label>Speed <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>{SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}</select></label>
        <label className="live-check"><input type="checkbox" checked={showOverlay} onChange={(e) => setShowOverlay(e.target.checked)} /> SAM overlay</label>
        <button onClick={() => setDark((d) => !d)}>{dark ? "Light" : "Dark"}</button>
        <a className="live-mode" href={isLive ? `#/live?run=${runId}&intent=${activeIntent ?? ""}` : `#/live?run=${runId}&intent=${activeIntent ?? ""}&source=live&live=${encodeURIComponent(liveBase)}`}>{isLive ? "Replay mode" : "Live mode"}</a>
      </div>
      <p className="live-keys">Space play / pause · ← → step · Home / End jump · S speed · 1 / 2 / 4 speed · O overlay · T theme</p>
      {liveError && <div className="error">{liveError}</div>}
      <div className="replay-stage live-stage">{renderPane("baseline")}{renderPane("candidate")}</div>
      {showFinding && (
        <section className="live-finding" aria-live="polite">
          <h2>Finding</h2>
          {(isLive ? liveLines : lines).length === 0 && <p>No Finding for this Intent. Both Variants cost the same.</p>}
          <dl className="live-finding-list">{(isLive ? liveLines : lines).map((l) => <div key={l.label}><dt>{l.label}</dt><dd>{l.text}</dd></div>)}</dl>
          <p className="muted">{isLive ? "Oracle result decides success, never the agent's claim." : "SAM overlay is shown on the candidate's decisive screenshot when stored beside it."}</p>
        </section>
      )}
    </div>
  );
}
