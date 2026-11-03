import { useEffect, useMemo, useRef, useState } from "react";
import type { AgencyContract, AgencyReport, LiveEvent, Trace, Variant } from "@agencydiff/core";
import { loadContract, loadReport, loadTrace, samUrl, shotUrl } from "../data";
import { shotList } from "../format";
import { findingLines, initialLiveState, nextSpeed, paneAtStep, reduceLiveEvent, replayMaxStep, SPEEDS, type LiveState } from "../live";
import { Phone, RouteMap, stepCaption, stepNote } from "../components";
import { Button } from "@astryxdesign/core/Button";
import { Selector } from "@astryxdesign/core/Selector";
import { Slider } from "@astryxdesign/core/Slider";
import { Switch } from "@astryxdesign/core/Switch";
import { Kbd } from "@astryxdesign/core/Kbd";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { ChevronLeft, ChevronRight, Pause, Play, SkipBack } from "lucide-react";
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
          {finished && trace && <> · Oracle {trace.oracle.passed ? "passed" : "failed"}</>}
        </div>
        {trace && <RouteMap trace={trace} step={view.current} compact />}
      </div>
    );
  };

  const counts = isLive
    ? { b: liveState.panes.baseline.step, c: liveState.panes.candidate.step }
    : { b: Math.min(step, traces.baseline?.steps.length ?? 0), c: Math.min(step, traces.candidate?.steps.length ?? 0) };
  const shownLines = isLive ? liveLines : lines;

  return (
    <div className="live-page">
      <div className="page-head compact live-head">
        <h1>{goal}</h1>
        <p className="lede">
          {isLive
            ? "Streaming a run as it happens."
            : "Streams a run as it happens. Needs a local runner — nothing is connected right now."}
        </p>
      </div>
      {!isLive && (
        <div className="picker">
          <Selector size="lg" label="Intent" isLabelHidden value={activeIntent ?? ""} options={intents.map((i) => ({ value: i.id, label: i.goal }))} onChange={(value) => { window.location.hash = `#/live?run=${runId}&intent=${value}`; setStep(0); }} />
        </div>
      )}
      <div className="controls" role="group" aria-label="Playback">
        {!isLive && <>
          <span className="step-note">Step {step} of {maxStep}</span>
          <Button size="lg" label="Start" variant="ghost" icon={<SkipBack size={20} />} isDisabled={step === 0} onClick={() => { setPlaying(false); setStep(0); }} />
          <Button size="lg" label="Back" icon={<ChevronLeft size={20} />} isDisabled={step === 0} onClick={() => { setPlaying(false); setStep((s) => Math.max(0, s - 1)); }} />
          <Button size="lg" label={playing ? "Pause" : step >= maxStep ? "Replay" : "Play"} variant="primary" icon={playing ? <Pause size={16} /> : <Play size={16} />} onClick={() => { if (step >= maxStep) setStep(0); setPlaying((p) => !p); }} />
          <Button size="lg" label="Next" icon={<ChevronRight size={20} />} isDisabled={step >= maxStep} onClick={() => { setPlaying(false); setStep((s) => Math.min(s + 1, maxStep)); }} />
          <div className="grow"><Slider label="Playback step" isLabelHidden min={0} max={Math.max(maxStep, 1)} value={step} valueDisplay="none" onChange={(v: number) => { setPlaying(false); setStep(Number(v)); }} /></div>
        </>}
        <SegmentedControl label="Playback speed" size="lg" value={String(speed)} onChange={(v) => setSpeed(Number(v))}>
          {SPEEDS.map((x) => <SegmentedControlItem key={x} value={String(x)} label={`${x}×`} />)}
        </SegmentedControl>
        <Switch label="SAM overlay" value={showOverlay} onChange={(on) => setShowOverlay(on)} />
        <a className="text-link" href={isLive ? `#/live?run=${runId}&intent=${activeIntent ?? ""}` : `#/live?run=${runId}&intent=${activeIntent ?? ""}&source=live&live=${encodeURIComponent(liveBase)}`}>{isLive ? "Replay mode" : "Live mode"}</a>
      </div>
      <p className="keys"><span><Kbd keys="space" /> play</span><span><Kbd keys="left" /> <Kbd keys="right" /> step</span><span><Kbd keys="s" /> speed</span><span><Kbd keys="o" /> overlay</span><span><Kbd keys="t" /> theme</span></p>
      {liveError && <div className="error">{liveError}</div>}
      <div className="stage replay-stage live-stage">
        {renderPane("baseline")}
        <div className="stage-mid">
          <div className="counter">
            <div className="k">Steps taken</div>
            <div className="rows"><span>Baseline</span><b className="tick" key={`b${counts.b}`}>{counts.b}</b><span>Candidate</span><b className="tick" key={`c${counts.c}`}>{counts.c}</b></div>
          </div>
          {showFinding && (
            <section className={`finding live-finding ${shownLines.length ? "" : "ok"}`} aria-live="polite">
              <h4>Finding</h4>
              {shownLines.length === 0 && <p style={{ margin: 0 }}>No Finding for this Intent. Both Variants cost the same.</p>}
              <dl>{shownLines.slice(0, 3).map((l) => <div key={l.label}><dt>{l.label}</dt><dd className="tnum" style={{ fontWeight: 750 }}>{l.text}</dd></div>)}</dl>
            </section>
          )}
          {!showFinding && <p className="muted" style={{ fontSize: 13, margin: 0 }}>{isLive ? "Success is decided by the last screen, never by what the agent claims." : "Press Play. The Finding slides in when both Traces finish."}</p>}
        </div>
        {renderPane("candidate")}
      </div>
    </div>
  );
}
