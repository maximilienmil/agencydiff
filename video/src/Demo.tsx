import React from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import type { Clip, DemoProps, Footage, VideoData } from "./types.js";
import { PENDING } from "./types.js";

export const FPS = 30;
export const DURATION = 180 * FPS;

// Colours and type come from design/tokens.css (imported in index.ts) as CSS
// custom properties, the same tokens the report and Circle use.
const T = {
  ink: "var(--ds-ink)",
  ink2: "var(--ds-ink-2)",
  ink3: "var(--ds-ink-3)",
  bg: "var(--ds-bg)",
  surface: "var(--ds-surface)",
  surface2: "var(--ds-surface-2)",
  line: "var(--ds-line)",
  blue: "var(--ds-blue)",
  blueInk: "var(--ds-blue-ink)",
  blueWash: "var(--ds-blue-wash)",
  bad: "var(--ds-bad)",
  badInk: "var(--ds-bad-ink)",
  badWash: "var(--ds-bad-wash)",
  good: "var(--ds-good)",
  goodInk: "var(--ds-good-ink)",
  goodWash: "var(--ds-good-wash)",
  hero: "var(--ds-hero)",
  font: "var(--ds-font)",
  mono: "var(--ds-mono)",
  shadow2: "var(--ds-shadow-2)",
  shadow3: "var(--ds-shadow-3)",
};

const v = (s: string | null | undefined) => (s === null || s === undefined || s === "" ? PENDING : s);
const ease = Easing.bezier(0.2, 0.8, 0.2, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** 0 → 1 over [at, at + dur], eased. */
function useIn(at: number, dur = 18): number {
  const f = useCurrentFrame();
  return interpolate(f, [at, at + dur], [0, 1], { ...clamp, easing: ease });
}

function In({ at = 0, dur = 18, dy = 18, dx = 0, children, style }: { at?: number; dur?: number; dy?: number; dx?: number; children: React.ReactNode; style?: React.CSSProperties }) {
  const p = useIn(at, dur);
  return <div style={{ opacity: p, transform: `translate(${(1 - p) * dx}px, ${(1 - p) * dy}px)`, ...style }}>{children}</div>;
}

function Kicker({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 20, fontWeight: 700, letterSpacing: 2.4, textTransform: "uppercase", color: dark ? "#9cc0ff" : T.blueInk }}>
      <span style={{ width: 28, height: 4, borderRadius: 2, background: T.hero }} />
      {children}
    </div>
  );
}

/** Burned-in caption: a floating pill, not a full-width bar. */
function Caption({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  const p = useIn(6, 14);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 36, display: "flex", justifyContent: "center", opacity: p }}>
      <div
        style={{
          maxWidth: 1500,
          background: dark ? "rgba(255,255,255,0.08)" : "rgba(28,43,51,0.92)",
          border: dark ? "1px solid rgba(255,255,255,0.14)" : "none",
          color: "#fff",
          fontSize: 27,
          lineHeight: 1.4,
          padding: "14px 30px",
          borderRadius: 18,
          fontWeight: 500,
          textAlign: "center",
          letterSpacing: "-0.005em",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function PendingNote({ label }: { label: string }) {
  return (
    <div style={{ border: `2px dashed ${T.bad}`, background: T.badWash, color: T.badInk, borderRadius: 16, padding: "28px 34px", fontSize: 26, fontWeight: 600 }}>
      {PENDING} {label}
    </div>
  );
}

const scene: React.CSSProperties = {
  background: T.bg,
  color: T.ink,
  fontFamily: T.font,
  padding: "72px 96px 150px",
  letterSpacing: "-0.01em",
};

function Glow({ dark }: { dark?: boolean }) {
  return (
    <AbsoluteFill
      style={{
        background: dark
          ? "radial-gradient(50% 60% at 85% 10%, rgba(8,102,255,0.28), transparent 70%), radial-gradient(40% 50% at 10% 100%, rgba(123,97,255,0.22), transparent 70%), #0b0f14"
          : "radial-gradient(45% 55% at 92% 0%, rgba(8,102,255,0.10), transparent 70%), radial-gradient(40% 50% at 0% 100%, rgba(123,97,255,0.08), transparent 70%), linear-gradient(#ffffff, #f1f4f7)",
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Trace playback

/** Which step of a clip is on screen at local frame f, playing [start, end). */
function clipStep(clip: Clip, f: number, start: number, end: number): { i: number; t: number } {
  const n = clip.frames.length - 1;
  if (n <= 0 || f < start) return { i: 0, t: 0 };
  const per = (end - start) / n;
  const raw = (f - start) / per;
  if (raw >= n) return { i: n, t: 1 };
  return { i: Math.floor(raw), t: raw - Math.floor(raw) };
}

/** A recorded Trace in a phone frame. Shows screenshot i; in the second half
 *  of each step a tap ripple lands where the Probe tapped on that screen. */
function TracePhone({
  clip,
  start,
  end,
  width,
  label,
  tone,
  doneLabel,
}: {
  clip: Clip | null;
  start: number;
  end: number;
  width: number;
  label: string;
  tone: "base" | "cand";
  doneLabel?: { text: string; ok: boolean };
}) {
  const f = useCurrentFrame();
  if (!clip) return <PendingNote label={label} />;
  const { i, t } = clipStep(clip, f, start, end);
  const frame = clip.frames[i];
  const scale = width / 430;
  const winH = clip.window * scale;
  const done = i >= clip.frames.length - 1 && f >= end;
  const tapP = frame.tap && !done ? interpolate(t, [0.45, 0.95], [0, 1], clamp) : 0;
  const pad = Math.round(width * 0.03);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ width: width + pad * 2, display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 24, fontWeight: 700 }}>
          <span style={{ width: 11, height: 11, borderRadius: 6, background: tone === "cand" ? T.blue : "#65676b" }} />
          {label}
        </span>
        <span style={{ fontSize: 22, color: T.ink3, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
          Step <span style={{ color: T.ink, fontWeight: 800 }}>{i}</span> / {clip.steps}
        </span>
      </div>
      <div
        style={{
          width: width + pad * 2,
          padding: pad,
          borderRadius: width * 0.12,
          background: "#0b0f14",
          boxShadow: "0 40px 80px rgba(11,15,20,0.28), 0 0 0 1px rgba(255,255,255,0.08) inset",
        }}
      >
        <div style={{ position: "relative", width, height: winH, overflow: "hidden", borderRadius: width * 0.09, background: "#fff" }}>
          <Img
            src={staticFile(frame.file)}
            style={{ position: "absolute", left: 0, top: -frame.crop * scale, width, height: 860 * scale }}
          />
          {frame.tap && tapP > 0 && (
            <div style={{ position: "absolute", left: frame.tap.x * width, top: frame.tap.y * winH }}>
              <div
                style={{
                  position: "absolute",
                  width: 70,
                  height: 70,
                  marginLeft: -35,
                  marginTop: -35,
                  borderRadius: 35,
                  border: "4px solid #0866ff",
                  opacity: 1 - tapP,
                  transform: `scale(${0.3 + tapP})`,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  width: 22,
                  height: 22,
                  marginLeft: -11,
                  marginTop: -11,
                  borderRadius: 11,
                  background: "#0866ff",
                  boxShadow: "0 0 0 4px #fff, 0 4px 12px rgba(0,0,0,0.3)",
                  opacity: interpolate(tapP, [0, 0.15, 0.85, 1], [0, 1, 1, 0.6], clamp),
                }}
              />
            </div>
          )}
        </div>
      </div>
      <div style={{ height: 52, marginTop: 18, display: "flex", alignItems: "center" }}>
        {doneLabel && done && (
          <In dur={12} dy={10}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                fontSize: 22,
                fontWeight: 700,
                padding: "10px 18px",
                borderRadius: 999,
                background: doneLabel.ok ? T.goodWash : T.badWash,
                color: doneLabel.ok ? T.goodInk : T.badInk,
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: 5, background: doneLabel.ok ? T.good : T.bad }} />
              {doneLabel.text}
            </span>
          </In>
        )}
      </div>
    </div>
  );
}

function FindingCard({ at, title, rows, dark }: { at: number; title: string; rows: { k: string; b: string; c: string }[]; dark?: boolean }) {
  const p = useIn(at, 20);
  return (
    <div
      style={{
        opacity: p,
        transform: `translateX(${(1 - p) * 60}px)`,
        position: "relative",
        overflow: "hidden",
        background: dark ? "#111820" : T.surface,
        border: `1px solid ${dark ? "#223240" : "var(--ds-line)"}`,
        borderRadius: 22,
        padding: "26px 30px 26px 36px",
        boxShadow: T.shadow3,
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 7, background: T.bad }} />
      <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: 2.2, color: dark ? "#9aa7b0" : T.ink3 }}>FINDING</div>
      <div style={{ fontSize: 26, fontWeight: 650, marginTop: 10, lineHeight: 1.35, color: dark ? "#e4e6eb" : T.ink }}>{title}</div>
      {rows.map((r) => (
        <div key={r.k} style={{ marginTop: 18 }}>
          <div style={{ fontSize: 19, color: dark ? "#9aa7b0" : T.ink3 }}>{r.k}</div>
          <div style={{ fontSize: 46, fontWeight: 800, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", color: dark ? "#e4e6eb" : T.ink }}>
            <span style={{ color: dark ? "#9aa7b0" : T.ink3, fontWeight: 600 }}>{r.b} → </span>
            <span style={{ color: dark ? "#ff6b81" : T.badInk }}>{r.c}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Voice({ file }: { file: string | null }) {
  if (!file) return null;
  return <Audio src={staticFile(file)} />;
}

// ---------------------------------------------------------------------------
// Scenes

function ColdOpen({ data, footage, vo }: { data: VideoData; footage: Footage; vo: string | null }) {
  const { coldBaseline: b, coldCandidate: c } = footage.clips;
  return (
    <AbsoluteFill data-theme="dark" style={{ ...scene, color: "#e4e6eb", padding: "64px 96px 140px" }}>
      <Glow dark />
      <Voice file={vo} />
      <div style={{ position: "relative", display: "flex", gap: 64, height: "100%" }}>
        <div style={{ width: 560, display: "flex", flexDirection: "column", paddingTop: 20 }}>
          <In>
            <Kicker dark>AgencyDiff · two Probes, one Intent</Kicker>
          </In>
          <In at={6}>
            <div style={{ fontSize: 66, fontWeight: 800, lineHeight: 1.04, letterSpacing: "-0.04em", marginTop: 26 }}>
              “I do not want strangers messaging me.”
            </div>
          </In>
          <In at={30}>
            <div style={{ fontSize: 26, color: "#aeb9c1", lineHeight: 1.5, marginTop: 26 }}>
              Muse computer-use Probes on two builds of the same app. Recorded Traces, every tap shown.
            </div>
          </In>
          <div style={{ marginTop: "auto" }}>
            <FindingCard at={292} dark title={v(data.teenFinding)} rows={[]} />
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", gap: 56, justifyContent: "center", alignItems: "flex-start" }}>
          <TracePhone clip={b} start={24} end={282} width={380} label="Baseline" tone="base" doneLabel={{ text: "Blocked strangers · Oracle passed", ok: true }} />
          <TracePhone clip={c} start={24} end={282} width={380} label="Candidate" tone="cand" doneLabel={{ text: "Out of steps · Oracle failed", ok: false }} />
        </div>
      </div>
      <Caption dark>Same Intent, two builds. The baseline Probe blocks strangers; this candidate run ends on the wrong screen.</Caption>
    </AbsoluteFill>
  );
}

function Problem({ vo }: { vo: string | null }) {
  const words = ["Decline", "Restrict", "Cancel", "Delete"];
  return (
    <AbsoluteFill style={{ ...scene, justifyContent: "center" }}>
      <Glow />
      <Voice file={vo} />
      <div style={{ position: "relative" }}>
        <In>
          <Kicker>The problem</Kicker>
        </In>
        <In at={8}>
          <div style={{ fontSize: 112, fontWeight: 800, lineHeight: 1.0, letterSpacing: "-0.045em", marginTop: 30 }}>
            Coding agents ship UI
            <br />
            every day.
          </div>
        </In>
        <In at={70}>
          <div style={{ fontSize: 56, fontWeight: 700, lineHeight: 1.15, marginTop: 36, letterSpacing: "-0.03em" }}>
            Nobody re-checks that people can still{" "}
            <span style={{ background: T.hero, WebkitBackgroundClip: "text", color: "transparent" }}>say no.</span>
          </div>
        </In>
        <div style={{ display: "flex", gap: 18, marginTop: 60 }}>
          {words.map((w, i) => (
            <In key={w} at={170 + i * 14} dy={24}>
              <div
                style={{
                  fontSize: 32,
                  fontWeight: 700,
                  padding: "18px 34px",
                  borderRadius: 999,
                  background: T.surface,
                  border: "1px solid var(--ds-line)",
                  boxShadow: T.shadow2,
                }}
              >
                {w}
              </div>
            </In>
          ))}
          <In at={240} dx={-20} dy={0}>
            <div style={{ fontSize: 28, color: T.ink2, padding: "22px 10px", maxWidth: 560, lineHeight: 1.35 }}>
              The choices that protect people are the ones nobody re-tests.
            </div>
          </In>
        </div>
      </div>
      <Caption>Coding agents ship interface changes daily. Nobody re-checks whether users can still say no.</Caption>
    </AbsoluteFill>
  );
}

function DiffCard({ title, lines, tone }: { title: string; lines: string[]; tone: "bad" | "good" }) {
  if (lines.length === 0) return <PendingNote label={title} />;
  return (
    <div style={{ background: "#0b0f14", borderRadius: 20, padding: "22px 26px", fontFamily: T.mono, boxShadow: T.shadow3, border: "1px solid #223240" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: T.font, fontSize: 20, fontWeight: 700, color: tone === "bad" ? "#ff8a9b" : "#7ee093", marginBottom: 14 }}>
        <span style={{ width: 10, height: 10, borderRadius: 5, background: tone === "bad" ? "#ff5c76" : "#4cc764" }} />
        {title}
      </div>
      {lines.map((l, i) => (
        <div
          key={i}
          style={{
            fontSize: 19,
            lineHeight: 1.55,
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            padding: "0 8px",
            borderRadius: 4,
            color: l.startsWith("+") ? "#9fe8ae" : l.startsWith("-") ? "#ffa3b1" : "#8a9ba8",
            background: l.startsWith("+") ? "rgba(76,199,100,0.10)" : l.startsWith("-") ? "rgba(255,92,118,0.10)" : "transparent",
          }}
        >
          {l}
        </div>
      ))}
    </div>
  );
}

function CheckCard({ ok, title, body }: { ok: boolean; title: string; body?: string }) {
  return (
    <div
      style={{
        marginTop: 18,
        background: ok ? T.goodWash : T.badWash,
        borderRadius: 18,
        padding: "20px 24px",
        display: "flex",
        gap: 18,
        alignItems: "flex-start",
      }}
    >
      <span style={{ marginTop: 4, width: 30, height: 30, borderRadius: 15, background: ok ? T.good : T.bad, color: "#fff", display: "grid", placeItems: "center", fontSize: 20, fontWeight: 800, flex: "none" }}>
        {ok ? "✓" : "×"}
      </span>
      <div>
        <div style={{ fontSize: 25, fontWeight: 750, color: ok ? T.goodInk : T.badInk }}>{title}</div>
        {body && <div style={{ fontSize: 22, marginTop: 6, lineHeight: 1.4, color: T.ink }}>{body}</div>}
      </div>
    </div>
  );
}

function BigBar({ label, value, tone, at }: { label: string; value: string | null; tone: "bad" | "good" | "blue"; at: number }) {
  const p = useIn(at, 30);
  const m = value?.match(/^(\d+)\/(\d+)$/);
  const r = m ? Number(m[1]) / Number(m[2]) : 0;
  const color = tone === "bad" ? T.bad : tone === "good" ? T.good : T.blue;
  return (
    <div style={{ background: T.surface, border: "1px solid var(--ds-line)", borderRadius: 22, padding: "26px 30px", boxShadow: T.shadow2 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={{ fontSize: 24, color: T.ink2, fontWeight: 600, maxWidth: 560, lineHeight: 1.3 }}>{label}</div>
        <div style={{ fontSize: 76, fontWeight: 800, letterSpacing: "-0.05em", color: tone === "bad" ? T.badInk : tone === "good" ? T.goodInk : T.ink, fontVariantNumeric: "tabular-nums" }}>
          {v(value)}
        </div>
      </div>
      <div style={{ height: 14, borderRadius: 7, background: "var(--ds-surface-3)", marginTop: 14, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.max(r * p * 100, r > 0 ? 0 : 0)}%`, background: color, borderRadius: 7 }} />
      </div>
    </div>
  );
}

function Experiment({ data, footage, vo }: { data: VideoData; footage: Footage; vo: string | null }) {
  const f = useCurrentFrame();
  const beat = f >= 930 ? 3 : f >= 620 ? 2 : f >= 300 ? 1 : 0;
  const starts = [0, 300, 620, 930];
  const { withBaseline: b, withCandidate: c } = footage.clips;
  return (
    <AbsoluteFill style={scene}>
      <Glow />
      <Voice file={vo} />
      <div style={{ position: "relative" }}>
        <In>
          <Kicker>The experiment · “{v(data.onboardTitle)}”</Kicker>
        </In>
        <div style={{ display: "flex", gap: 64, marginTop: 34 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Sequence from={starts[beat]} layout="none">
              {beat === 0 && (
                <In>
                  <div style={{ fontSize: 54, fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 1.08, marginBottom: 30 }}>
                    One ordinary task for a coding agent.
                  </div>
                  <div style={{ background: T.surface, border: "1px solid var(--ds-line)", borderRadius: 22, padding: "28px 32px", boxShadow: T.shadow2 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: 2.2, color: T.blueInk }}>THE PROMPT, VERBATIM</div>
                    <div style={{ fontSize: 30, lineHeight: 1.45, marginTop: 14 }}>“{v(data.onboardPrompt)}”</div>
                  </div>
                </In>
              )}
              {beat === 1 && (
                <>
                  <In>
                    <div style={{ fontSize: 54, fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 1.08, marginBottom: 30 }}>Its diff quietly buries “no”.</div>
                  </In>
                  <In at={12}>
                    <DiffCard title="The agent’s diff: the first-run prompt never opens" lines={data.regressingDiff} tone="bad" />
                  </In>
                  <In at={60}>
                    <CheckCard ok={false} title="AgencyDiff check failed" body={v(data.withholdFinding)} />
                  </In>
                </>
              )}
              {beat === 2 && (
                <>
                  <In>
                    <div style={{ fontSize: 54, fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 1.08, marginBottom: 30 }}>Same task, check in the loop.</div>
                  </In>
                  <In at={12}>
                    <DiffCard title="The gated agent’s diff: prompt and decline stay" lines={data.fixedDiff} tone="good" />
                  </In>
                  <In at={60}>
                    <CheckCard ok title={`AgencyDiff check: ${v(data.gateClaimB)} · 0 Findings`} />
                  </In>
                </>
              )}
              {beat === 3 && (
                <>
                  <In>
                    <div style={{ fontSize: 54, fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 1.08, marginBottom: 30 }}>
                      Thirty ordinary PRs per side.
                    </div>
                  </In>
                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    <In at={10}>
                      <BigBar at={20} label="Broke saying no, agent alone" value={data.agentNoGate} tone="bad" />
                    </In>
                    <In at={40}>
                      <BigBar at={50} label="Broke saying no, AgencyDiff in the loop" value={data.agentGated} tone="good" />
                    </In>
                  </div>
                </>
              )}
            </Sequence>
          </div>
          <div style={{ width: 760, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 40 }}>
              <TracePhone clip={b} start={340} end={400} width={320} label="Baseline" tone="base" doneLabel={{ text: `${v(data.declineBaseline)} step to say no`, ok: true }} />
              <TracePhone clip={c} start={340} end={600} width={320} label="Candidate" tone="cand" doneLabel={{ text: `${v(data.declineCandidate)} steps · ${v(data.declineVisibility)} at first`, ok: false }} />
            </div>
          </div>
        </div>
      </div>
      <Caption>A coding agent gets “simplify onboarding”. Its diff buries decline and the check fails. With the check in the loop: 8/30 vs 0/30.</Caption>
    </AbsoluteFill>
  );
}

function HowItWorks({ data, footage, vo }: { data: VideoData; footage: Footage; vo: string | null }) {
  const steps = [
    ["Contract", "Decisions, Intents, Oracles"],
    ["Probes", "Computer-use runs on both builds"],
    ["Oracle", "Final app state decides, never the agent’s claim"],
    ["Diff", "Same Traces in, same Findings out"],
  ];
  return (
    <AbsoluteFill style={scene}>
      <Glow />
      <Voice file={vo} />
      <div style={{ position: "relative" }}>
        <In>
          <Kicker>How it works</Kicker>
        </In>
        <div style={{ display: "flex", gap: 0, marginTop: 30, alignItems: "stretch" }}>
          {steps.map(([k, s], i) => (
            <React.Fragment key={k}>
              <In at={10 + i * 22} dy={0} dx={-24} style={{ flex: 1 }}>
                <div style={{ height: "100%", background: T.surface, border: "1px solid var(--ds-line)", borderRadius: 22, padding: "24px 26px", boxShadow: T.shadow2 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: T.blueWash, color: T.blueInk, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 20 }}>{i + 1}</div>
                  <div style={{ fontSize: 34, fontWeight: 800, marginTop: 16, letterSpacing: "-0.02em" }}>{k}</div>
                  <div style={{ fontSize: 22, color: T.ink2, marginTop: 6, lineHeight: 1.4 }}>{s}</div>
                </div>
              </In>
              {i < steps.length - 1 && (
                <In at={22 + i * 22} dy={0} style={{ width: 54, display: "grid", placeItems: "center" }}>
                  <div style={{ fontSize: 34, color: T.ink3 }}>→</div>
                </In>
              )}
            </React.Fragment>
          ))}
        </div>
        <div style={{ display: "flex", gap: 24, marginTop: 28 }}>
          <In at={150} style={{ flex: 1 }}>
            <BigBar at={160} label="Screenshot review caught" value={data.screensCaught} tone="bad" />
          </In>
          <In at={190} style={{ flex: 1 }}>
            <BigBar at={200} label={`Replay gate caught · ${v(data.gateFalseAlarms)} false alarms · ${v(data.gateCost)}`} value={data.gateCaught} tone="blue" />
          </In>
        </div>
        <In at={270}>
          <div style={{ fontSize: 26, color: T.ink2, marginTop: 20 }}>
            A judge shown the full walkthrough still catches only <b style={{ color: T.ink }}>{v(data.walkthroughCaught)}</b>, and it cannot count effort.
          </div>
        </In>
        <div style={{ display: "flex", gap: 24, marginTop: 26 }}>
          <In at={380} style={{ flex: 1.1 }}>
            <div style={{ display: "flex", gap: 24, alignItems: "center", background: T.surface, border: "1px solid var(--ds-line)", borderRadius: 22, padding: "20px 24px", boxShadow: T.shadow2 }}>
              {footage.samSheet ? (
                <Img src={staticFile(footage.samSheet)} style={{ width: 260, height: 218, objectFit: "cover", borderRadius: 14 }} />
              ) : (
                <PendingNote label="SAM 3.1 overlay" />
              )}
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: 2.2, color: T.blueInk }}>SAM 3.1 EVIDENCE</div>
                <div style={{ fontSize: 25, marginTop: 10, lineHeight: 1.4 }}>Each control segmented on the recorded screen: decline in red, allow in green.</div>
              </div>
            </div>
          </In>
          <In at={440} style={{ flex: 1 }}>
            <div style={{ height: "100%", background: T.surface, border: "1px solid var(--ds-line)", borderRadius: 22, padding: "24px 28px", boxShadow: T.shadow2 }}>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: 2.2, color: T.goodInk }}>PROPOSE FIX → GREEN</div>
              <div style={{ fontFamily: T.mono, fontSize: 21, marginTop: 12, background: T.surface2, padding: "10px 14px", borderRadius: 10 }}>pnpm run propose-fix --report runs/&lt;id&gt;</div>
              <div style={{ fontSize: 23, color: T.ink2, marginTop: 12, lineHeight: 1.4 }}>A failing report becomes a minimal patch, re-run in a clean worktree until the check passes.</div>
            </div>
          </In>
        </div>
      </div>
      <Caption>Contract, Probes, Oracle, deterministic diff. Screenshot review catches 1/20; the replay gate catches 19/20 with no false alarms, for $0.</Caption>
    </AbsoluteFill>
  );
}

function Card({ at, children, flex = 1 }: { at: number; children: React.ReactNode; flex?: number }) {
  return (
    <In at={at} style={{ flex }}>
      <div style={{ height: "100%", background: T.surface, border: "1px solid var(--ds-line)", borderRadius: 22, padding: "28px 30px", boxShadow: T.shadow2 }}>{children}</div>
    </In>
  );
}

const cardKicker: React.CSSProperties = { fontSize: 18, fontWeight: 700, letterSpacing: 2.2, color: "var(--ds-blue-ink)", textTransform: "uppercase" };

function Generalize({ data, vo }: { data: VideoData; vo: string | null }) {
  return (
    <AbsoluteFill style={{ ...scene, justifyContent: "center" }}>
      <Glow />
      <Voice file={vo} />
      <div style={{ position: "relative" }}>
        <In>
          <Kicker>It generalizes</Kicker>
        </In>
        <In at={6}>
          <div style={{ fontSize: 64, fontWeight: 800, marginTop: 22, letterSpacing: "-0.04em" }}>One engine, apps it has never seen.</div>
        </In>
        <div style={{ display: "flex", gap: 24, marginTop: 40 }}>
          <Card at={30}>
            <div style={cardKicker}>Contract drafting</div>
            <div style={{ fontFamily: T.mono, fontSize: 30, fontWeight: 700, marginTop: 14 }}>agencydiff init</div>
            <div style={{ fontSize: 24, marginTop: 12, lineHeight: 1.45, color: T.ink2 }}>Unseen ntfy server: a 22-step read-only crawl, 36 controls, contracts drafted, 3 kept.</div>
          </Card>
          <Card at={60}>
            <div style={cardKicker}>SusBench-derived</div>
            <div style={{ fontSize: 76, fontWeight: 800, color: T.goodInk, letterSpacing: "-0.05em", marginTop: 6 }}>{v(data.susDetected)}</div>
            <div style={{ fontSize: 24, marginTop: 4, lineHeight: 1.4, color: T.ink2 }}>patterns detected, {v(data.susFalseAlarms)} controls alarmed.</div>
          </Card>
          <Card at={90}>
            <div style={cardKicker}>Native</div>
            <div style={{ fontSize: 76, fontWeight: 800, letterSpacing: "-0.05em", marginTop: 6 }}>Android</div>
            <div style={{ fontSize: 24, marginTop: 4, lineHeight: 1.4, color: T.ink2 }}>Probes on a real emulator: same Oracles, same diff.</div>
          </Card>
        </div>
        <div style={{ display: "flex", gap: 24, marginTop: 24 }}>
          <Card at={300} flex={1.2}>
            <div style={cardKicker}>Public-site audit</div>
            <div style={{ fontSize: 30, marginTop: 14, lineHeight: 1.4, fontWeight: 650 }}>{v(data.auditRealId)}</div>
          </Card>
          <Card at={340}>
            <div style={cardKicker}>Ships as</div>
            <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
              {["CLI", "GitHub Action", "MCP"].map((x) => (
                <span key={x} style={{ fontSize: 24, fontWeight: 700, padding: "8px 18px", borderRadius: 999, background: T.blueWash, color: T.blueInk }}>{x}</span>
              ))}
            </div>
            <div style={{ fontSize: 23, marginTop: 14, lineHeight: 1.4, color: T.ink2 }}>In the terminal, on every PR, and inside the agent that writes the code.</div>
          </Card>
        </div>
      </div>
      <Caption>It generalizes: init on an unseen app, SusBench patterns, native Android Probes, a public-site audit, and the CLI, Action and MCP.</Caption>
    </AbsoluteFill>
  );
}

function Built({ vo }: { vo: string | null }) {
  const rows: [string, string, number][] = [
    ["Muse Spark", "runs every Probe from screenshots only.", 20],
    ["SAM 3.1", "segments each control for the evidence overlay.", 150],
    ["Muse Code", "built this repository through parallel agents, one ticket at a time.", 350],
  ];
  return (
    <AbsoluteFill style={{ ...scene, justifyContent: "center" }}>
      <Glow />
      <Voice file={vo} />
      <div style={{ position: "relative" }}>
        <In>
          <Kicker>Built with Meta’s models</Kicker>
        </In>
        <div style={{ display: "flex", flexDirection: "column", gap: 22, marginTop: 40, maxWidth: 1600 }}>
          {rows.map(([name, text, at]) => (
            <In key={name} at={at} dx={-30} dy={0}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 28, background: T.surface, border: "1px solid var(--ds-line)", borderRadius: 22, padding: "26px 34px", boxShadow: T.shadow2 }}>
                <span style={{ fontSize: 48, fontWeight: 800, letterSpacing: "-0.03em", background: T.hero, WebkitBackgroundClip: "text", color: "transparent", minWidth: 330 }}>{name}</span>
                <span style={{ fontSize: 36, fontWeight: 550, lineHeight: 1.3 }}>{text}</span>
              </div>
            </In>
          ))}
          <In at={550}>
            <div style={{ fontSize: 30, color: T.ink2, lineHeight: 1.45, marginTop: 18, maxWidth: 1400 }}>
              None of them decides the result. The diff compares recorded Traces, so the same evidence always produces the same Findings.
            </div>
          </In>
        </div>
      </div>
      <Caption>Built with Meta’s models: Muse Spark, SAM 3.1 and Muse Code, over a deterministic diff.</Caption>
    </AbsoluteFill>
  );
}

function Close({ data, vo }: { data: VideoData; vo: string | null }) {
  return (
    <AbsoluteFill data-theme="dark" style={{ ...scene, justifyContent: "center", color: "#e4e6eb" }}>
      <Glow dark />
      <Voice file={vo} />
      <div style={{ position: "relative" }}>
        <In dur={24}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 34, fontWeight: 750, letterSpacing: "-0.02em" }}>
            <span style={{ width: 40, height: 40, borderRadius: 11, background: T.hero }} />
            AgencyDiff
          </div>
        </In>
        <In at={10} dur={24}>
          <div style={{ fontSize: 128, fontWeight: 800, letterSpacing: "-0.05em", lineHeight: 1.0, marginTop: 34 }}>
            Regression tests
            <br />
            for <span style={{ background: T.hero, WebkitBackgroundClip: "text", color: "transparent" }}>human choice.</span>
          </div>
        </In>
        <In at={40}>
          <div style={{ display: "flex", gap: 18, alignItems: "center", marginTop: 48, fontSize: 32, color: "#aeb9c1" }}>
            <span style={{ fontFamily: T.mono, color: "#e4e6eb" }}>{data.repoUrl}</span>
            <span>· MIT</span>
          </div>
        </In>
      </div>
      <Caption dark>AgencyDiff: regression tests for human choice.</Caption>
    </AbsoluteFill>
  );
}

export function Demo({ data, footage }: DemoProps) {
  return (
    <AbsoluteFill style={{ background: "#fff", fontFamily: T.font }}>
      <Sequence from={0} durationInFrames={12 * FPS}><ColdOpen data={data} footage={footage} vo={footage.voCold} /></Sequence>
      <Sequence from={12 * FPS} durationInFrames={18 * FPS}><Problem vo={footage.voProblem} /></Sequence>
      <Sequence from={30 * FPS} durationInFrames={40 * FPS}><Experiment data={data} footage={footage} vo={footage.voExperiment} /></Sequence>
      <Sequence from={70 * FPS} durationInFrames={35 * FPS}><HowItWorks data={data} footage={footage} vo={footage.voHow} /></Sequence>
      <Sequence from={105 * FPS} durationInFrames={35 * FPS}><Generalize data={data} vo={footage.voGeneralize} /></Sequence>
      <Sequence from={140 * FPS} durationInFrames={30 * FPS}><Built vo={footage.voBuilt} /></Sequence>
      <Sequence from={170 * FPS} durationInFrames={10 * FPS}><Close data={data} vo={footage.voClose} /></Sequence>
    </AbsoluteFill>
  );
}
