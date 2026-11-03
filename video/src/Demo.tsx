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

// Flat and typographic: blue, navy and pale blue alongside white and near-black.
// Red and green describe code changes and measured deltas. Type and colour are the shared tokens in
// design/tokens.css (imported in index.ts): Redaction for display, its
// degraded cut for regressed values, Atkinson Hyperlegible Next for text,
// Martian Mono for code. Motion carries the story: words rise in, numbers
// count to their measured value, tallies draw stroke by stroke, and a
// value that regressed visibly degrades.
const T = {
  ink: "var(--ds-ink)",
  ink2: "var(--ds-ink-2)",
  ink3: "var(--ds-ink-3)",
  line: "var(--ds-line-strong)",
  blue: "var(--ds-blue)",
  badInk: "var(--ds-bad-ink)",
  goodInk: "var(--ds-good-ink)",
  font: "var(--ds-font)",
  display: "var(--ds-display)",
  degraded: "var(--ds-degraded)",
  mono: "var(--ds-mono)",
};
const NIGHT = "#0b0f14";
const NIGHT_INK = "#e4e6eb";
const NIGHT_INK2 = "#9aa7b0";
const NIGHT_LINE = "#2f4452";
const RED = "#e41e3f";

const v = (s: string | null | undefined) => (s === null || s === undefined || s === "" ? PENDING : s);
const ease = Easing.bezier(0.16, 1, 0.3, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const XF = 10; // crossfade frames

/** "8/30" -> [8, 30]. */
const frac = (s: string | null): [number, number] | null => {
  const m = s?.match(/^(\d+)\/(\d+)$/);
  return m ? [Number(m[1]), Number(m[2])] : null;
};

function useIn(at: number, dur = 16): number {
  const f = useCurrentFrame();
  return interpolate(f, [at, at + dur], [0, 1], { ...clamp, easing: ease });
}

function In({ at = 0, dur = 16, dy = 30, dx = 0, children, style }: { at?: number; dur?: number; dy?: number; dx?: number; children: React.ReactNode; style?: React.CSSProperties }) {
  const p = useIn(at, dur);
  return <div style={{ opacity: p, transform: `translate(${(1 - p) * dx}px, ${(1 - p) * dy}px)`, ...style }}>{children}</div>;
}

/** Headline that rises in word by word. */
function Words({ text, at = 0, stagger = 3, style, accent }: { text: string; at?: number; stagger?: number; style?: React.CSSProperties; accent?: string[] }) {
  const f = useCurrentFrame();
  const words = text.split(" ");
  return (
    <div style={style}>
      {words.map((w, i) => {
        const p = interpolate(f, [at + i * stagger, at + i * stagger + 14], [0, 1], { ...clamp, easing: ease });
        const isAccent = accent?.some((a) => w.replace(/[.,”“]/g, "") === a);
        return (
          <span key={i} style={{ display: "inline-block", overflow: "hidden", verticalAlign: "top", paddingBottom: "0.12em", marginBottom: "-0.12em" }}>
            <span style={{ display: "inline-block", transform: `translateY(${(1 - p) * 105}%)`, opacity: p, color: isAccent ? T.blue : undefined }}>
              {w}
              {i < words.length - 1 ? " " : ""}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/** Integer that counts up to its measured value. */
function CountUp({ to, at, dur = 30 }: { to: number; at: number; dur?: number }) {
  const f = useCurrentFrame();
  const n = Math.round(interpolate(f, [at, at + dur], [0, to], { ...clamp, easing: Easing.out(Easing.cubic) }));
  return <>{n}</>;
}

/** Tally marks drawn stroke by stroke: four strokes and a strike per five. */
function TallyDraw({ n, at, per = 4, height = 64, color }: { n: number; at: number; per?: number; height?: number; color: string }) {
  const f = useCurrentFrame();
  const gap = height * 0.24;
  const marks: React.ReactElement[] = [];
  let x = 4;
  let k = 0;
  const draw = (key: string, x1: number, y1: number, x2: number, y2: number) => {
    const p = interpolate(f, [at + k * per, at + k * per + 6], [0, 1], clamp);
    k++;
    marks.push(<line key={key} x1={x1} y1={y1} x2={x1 + (x2 - x1) * p} y2={y1 + (y2 - y1) * p} opacity={p > 0 ? 1 : 0} />);
  };
  const groups = Math.floor(n / 5);
  for (let g = 0; g < groups; g++) {
    for (let i = 0; i < 4; i++) draw(`g${g}${i}`, x + i * gap, 3, x + i * gap - 2, height - 3);
    draw(`g${g}s`, x - gap * 0.6, height * 0.72, x + gap * 3.6, height * 0.28);
    x += gap * 4 + height * 0.5;
  }
  for (let i = 0; i < n % 5; i++) draw(`r${i}`, x + i * gap, 3, x + i * gap - 2, height - 3);
  const w = Math.max(x + (n % 5) * gap + 6, 10);
  return (
    <svg width={w} height={height} style={{ overflow: "visible" }}>
      <g stroke={color} strokeWidth={height * 0.075} strokeLinecap="round">
        {marks}
      </g>
    </svg>
  );
}

/** A word that is clean, then flickers into the degraded cut at `at`. */
function Degrade({ children, at, style, color }: { children: React.ReactNode; at: number; style?: React.CSSProperties; color?: string }) {
  const f = useCurrentFrame();
  const t = f - at;
  const flicker = t >= 0 && t < 8 ? t % 2 === 0 : t >= 8;
  return <span style={{ fontFamily: flicker ? T.degraded : T.display, color: t >= 0 ? color ?? RED : undefined, ...style }}>{children}</span>;
}

/** Slow push-in across a beat, like a camera move. */
function Push({ dur, children, from = 1, to = 1.045 }: { dur: number; children: React.ReactNode; from?: number; to?: number }) {
  const f = useCurrentFrame();
  const s = interpolate(f, [0, dur], [from, to], clamp);
  return <AbsoluteFill style={{ transform: `scale(${s})` }}>{children}</AbsoluteFill>;
}

function Typewriter({ text, at, cps = 40 }: { text: string; at: number; cps?: number }) {
  const f = useCurrentFrame();
  const n = Math.max(0, Math.floor(((f - at) / FPS) * cps));
  const caret = n < text.length && Math.floor(f / 8) % 2 === 0;
  // The untyped rest is laid out but invisible, so lines never reflow.
  return (
    <>
      {text.slice(0, n)}
      <span style={{ position: "relative" }}>
        <span style={{ position: "absolute", left: -2, opacity: caret ? 1 : 0, color: T.blue }}>|</span>
      </span>
      <span style={{ opacity: 0 }}>{text.slice(n)}</span>
    </>
  );
}

/** One idea per frame: fades and settles in at `from`, out at `to`. */
function Beat({ from, to, children, last }: { from: number; to: number; children: React.ReactNode; last?: boolean }) {
  const f = useCurrentFrame();
  if (f < from - 1 || f > to + XF) return null;
  const o = last
    ? interpolate(f, [from, from + XF], [0, 1], clamp)
    : interpolate(f, [from, from + XF, to, to + XF], [0, 1, 1, 0], clamp);
  const s = interpolate(f, [from, from + XF + 6], [0.985, 1], { ...clamp, easing: ease });
  return (
    <AbsoluteFill style={{ opacity: o, transform: `scale(${s})` }}>
      <Sequence from={from} layout="none">
        <Push dur={to - from + XF}>{children}</Push>
      </Sequence>
    </AbsoluteFill>
  );
}

function Frame({ dark, children, center = true, pad }: { dark?: boolean; children: React.ReactNode; center?: boolean; pad?: string }) {
  return (
    <AbsoluteFill
      style={{
        background: dark ? NIGHT : "#ffffff",
        color: dark ? NIGHT_INK : T.ink,
        fontFamily: T.font,
        padding: pad ?? "96px 128px 150px",
        justifyContent: center ? "center" : "flex-start",
      }}
    >
      {children}
    </AbsoluteFill>
  );
}

/** One short line at the bottom that says what is on screen. */
function Caption({ children, dark, at = 10 }: { children: React.ReactNode; dark?: boolean; at?: number }) {
  const p = useIn(at, 14);
  return (
    <div style={{ position: "absolute", left: 120, right: 120, bottom: 54, textAlign: "center", opacity: p, fontSize: 30, lineHeight: 1.3, color: dark ? NIGHT_INK2 : T.ink2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
      {children}
    </div>
  );
}

function Label({ children, dark, style }: { children: React.ReactNode; dark?: boolean; style?: React.CSSProperties }) {
  return <div style={{ fontSize: 30, color: dark ? NIGHT_INK2 : T.ink3, ...style }}>{children}</div>;
}

function PendingNote({ label }: { label: string }) {
  return <div style={{ border: `1px solid ${T.line}`, borderRadius: 20, padding: "28px 34px", fontSize: 28, color: T.ink3 }}>{PENDING} {label}</div>;
}

function Voice({ file }: { file: string | null }) {
  return file ? <Audio src={staticFile(file)} /> : null;
}

/** Static monochrome film grain over the whole film. It never moves, so it
 *  cannot shimmer on text. */
function Grain() {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='320'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`;
  return (
    <AbsoluteFill
      style={{ pointerEvents: "none", opacity: 0.045, backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`, backgroundSize: "320px 320px" }}
    />
  );
}

// ---------------------------------------------------------------------------
// Trace playback

const SCREEN_NAMES: Record<string, string> = {
  home: "Home", settings: "Settings", privacy: "Privacy", advanced: "Advanced", location: "Location",
  location_options: "Location options", messages: "Messages", dm_options: "Message options",
  screentime: "Screen Time", st_limit: "Daily limit", st_remove: "Remove limit", plus: "Circle+",
};
const screenLabel = (s: string | null) => {
  if (!s) return "Screen";
  const [base, overlay] = s.split("+");
  return `${SCREEN_NAMES[base] ?? base}${overlay ? " dialog" : ""}`;
};

/** Index of the frame shown at local frame f when frames 0..n play over [start, end). */
function frameAt(n: number, f: number, start: number, end: number): { i: number; t: number } {
  if (n <= 0 || f < start) return { i: 0, t: Math.max(0, f - start) / 36 % 1 };
  const raw = ((f - start) / (end - start)) * n;
  if (raw >= n) return { i: n, t: ((f - end) % 36) / 36 };
  return { i: Math.floor(raw), t: raw - Math.floor(raw) };
}

/** The route so far, as stations; the current one is filled. */
function Route({ clip, i, dark, width }: { clip: Clip; i: number; dark?: boolean; width: number }) {
  const seen: string[] = [];
  for (let k = 0; k <= i; k++) {
    const name = screenLabel(clip.frames[k].screen);
    if (seen[seen.length - 1] !== name) seen.push(name);
  }
  const shown = seen.slice(-4);
  return (
    <div style={{ width, display: "flex", flexWrap: "wrap", gap: "8px 0", alignItems: "center", marginTop: 18, minHeight: 44 }}>
      {seen.length > shown.length && <span style={{ fontSize: 20, color: dark ? NIGHT_INK2 : T.ink3, marginRight: 10 }}>…</span>}
      {shown.map((s, k) => (
        <React.Fragment key={`${s}-${k}`}>
          {k > 0 && <span style={{ width: 18, height: 2, background: dark ? NIGHT_LINE : T.line }} />}
          <span
            style={{
              fontSize: 20,
              fontWeight: 600,
              padding: "6px 12px",
              borderRadius: 6,
              border: `1px solid ${k === shown.length - 1 ? "#0866ff" : dark ? NIGHT_LINE : T.line}`,
              background: k === shown.length - 1 ? "#0866ff" : "transparent",
              color: k === shown.length - 1 ? "#fff" : dark ? NIGHT_INK2 : T.ink2,
            }}
          >
            {s}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

/** A recorded Trace in a hairline frame, with a tap ripple where the Probe
 *  tapped, a ticking step counter and the route it has taken so far. */
function TracePhone({
  clip, start, end, last, width, label, dark, result, route = true,
}: {
  clip: Clip | null; start: number; end: number; last?: number; width: number; label: string; dark?: boolean; result?: string; route?: boolean;
}) {
  const f = useCurrentFrame();
  if (!clip) return <PendingNote label={label} />;
  const n = Math.min(last ?? clip.frames.length - 1, clip.frames.length - 1);
  const { i, t } = frameAt(n, f, start, end);
  const held = i === n && (f >= end || n === 0);
  const frame = clip.frames[i];
  const showTap = frame.tap && !held;
  const tapP = showTap ? interpolate(t, [0.44, 0.98], [0, 1], clamp) : 0;
  const scale = width / 430;
  const winH = clip.window * scale;
  const stepShown = held && last === undefined ? clip.steps : i;
  const enter = useIn(start - 14, 18);
  // A pointer glides from the previous tap to this screen's tap, presses,
  // and the screen advances: the Probe's actions, replayed as a cursor.
  const rest = { x: 0.5, y: 0.9 };
  const prevTap = i > 0 ? clip.frames[i - 1].tap ?? rest : rest;
  const target = frame.tap ?? prevTap;
  const glide = frame.tap && !held ? interpolate(t, [0, 0.42], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) }) : 1;
  const from = held ? target : prevTap;
  const cx = (from.x + (target.x - from.x) * glide) * width;
  const cy = (from.y + (target.y - from.y) * glide) * winH;
  const press = held ? 1 : interpolate(t, [0.4, 0.46, 0.56], [1, 0.82, 1], clamp);
  const cursorOn = f >= start - 6;
  return (
    <div style={{ display: "flex", flexDirection: "column", opacity: enter, transform: `translateY(${(1 - enter) * 40}px)` }}>
      <div style={{ width, display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
        <span style={{ fontSize: 36, fontFamily: T.display, color: dark ? NIGHT_INK : T.ink }}>{label}</span>
        <span style={{ fontFamily: T.display, fontSize: 44, color: dark ? NIGHT_INK : T.ink, fontVariantNumeric: "tabular-nums lining-nums" }}>
          {stepShown}
          <span style={{ fontSize: 22, fontFamily: T.font, color: dark ? NIGHT_INK2 : T.ink3 }}> / {clip.steps} steps</span>
        </span>
      </div>
      <div style={{ position: "relative", width, height: winH }}>
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: 30, border: `1px solid ${dark ? NIGHT_LINE : T.line}`, background: "#fff" }}>
          <Img src={staticFile(frame.file)} style={{ position: "absolute", left: 0, top: -frame.crop * scale, width, height: 860 * scale }} />
        </div>
        {frame.tap && tapP > 0 && showTap && (
          <div style={{ position: "absolute", left: frame.tap.x * width, top: frame.tap.y * winH }}>
            <div style={{ position: "absolute", width: 90, height: 90, marginLeft: -45, marginTop: -45, borderRadius: 45, border: "4px solid #0866ff", opacity: 1 - tapP, transform: `scale(${0.25 + tapP})` }} />
            <div style={{ position: "absolute", width: 24, height: 24, marginLeft: -12, marginTop: -12, borderRadius: 12, background: "#0866ff", border: "4px solid #fff", opacity: interpolate(tapP, [0, 0.1, 0.85, 1], [0, 1, 1, 0.5], clamp), transform: `scale(${interpolate(tapP, [0, 0.15, 0.3], [0.6, 1.15, 1], clamp)})` }} />
          </div>
        )}
        {cursorOn && (
          <svg
            width="46"
            height="46"
            viewBox="0 0 24 24"
            style={{ position: "absolute", left: cx - 6, top: cy - 3, transform: `scale(${press})`, transformOrigin: "6px 3px", filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.35))", overflow: "visible" }}
          >
            <path d="M5 2.5v17.2l4.6-4.3 3 6.6 3.1-1.4-3-6.5h6.3z" fill="#0b0f14" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      {route && <Route clip={clip} i={i} dark={dark} width={width} />}
      <div style={{ height: 44, marginTop: 10, fontSize: 28, color: dark ? NIGHT_INK2 : T.ink2, opacity: result && held ? 1 : 0 }}>{result}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scenes

function ColdOpen({ data, footage, vo }: { data: VideoData; footage: Footage; vo: string | null }) {
  const { coldBaseline: b, coldCandidate: c } = footage.clips;
  const f = useCurrentFrame();
  // The Intent arrives full-screen, then steps aside for the two Probes.
  const settle = interpolate(f, [44, 70], [0, 1], { ...clamp, easing: ease });
  const findingIn = useIn(372, 20);
  return (
    <AbsoluteFill style={{ background: NIGHT, color: NIGHT_INK, fontFamily: T.font }}>
      <Voice file={vo} />
      <div
        style={{
          position: "absolute",
          left: 110,
          top: interpolate(settle, [0, 1], [330, 70]),
          width: interpolate(settle, [0, 1], [1700, 620]),
          fontFamily: T.display,
          fontSize: interpolate(settle, [0, 1], [132, 70]),
          lineHeight: 1.02,
          letterSpacing: "-0.02em",
        }}
      >
        <Words text="“I do not want strangers messaging me.”" at={2} stagger={4} />
      </div>
      <div style={{ position: "absolute", left: 110, top: 400, width: 600, opacity: interpolate(f, [80, 96], [0, 1], clamp) }}>
        <div style={{ fontSize: 32, color: NIGHT_INK2, lineHeight: 1.45 }}>Two Muse computer-use Probes. Same Intent, two builds of Circle.</div>
      </div>
      <div style={{ position: "absolute", left: 110, top: 700, width: 600, opacity: findingIn, transform: `translateX(${(1 - findingIn) * -60}px)` }}>
        <Label dark>Finding</Label>
        <div style={{ fontSize: 34, fontFamily: T.display, lineHeight: 1.22, marginTop: 10 }}>
          {(() => {
            const t = v(data.teenFinding);
            const cut = t.lastIndexOf(" is ");
            return cut > 0 ? (
              <>
                {t.slice(0, cut)} is <Degrade at={390}>{t.slice(cut + 4)}</Degrade>
              </>
            ) : (
              t
            );
          })()}
        </div>
      </div>
      <div style={{ position: "absolute", right: 110, top: 40, display: "flex", gap: 56 }}>
        <TracePhone dark clip={b} start={66} end={360} width={360} label="Baseline" result="Oracle: passed" />
        <TracePhone dark clip={c} start={66} end={360} width={360} label="Candidate" result="Oracle: failed" />
      </div>
      <Caption dark at={120}>
        The baseline Probe blocks strangers in {b?.steps ?? PENDING} steps; this candidate run uses all {c?.steps ?? PENDING} and never does.
      </Caption>
    </AbsoluteFill>
  );
}

/** Schematic of the measurement pipeline, with the current stage illuminated. */
function Pipeline({ active }: { active: number }) {
  const f = useCurrentFrame();
  const names = ["Contract", "Probes", "Oracle", "Diff"];
  const detail = ["Intent + expected state", "Baseline / candidate", "Check final app state", "Compare recorded effort"];
  return <svg width="1640" height="390" viewBox="0 0 1640 390" style={{ marginTop: 55, overflow: "visible" }}>
    {names.map((name, i) => {
      const x = i * 420;
      const on = i <= active;
      const draw = interpolate(f, [6, 48], [0, 1], clamp);
      return <g key={name} transform={`translate(${x},0)`}>
        {i < 3 && <path d="M340 150h80m-16-12 16 12-16 12" fill="none" stroke={i < active ? "#0866ff" : "#c9d2da"} strokeWidth="5" strokeDasharray="120" strokeDashoffset={i === active ? 120 * (1 - draw) : 0} />}
        <rect width="340" height="290" rx="20" fill={i === active ? "#0866ff" : on ? "#e7f0ff" : "#f1f4f7"} />
        <g stroke={i === active ? "#fff" : "#0866ff"} strokeWidth="5" fill="none" strokeLinejoin="round">
          {i === 0 && <><path d="M120 40h75l30 30v120H120zM195 40v35h30" /><path d="M140 100h65m-65 28h65m-65 28h40" /></>}
          {i === 1 && <><rect x="78" y="40" width="76" height="150" rx="12" /><rect x="186" y="40" width="76" height="150" rx="12" /><path d="m97 118 16 16 25-40m66-12h40m-40 35h40m-40 35h25" /></>}
          {i === 2 && <><rect x="100" y="45" width="140" height="140" rx="16" /><path d="m127 112 30 30 55-65" /></>}
          {i === 3 && <><path d="M105 78h130M170 42v72m-65 46h130" /><path d="M100 195h140" strokeDasharray="12 10" /></>}
        </g>
        <text x="170" y="246" textAnchor="middle" fill={i === active ? "#fff" : "#1c2b33"} style={{ fontFamily: T.font, fontSize: 40 }}>{name}</text>
        <text x="170" y="340" textAnchor="middle" fill="#465a66" style={{ fontFamily: T.font, fontSize: 27 }}>{detail[i]}</text>
      </g>;
    })}
  </svg>;
}

// Text-line totals from `git show --numstat 9abc947` (the design merge).
function CodeActivity() {
  const f = useCurrentFrame();
  return <div style={{ marginTop: 44, background: NIGHT, padding: "30px 40px", borderRadius: 20, fontFamily: T.mono }}>
    <div style={{ display: "flex", justifyContent: "space-between", color: NIGHT_INK2, fontSize: 24 }}><span>agencydiff / interface update</span><span>9abc947</span></div>
    <div style={{ display: "flex", gap: 70, marginTop: 22, fontSize: 106, lineHeight: 1.2 }}>
      <span style={{ color: "#ff9aad" }}>−<CountUp to={6070} at={10} dur={68} /></span>
      <span style={{ color: "#91e5b1" }}>+<CountUp to={6522} at={10} dur={68} /></span>
    </div>
    <div style={{ display: "flex", gap: 6, marginTop: 20 }}>
      {Array.from({ length: 48 }, (_, i) => <div key={i} style={{ height: 18, flex: 1, background: i < 23 ? "#e41e3f" : "#31a24c", opacity: f >= 12 + i ? 1 : 0.12 }} />)}
    </div>
  </div>;
}

function Problem({ vo }: { vo: string | null }) {
  const verbs = ["Decline.", "Restrict.", "Cancel.", "Delete."];
  return (
    <>
      <Voice file={vo} />
      <Beat from={0} to={120}>
        <Frame>
          <Words text="Coding agents ship new interfaces every day." at={4} stagger={3} style={{ fontFamily: T.display, fontSize: 112, lineHeight: 1.02, letterSpacing: "-0.025em", maxWidth: 1600 }} />
          <CodeActivity />
        </Frame>
      </Beat>
      <Beat from={120} to={250}>
        <Frame>
          <Words text="Some of them make saying no harder." at={4} stagger={4} accent={["no"]} style={{ fontFamily: T.display, fontSize: 132, lineHeight: 1.02, letterSpacing: "-0.025em", maxWidth: 1600 }} />
        </Frame>
      </Beat>
      {verbs.map((w, i) => (
        <Beat key={w} from={250 + i * 40} to={250 + (i + 1) * 40}>
          <AbsoluteFill style={{ background: i % 2 === 0 ? "#0866ff" : "#e7f0ff", color: i % 2 === 0 ? "#fff" : "#0064e0", alignItems: "center", justifyContent: "center" }}>
            <Words text={w} at={2} style={{ fontFamily: T.display, fontSize: 300, letterSpacing: "-0.03em", lineHeight: 1, textAlign: "center" }} />
          </AbsoluteFill>
        </Beat>
      ))}
      <Beat from={410} to={480} last>
        <Frame>
          <Words text="Few teams re-test these choices." at={2} stagger={4} style={{ fontFamily: T.display, fontSize: 120, lineHeight: 1.05, letterSpacing: "-0.025em", maxWidth: 1600 }} />
        </Frame>
      </Beat>
    </>
  );
}

function DiffBlock({ lines, label, at = 0 }: { lines: string[]; label: string; at?: number }) {
  const f = useCurrentFrame();
  if (lines.length === 0) return <PendingNote label={label} />;
  return (
    <div>
      <Label style={{ marginBottom: 20 }}>{label}</Label>
      <div style={{ background: NIGHT, borderRadius: 24, padding: "30px 36px", fontFamily: T.mono }}>
        {lines.map((l, i) => {
          const p = interpolate(f, [at + i * 5, at + i * 5 + 10], [0, 1], { ...clamp, easing: ease });
          return (
            <div key={i} style={{ fontSize: 24, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-all", opacity: p, transform: `translateX(${(1 - p) * 24}px)`, color: l.startsWith("+") ? "#9fe8ae" : l.startsWith("-") ? "#ffa3b1" : "#8a9ba8" }}>
              {l}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stamp({ ok, text, at }: { ok: boolean; text: string; at: number }) {
  const f = useCurrentFrame();
  const p = interpolate(f, [at, at + 12], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.6)) });
  return (
    <div style={{ marginTop: 40, display: "inline-flex", alignItems: "center", gap: 18, opacity: p, transform: `scale(${0.85 + p * 0.15})`, transformOrigin: "left center" }}>
      <svg width="56" height="56" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r="26" fill={ok ? "#1f7a35" : "#c8102e"} />
        {ok ? <path d="M16 29l8 8 16-17" stroke="#fff" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" /> : <path d="M19 19l18 18M37 19L19 37" stroke="#fff" strokeWidth="5" strokeLinecap="round" />}
      </svg>
      <span style={{ fontFamily: T.display, fontSize: 64, color: ok ? T.goodInk : T.badInk }}>{text}</span>
    </div>
  );
}

function Experiment({ data, footage, vo }: { data: VideoData; footage: Footage; vo: string | null }) {
  const { withBaseline: b, withCandidate: c } = footage.clips;
  const f = useCurrentFrame();
  const toggle = c ? Math.min(c.steps, c.frames.length - 1) : 0;
  const declineC = Number(data.declineCandidate);
  const noGate = frac(data.agentNoGate);
  const gated = frac(data.agentGated);
  // Phones beat: candidate plays its steps over [580, 920); the count follows.
  const candStep = Math.min(toggle, Math.max(0, Math.floor(((f - 580) / 340) * toggle)));
  return (
    <>
      <Voice file={vo} />
      <Beat from={0} to={330}>
        <Frame>
          <div style={{ background: NIGHT, borderRadius: 24, border: "2px solid #0866ff", overflow: "hidden" }}>
            <div style={{ padding: "24px 36px", background: "#163a63", display: "flex", justifyContent: "space-between", fontFamily: T.mono, fontSize: 28, color: "#e4e6eb" }}>
              <span>Muse Code</span><span>~/agencydiff</span>
            </div>
            <div style={{ padding: "36px 44px 48px", color: NIGHT_INK }}>
              <div style={{ color: "#75b6ff", fontFamily: T.mono, fontSize: 27, marginBottom: 26 }}>❯ Task</div>
              <div style={{ fontFamily: T.font, fontSize: 62, lineHeight: 1.22 }}><Typewriter text={v(data.onboardPrompt)} at={8} cps={35} /></div>
            </div>
          </div>
          <Caption at={30}>Recreated terminal · verbatim task from eval/agent-prs/tasks.json.</Caption>
        </Frame>
      </Beat>
      <Beat from={330} to={560}>
        <Frame>
          <div style={{ maxWidth: 1560 }}>
            <DiffBlock label="The agent’s diff" lines={data.regressingDiff} at={8} />
            <Stamp ok={false} text="AgencyDiff check failed" at={60} />
            <In at={80}>
              <div style={{ fontSize: 34, color: T.ink2, marginTop: 18 }}>{v(data.withholdFinding)}</div>
            </In>
          </div>
          <Caption at={60}>The first-run location prompt never opens, so declining leaves the first screen.</Caption>
        </Frame>
      </Beat>
      <Beat from={560} to={1000}>
        <Frame pad="36px 96px 120px">
          <div style={{ display: "flex", gap: 80, alignItems: "flex-start", justifyContent: "center" }}>
            <div style={{ width: 560, paddingTop: 190 }}>
              <Label>Steps to decline precise location</Label>
              <div style={{ fontFamily: T.display, fontSize: 210, lineHeight: 1, marginTop: 16, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums lining-nums" }}>
                <span style={{ color: T.ink3 }}>{v(data.declineBaseline)}</span>
                <span style={{ fontFamily: T.font, fontWeight: 300, fontSize: 110, color: T.ink3 }}> → </span>
                {Number.isFinite(declineC) ? (
                  <Degrade at={370}>{f - 560 < 370 ? Math.max(1, Math.min(declineC, candStep)) : declineC}</Degrade>
                ) : (
                  PENDING
                )}
              </div>
              <div style={{ fontSize: 32, color: T.ink2, marginTop: 10 }}>baseline → candidate, median of 3 Muse Probes</div>
            </div>
            <TracePhone clip={b} start={20} end={50} last={1} width={360} label="Baseline" />
            <TracePhone clip={c} start={20} end={360} last={toggle} width={360} label="Candidate" />
          </div>
          <Caption at={30}>Baseline: Not now on the prompt. Candidate: Settings, then Location, to reach the toggle.</Caption>
        </Frame>
      </Beat>
      <Beat from={1000} to={1200}>
        <Frame>
          <div style={{ maxWidth: 1560 }}>
            <DiffBlock label="The same task, with AgencyDiff in the loop" lines={data.fixedDiff.slice(0, 8)} at={8} />
            <Stamp ok text={`AgencyDiff check ${v(data.gateClaimB).toLowerCase()}ed, 0 Findings`} at={60} />
          </div>
          <Caption at={50}>The gated agent keeps the prompt and its Not now button.</Caption>
        </Frame>
      </Beat>
      <Beat from={1200} to={1560} last>
        <Frame>
          <Label>Pull requests that broke saying no</Label>
          <div style={{ display: "flex", gap: 100, marginTop: 34 }}>
            {[{ value: noGate, label: "Agent alone", at: 10 }, { value: gated, label: "With AgencyDiff", at: 120 }].map(({ value, label, at }) => (
              <div key={label} style={{ width: 740 }}>
                <div style={{ fontSize: 36, marginBottom: 20 }}>{label}</div>
                {value ? <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 10 }}>
                    {Array.from({ length: value[1] }, (_, i) => {
                      const revealed = f - 1200 >= at + i * 3;
                      const bad = i < value[0];
                      return <div key={i} style={{ height: 76, border: `1px solid ${T.line}`, background: revealed ? (bad ? T.badInk : T.goodInk) : "#fff", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.mono, fontSize: 28 }}>{revealed ? (bad ? "×" : "✓") : ""}</div>;
                    })}
                  </div>
                  <In at={at + value[1] * 3}><div style={{ fontFamily: T.display, fontSize: 100, marginTop: 22, color: value[0] ? T.badInk : T.goodInk }}>{value[0]}/{value[1]}</div></In>
                </> : PENDING}
              </div>
            ))}
          </div>
          <Caption at={40}>Muse-confirmed regressions over {noGate?.[1] ?? PENDING} pull requests per side, from eval/agent-prs/results.json.</Caption>
        </Frame>
      </Beat>
    </>
  );
}

function HowItWorks({ data, footage, vo }: { data: VideoData; footage: Footage; vo: string | null }) {
  const steps: [string, string][] = [
    ["Contract.", "Decisions, Intents and Oracles, written once."],
    ["Probes.", "Each Intent attempted on both builds."],
    ["Oracle.", "Final app state decides. The agent’s claim never counts."],
    ["Diff.", "Same Traces in, same Findings out."],
  ];
  const gate = frac(data.gateCaught);
  const screens = frac(data.screensCaught);
  const f = useCurrentFrame();
  const wipe = interpolate(f, [680, 730], [100, 0], { ...clamp, easing: ease });
  return (
    <>
      <Voice file={vo} />
      {steps.map(([k, s], i) => (
        <Beat key={k} from={i * 75} to={(i + 1) * 75}>
          <Frame>
            <Words text={k} at={2} style={{ fontFamily: T.display, fontSize: 140, color: T.blue, letterSpacing: "-0.03em", lineHeight: 1 }} />
            <In at={10}><div style={{ fontSize: 42, color: T.ink2, marginTop: 20 }}>{s}</div></In>
            <Pipeline active={i} />
          </Frame>
        </Beat>
      ))}
      <Beat from={300} to={640}>
        <Frame>
          <Label>Seeded agency regressions caught, of 20</Label>
          <div style={{ display: "grid", gridTemplateColumns: "560px 1fr", rowGap: 56, columnGap: 40, alignItems: "center", marginTop: 50 }}>
            <div style={{ fontSize: 44, fontWeight: 600 }}>AgencyDiff replay gate</div>
            <div style={{ display: "flex", alignItems: "center", gap: 48 }}>
              <span style={{ fontFamily: T.display, fontSize: 150, lineHeight: 1, minWidth: 330, fontVariantNumeric: "tabular-nums lining-nums" }}>
                {gate ? <><CountUp to={gate[0]} at={14} dur={60} />/{gate[1]}</> : PENDING}
              </span>
              {gate && <TallyDraw n={gate[0]} at={14} per={3} height={64} color="#0866ff" />}
            </div>
            <div style={{ fontSize: 44, fontWeight: 600 }}>Model reviewing PR screenshots</div>
            <div style={{ display: "flex", alignItems: "center", gap: 48 }}>
              <span style={{ fontFamily: T.degraded, fontSize: 150, lineHeight: 1, minWidth: 330, color: T.badInk, fontVariantNumeric: "tabular-nums lining-nums" }}>
                {screens ? <><CountUp to={screens[0]} at={90} dur={10} />/{screens[1]}</> : PENDING}
              </span>
              {screens && <TallyDraw n={screens[0]} at={92} per={3} height={64} color={RED} />}
            </div>
          </div>
          <In at={150}>
            <div style={{ fontSize: 34, color: T.ink3, marginTop: 50 }}>
              {v(data.gateFalseAlarms)} false alarms · {v(data.gateCost)} in model calls
            </div>
          </In>
          <Caption at={150}>A judge shown every screen of the path still catches only {v(data.walkthroughCaught)} and cannot count effort.</Caption>
        </Frame>
      </Beat>
      <Beat from={640} to={1020} last>
        <Frame>
          <div style={{ display: "flex", gap: 100, alignItems: "center" }}>
            {footage.samSheet ? (
              <div style={{ position: "relative", width: 720, height: 602, borderRadius: 30, overflow: "hidden", border: `1px solid ${T.line}` }}>
                <Img src={staticFile(footage.samSheet)} style={{ width: 720, height: 602, objectFit: "cover" }} />
                <div style={{ position: "absolute", inset: 0, background: "#fff", clipPath: `inset(0 0 0 ${100 - wipe}%)` }} />
              </div>
            ) : (
              <PendingNote label="SAM 3.1 overlay" />
            )}
            <div style={{ flex: 1 }}>
              <Words text="SAM 3.1 segments every control on the recorded screen." at={20} stagger={3} style={{ fontFamily: T.display, fontSize: 84, lineHeight: 1.08, letterSpacing: "-0.02em" }} />
              <In at={150}>
                <div style={{ fontFamily: T.mono, fontSize: 30, marginTop: 56, color: T.ink2 }}>
                  <Typewriter text="pnpm run propose-fix --report runs/<id>" at={150} cps={30} />
                </div>
                <div style={{ fontSize: 32, color: T.ink2, marginTop: 18, lineHeight: 1.4 }}>Turns a failing report into a minimal patch, re-run until the check passes.</div>
              </In>
            </div>
          </div>
          <Caption at={60}>Decline in red, allow in green: the SAM 3.1 overlay behind a Finding.</Caption>
        </Frame>
      </Beat>
    </>
  );
}

function Fact({ big, text, mono, count }: { big: string; text: string; mono?: boolean; count?: [number, number] | null }) {
  return (
    <Frame>
      <div style={{ fontSize: mono ? 120 : 300, fontWeight: mono ? 500 : 400, letterSpacing: mono ? "-0.02em" : "-0.03em", lineHeight: 1, fontFamily: mono ? T.mono : T.display, fontVariantNumeric: "tabular-nums lining-nums" }}>
        {mono ? <Typewriter text={big} at={6} cps={24} /> : count ? <><CountUp to={count[0]} at={6} dur={26} />/{count[1]}</> : <Words text={big} at={4} />}
      </div>
      <In at={30}>
        <div style={{ fontSize: 52, color: T.ink2, marginTop: 44, maxWidth: 1500, lineHeight: 1.3 }}>{text}</div>
      </In>
    </Frame>
  );
}

function Generalize({ data, vo }: { data: VideoData; vo: string | null }) {
  return (
    <>
      <Voice file={vo} />
      <Beat from={0} to={248}>
        <Fact mono big="agencydiff init" text="Drafted contracts for an unseen ntfy server from a 22-step read-only crawl: 36 controls, 3 contracts kept." />
        <Caption at={40}>Contract drafting on an app AgencyDiff had never seen.</Caption>
      </Beat>
      <Beat from={248} to={495}>
        <Fact big={v(data.susDetected)} count={frac(data.susDetected)} text={`SusBench-derived manipulative patterns detected, with ${v(data.susFalseAlarms)} controls alarmed.`} />
        <Caption at={40}>Lab pages built from the SusBench pattern taxonomy, Muse Probes at k=3.</Caption>
      </Beat>
      <Beat from={495} to={742}>
        <Fact big="Android" text="Native Probes on an emulator, with the same Oracles and the same diff." />
        <Caption at={40}>A native Android build of Circle, probed with both seeded regressions caught.</Caption>
      </Beat>
      <Beat from={742} to={990} last>
        <Frame>
          <Label>Public-site audit</Label>
          <Words text={v(data.auditRealId)} at={6} stagger={2} style={{ fontFamily: T.display, fontSize: 84, letterSpacing: "-0.015em", marginTop: 20, lineHeight: 1.1 }} />
          <In at={90}>
            <div style={{ display: "flex", gap: 20, marginTop: 80 }}>
              {["CLI", "GitHub Action", "MCP server"].map((x, i) => (
                <In key={x} at={90 + i * 10}>
                  <span style={{ fontSize: 44, padding: "16px 30px", borderRadius: 14, border: `2px solid ${T.ink}`, fontWeight: 600 }}>{x}</span>
                </In>
              ))}
            </div>
          </In>
        </Frame>
        <Caption at={40}>The live California DMV renewal page against a concept redesign, under the same Contract.</Caption>
      </Beat>
    </>
  );
}

function Built({ vo }: { vo: string | null }) {
  const rows: [string, string][] = [
    ["Muse Spark", "runs every Probe from screenshots alone."],
    ["SAM 3.1", "segments each control for the evidence overlay."],
    ["Muse Code", "built this repository through parallel agents."],
  ];
  return (
    <>
      <Voice file={vo} />
      {rows.map(([name, text], i) => (
        <Beat key={name} from={i * 150} to={i * 150 + 150}>
          <Frame>
            <Words text={name} at={4} stagger={5} style={{ fontFamily: T.display, fontSize: 220, letterSpacing: "-0.03em", color: T.blue, lineHeight: 1 }} />
            <In at={22}>
              <div style={{ fontSize: 60, letterSpacing: "-0.01em", marginTop: 26 }}>{text}</div>
            </In>
          </Frame>
        </Beat>
      ))}
      <Beat from={450} to={660} last>
        <Frame>
          <Words text="None of them decides the result. The diff compares recorded Traces." at={6} stagger={4} style={{ fontFamily: T.display, fontSize: 104, letterSpacing: "-0.02em", lineHeight: 1.1, maxWidth: 1600 }} />
        </Frame>
      </Beat>
    </>
  );
}

function Close({ data, vo }: { data: VideoData; vo: string | null }) {
  const f = useCurrentFrame();
  const out = interpolate(f, [222, 240], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ background: NIGHT }}>
    <Frame dark>
      <Voice file={vo} />
      <Words text="Regression tests for human choice." at={4} stagger={5} accent={["human", "choice"]} style={{ fontFamily: T.display, fontSize: 168, letterSpacing: "-0.03em", lineHeight: 1.0, maxWidth: 1500 }} />
      <In at={50}>
        <div style={{ display: "flex", gap: 30, alignItems: "baseline", marginTop: 70, fontSize: 40 }}>
          <span style={{ fontFamily: T.display, fontWeight: 700, color: NIGHT_INK }}>AgencyDiff</span>
          <span style={{ fontFamily: T.mono, color: NIGHT_INK2, fontSize: 32 }}>{data.repoUrl}</span>
        </div>
      </In>
    </Frame>
    <AbsoluteFill style={{ background: "#000", opacity: 1 - out }} />
    </AbsoluteFill>
  );
}

export function Demo({ data, footage }: DemoProps) {
  return (
    <AbsoluteFill style={{ background: "#fff", fontFamily: T.font }}>
      <Sequence from={0} durationInFrames={15 * FPS}><ColdOpen data={data} footage={footage} vo={footage.voCold} /></Sequence>
      <Sequence from={15 * FPS} durationInFrames={16 * FPS}><Problem vo={footage.voProblem} /></Sequence>
      <Sequence from={31 * FPS} durationInFrames={52 * FPS}><Experiment data={data} footage={footage} vo={footage.voExperiment} /></Sequence>
      <Sequence from={83 * FPS} durationInFrames={34 * FPS}><HowItWorks data={data} footage={footage} vo={footage.voHow} /></Sequence>
      <Sequence from={117 * FPS} durationInFrames={33 * FPS}><Generalize data={data} vo={footage.voGeneralize} /></Sequence>
      <Sequence from={150 * FPS} durationInFrames={22 * FPS}><Built vo={footage.voBuilt} /></Sequence>
      <Sequence from={172 * FPS} durationInFrames={8 * FPS}><Close data={data} vo={footage.voClose} /></Sequence>
      <Grain />
    </AbsoluteFill>
  );
}
