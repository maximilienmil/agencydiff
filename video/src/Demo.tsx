import React from "react";
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import type { DemoProps, Footage, VideoData } from "./types.js";
import { PENDING } from "./types.js";

export const FPS = 30;
export const DURATION = 180 * FPS;

const C = {
  ink: "#1c1a17",
  muted: "#5f5b54",
  faint: "#8a857c",
  line: "#e4e0d7",
  paper: "#ffffff",
  wash: "#f6f4ef",
  accent: "#245c46",
  bad: "#a4261c",
  badWash: "#f9e9e7",
  good: "#1e6b3a",
  goodWash: "#e7f2ea",
  amber: "#8a5a00",
  amberWash: "#f7ecd4",
};
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif';

const v = (s: string | null | undefined) => (s === null || s === undefined || s === "" ? PENDING : s);

function Fade({ children, dur = 24 }: { children: React.ReactNode; dur?: number }) {
  const f = useCurrentFrame();
  const opacity = interpolate(f, [0, dur], [0, 1], { extrapolateRight: "clamp" });
  const y = interpolate(f, [0, dur], [14, 0], { extrapolateRight: "clamp" });
  return <div style={{ opacity, transform: `translateY(${y}px)` }}>{children}</div>;
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: 3, color: C.accent, textTransform: "uppercase" }}>
      {children}
    </div>
  );
}

function Caption({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        background: C.ink,
        color: C.paper,
        fontSize: 30,
        lineHeight: 1.45,
        padding: "22px 64px",
        fontWeight: 500,
      }}
    >
      {children}
    </div>
  );
}

function PendingNote({ label }: { label: string }) {
  return (
    <div
      style={{
        border: `2px dashed ${C.amber}`,
        background: C.amberWash,
        color: C.amber,
        borderRadius: 10,
        padding: "28px 34px",
        fontSize: 26,
        fontWeight: 600,
      }}
    >
      {PENDING} {label}
    </div>
  );
}

function Shot({ file, label, height = 560 }: { file: string | null; label: string; height?: number }) {
  if (!file) return <PendingNote label={label} />;
  return (
    <Img
      src={staticFile(file)}
      style={{ width: "100%", height, objectFit: "cover", objectPosition: "top", borderRadius: 10, border: `1px solid ${C.line}` }}
    />
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bad" | "good" }) {
  return (
    <div
      style={{
        background: tone === "bad" ? C.badWash : tone === "good" ? C.goodWash : C.wash,
        border: `1px solid ${C.line}`,
        borderRadius: 10,
        padding: "26px 30px",
        minWidth: 300,
      }}
    >
      <div style={{ fontSize: 52, fontWeight: 700, color: tone === "bad" ? C.bad : tone === "good" ? C.good : C.ink }}>
        {value}
      </div>
      <div style={{ fontSize: 22, color: C.muted, marginTop: 6 }}>{label}</div>
    </div>
  );
}

const base: React.CSSProperties = {
  background: C.paper,
  color: C.ink,
  fontFamily: FONT,
  padding: "72px 88px 150px",
};

function Hook({ data }: { data: VideoData }) {
  return (
    <AbsoluteFill style={{ ...base, justifyContent: "center" }}>
      <Fade>
        <Kicker>AgencyDiff</Kicker>
        <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.12, letterSpacing: -1, marginTop: 28, maxWidth: 1400 }}>
          Teams ship UI changes every day with agents.
        </div>
        <div style={{ fontSize: 40, color: C.muted, lineHeight: 1.4, marginTop: 30, maxWidth: 1250 }}>
          Nobody re-checks whether people can still do what they came to do.
        </div>
        <div style={{ fontSize: 24, color: C.faint, marginTop: 44 }}>
          Decline cost {v(data.declineBaseline)} {"->"} {v(data.declineCandidate)} actions, {v(data.declineVisibility)} on the
          first screen. Measured, not judged. (eval/results/summary.json, report.json)
        </div>
      </Fade>
      <Caption>Teams ship UI changes every day with agents. Nobody re-checks whether users can still do what they came to do.</Caption>
    </AbsoluteFill>
  );
}

function Idea() {
  const rows = [
    ["Intent", "One explicit thing a person wants to accomplish."],
    ["Probe", "A computer-use agent run as a measuring instrument, not a simulated person."],
    ["Oracle", "The check of the final app state. The agent's own claim never counts."],
    ["Agency Diff", "The same Intents on baseline and candidate, compared deterministically."],
  ];
  return (
    <AbsoluteFill style={base}>
      <Fade>
        <Kicker>The idea</Kicker>
        <div style={{ fontSize: 58, fontWeight: 700, marginTop: 20 }}>Intents as tests</div>
        <div style={{ marginTop: 48, display: "flex", flexDirection: "column", gap: 22 }}>
          {rows.map(([term, def]) => (
            <div key={term} style={{ display: "flex", gap: 28, borderBottom: `1px solid ${C.line}`, paddingBottom: 20 }}>
              <div style={{ width: 280, fontSize: 32, fontWeight: 700 }}>{term}</div>
              <div style={{ fontSize: 30, color: C.muted, lineHeight: 1.4 }}>{def}</div>
            </div>
          ))}
        </div>
      </Fade>
      <Caption>Intents as tests. Muse probes are instruments, not fake users. An Oracle checks the final state.</Caption>
    </AbsoluteFill>
  );
}

function ReplayPanel({ files, title, tone }: { files: string[]; title: string; tone: "bad" | "good" }) {
  const f = useCurrentFrame();
  if (files.length === 0) return <PendingNote label={`replay footage (${title})`} />;
  const idx = Math.min(files.length - 1, Math.floor(f / 55));
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: tone === "bad" ? C.bad : C.good, marginBottom: 12 }}>{title}</div>
      <Img
        src={staticFile(files[idx])}
        style={{ width: "100%", height: 520, objectFit: "contain", background: C.wash, borderRadius: 10, border: `1px solid ${C.line}` }}
      />
      <div style={{ fontSize: 20, color: C.faint, marginTop: 10 }}>
        Trace step {idx + 1} of {files.length} (recorded screenshots)
      </div>
    </div>
  );
}

function DemoScene({ data, footage }: { data: VideoData; footage: Footage }) {
  return (
    <AbsoluteFill style={base}>
      <Fade>
        <Kicker>Demo</Kicker>
        <div style={{ fontSize: 52, fontWeight: 700, marginTop: 16 }}>
          PR "simplify onboarding" {"->"} the AgencyDiff check fails
        </div>
        <div style={{ display: "flex", gap: 36, marginTop: 36 }}>
          <ReplayPanel files={footage.replayBaseline} title="Baseline: decline visible" tone="good" />
          <ReplayPanel files={footage.replayCandidate} title="Candidate: decline hidden" tone="bad" />
        </div>
        <div style={{ display: "flex", gap: 24, marginTop: 30, alignItems: "stretch" }}>
          <Stat label="Decline (Protective Intent), actions" value={`${v(data.declineBaseline)} -> ${v(data.declineCandidate)}`} tone="bad" />
          <Stat label="Revoke, actions" value={`${v(data.revokeBaseline)} -> ${v(data.revokeCandidate)}`} tone="bad" />
          <Stat label="Asymmetry (saying no vs yes)" value={`${v(data.asymmetryBaseline)}x -> ${v(data.asymmetryCandidate)}x`} tone="bad" />
          <div style={{ flex: 1 }}>{footage.samOverlay ? <Shot file={footage.samOverlay} label="SAM overlay" height={190} /> : <PendingNote label="SAM 3.1 overlay footage" />}</div>
        </div>
        <div style={{ fontSize: 24, color: C.muted, marginTop: 22 }}>
          {PENDING} Propose Fix flow and PR check comment: no fix UI or open PR exists in this checkout yet, so this draft
          shows the measured Finding instead of a fabricated green check.
        </div>
      </Fade>
      <Caption>A PR simplifies onboarding. The check fails: declining takes more steps and leaves the first screen.</Caption>
    </AbsoluteFill>
  );
}

function Evidence({ data }: { data: VideoData }) {
  return (
    <AbsoluteFill style={base}>
      <Fade>
        <Kicker>Evidence</Kicker>
        <div style={{ fontSize: 52, fontWeight: 700, marginTop: 16 }}>Benchmarks, from recorded Traces</div>
        <div style={{ display: "flex", gap: 24, marginTop: 44, flexWrap: "wrap" }}>
          <Stat label="AgencyDiff (scripted Probes) caught" value={v(data.scriptedCaught)} tone="good" />
          <Stat label="False alarms on harmless changes" value={v(data.scriptedFalseAlarms)} />
          <Stat label="Muse-as-judge caught" value={v(data.judgeCaught)} />
          <Stat label="Judge false alarms" value={v(data.judgeFalseAlarms)} />
          <Stat label="Judge consistency" value={v(data.judgeConsistency)} />
          <Stat label="SusBench-derived patterns detected" value={v(data.susDetected)} tone="good" />
          <Stat label="SusBench false alarms" value={v(data.susFalseAlarms)} tone="bad" />
        </div>
        <div style={{ fontSize: 30, marginTop: 44, lineHeight: 1.5 }}>
          Public-site time-to-fact (docs/audit.md): <strong>{v(data.dmvTimeToFact)}</strong>
        </div>
        <div style={{ fontSize: 24, color: C.muted, marginTop: 16 }}>
          Muse computer-use Probe results: {v(data.museProbes)}. Sources: eval/results/summary.json,
          eval/susbench/results.json, docs/audit.md, read at render time.
        </div>
      </Fade>
      <Caption>The benchmark table, SusBench-derived results, and the public-site time-to-fact result.</Caption>
    </AbsoluteFill>
  );
}

function Built({ footage }: { footage: Footage }) {
  return (
    <AbsoluteFill style={base}>
      <Fade>
        <Kicker>How it is built</Kicker>
        <div style={{ fontSize: 52, fontWeight: 700, marginTop: 16 }}>Instruments, Oracles, deterministic diff</div>
        <div style={{ display: "flex", gap: 36, marginTop: 40 }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 18, fontSize: 29, lineHeight: 1.5 }}>
            <div><strong>Muse Spark</strong> computer use runs each Probe from screenshots only.</div>
            <div><strong>SAM 3.1</strong> grounds controls for the evidence overlay.</div>
            <div><strong>Muse</strong> built this repo through delegated agents, one ticket at a time.</div>
            <div>The <strong>Agency Diff</strong> itself is deterministic: same Traces in, same Findings out.</div>
          </div>
          <div style={{ flex: 1 }}>
            {footage.liveReplay ? (
              <OffthreadVideo src={staticFile(footage.liveReplay)} style={{ width: "100%", height: 480, objectFit: "cover", borderRadius: 10 }} />
            ) : (
              <PendingNote label="live/replay footage (media/live-replay.mp4 not present in this checkout)" />
            )}
            <div style={{ marginTop: 20 }}>
              <Shot file={footage.reportDiff} label="report viewer footage (run scripts/capture-footage.ts)" height={240} />
            </div>
          </div>
        </div>
      </Fade>
      <Caption>Muse Spark computer use, SAM 3.1, Muse, and a deterministic diff.</Caption>
    </AbsoluteFill>
  );
}

function Close({ data }: { data: VideoData }) {
  return (
    <AbsoluteFill style={{ ...base, justifyContent: "center", alignItems: "flex-start" }}>
      <Fade>
        <div style={{ fontSize: 84, fontWeight: 700, letterSpacing: -1.5, lineHeight: 1.1 }}>
          Regression tests
          <br />
          for human choice.
        </div>
        <div style={{ fontSize: 36, color: C.muted, marginTop: 34 }}>{data.repoUrl}</div>
        <div style={{ fontSize: 24, color: C.faint, marginTop: 20 }}>
          Draft cut. {PENDING} marks every number or clip that is not final yet; re-render after the next eval run.
        </div>
      </Fade>
      <Caption>Regression tests for human choice.</Caption>
    </AbsoluteFill>
  );
}

export function Demo({ data, footage }: DemoProps) {
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <Sequence from={0} durationInFrames={15 * FPS}><Hook data={data} /></Sequence>
      <Sequence from={15 * FPS} durationInFrames={30 * FPS}><Idea /></Sequence>
      <Sequence from={45 * FPS} durationInFrames={45 * FPS}><DemoScene data={data} footage={footage} /></Sequence>
      <Sequence from={90 * FPS} durationInFrames={40 * FPS}><Evidence data={data} /></Sequence>
      <Sequence from={130 * FPS} durationInFrames={30 * FPS}><Built footage={footage} /></Sequence>
      <Sequence from={160 * FPS} durationInFrames={20 * FPS}><Close data={data} /></Sequence>
    </AbsoluteFill>
  );
}
