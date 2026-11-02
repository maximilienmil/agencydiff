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

// Flat and typographic: white or near-black, one accent (blue), red and
// green only on measured deltas. Colours and type are the shared tokens in
// design/tokens.css (imported in index.ts).
const T = {
  ink: "var(--ds-ink)",
  ink2: "var(--ds-ink-2)",
  ink3: "var(--ds-ink-3)",
  line: "var(--ds-line-strong)",
  blue: "var(--ds-blue)",
  badInk: "var(--ds-bad-ink)",
  goodInk: "var(--ds-good-ink)",
  font: "var(--ds-font)",
  mono: "var(--ds-mono)",
};
const NIGHT = "#0b0f14";
const NIGHT_INK = "#e4e6eb";
const NIGHT_INK2 = "#9aa7b0";
const NIGHT_LINE = "#2f4452";
const RED_ON_NIGHT = "#ff6b81";

const v = (s: string | null | undefined) => (s === null || s === undefined || s === "" ? PENDING : s);
const ease = Easing.bezier(0.2, 0.8, 0.2, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const XF = 14; // crossfade length in frames

/** "8/30" -> "30". */
const denom = (s: string | null) => s?.split("/")[1] ?? PENDING;

function useIn(at: number, dur = 18): number {
  const f = useCurrentFrame();
  return interpolate(f, [at, at + dur], [0, 1], { ...clamp, easing: ease });
}

function In({ at = 0, dur = 18, dy = 16, children, style }: { at?: number; dur?: number; dy?: number; children: React.ReactNode; style?: React.CSSProperties }) {
  const p = useIn(at, dur);
  return <div style={{ opacity: p, transform: `translateY(${(1 - p) * dy}px)`, ...style }}>{children}</div>;
}

/** One idea per frame: a beat fades in at `from` and out at `to` (scene frames). */
function Beat({ from, to, children, last }: { from: number; to: number; children: React.ReactNode; last?: boolean }) {
  const f = useCurrentFrame();
  if (f < from - 1 || f > to + XF) return null;
  const o = last
    ? interpolate(f, [from, from + XF], [0, 1], clamp)
    : interpolate(f, [from, from + XF, to, to + XF], [0, 1, 1, 0], clamp);
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <Sequence from={from} layout="none">
        {children}
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
        letterSpacing: "-0.01em",
        justifyContent: center ? "center" : "flex-start",
      }}
    >
      {children}
    </AbsoluteFill>
  );
}

/** A single short line at the bottom that says what is on screen. */
function Caption({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  const p = useIn(8, 16);
  return (
    <div style={{ position: "absolute", left: 128, right: 128, bottom: 58, textAlign: "center", opacity: p, fontSize: 28, lineHeight: 1.3, color: dark ? NIGHT_INK2 : T.ink2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
      {children}
    </div>
  );
}

function Label({ children, dark, style }: { children: React.ReactNode; dark?: boolean; style?: React.CSSProperties }) {
  return <div style={{ fontSize: 26, fontWeight: 600, color: dark ? NIGHT_INK2 : T.ink3, ...style }}>{children}</div>;
}

function PendingNote({ label }: { label: string }) {
  return <div style={{ border: `1px solid ${T.line}`, borderRadius: 20, padding: "28px 34px", fontSize: 26, color: T.ink3 }}>{PENDING} {label}</div>;
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
      style={{
        pointerEvents: "none",
        opacity: 0.045,
        backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`,
        backgroundSize: "320px 320px",
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Trace playback

/** A recorded Trace: screenshot in a hairline frame, plain labels. Frames
 *  0..last play evenly over [start, end); in the second half of each step a
 *  tap ripple lands where the Probe tapped. On the held last frame the tap
 *  repeats, so the viewer sees where the next tap goes. */
function TracePhone({
  clip,
  start,
  end,
  last,
  width,
  label,
  dark,
  result,
}: {
  clip: Clip | null;
  start: number;
  end: number;
  last?: number;
  width: number;
  label: string;
  dark?: boolean;
  result?: string;
}) {
  const f = useCurrentFrame();
  if (!clip) return <PendingNote label={label} />;
  const n = Math.min(last ?? clip.frames.length - 1, clip.frames.length - 1);
  let i = 0;
  let t = 0;
  if (n > 0 && f >= start) {
    const raw = ((f - start) / (end - start)) * n;
    if (raw >= n) {
      i = n;
      t = ((f - end) % 36) / 36;
    } else {
      i = Math.floor(raw);
      t = raw - i;
    }
  } else if (n === 0) {
    t = (Math.max(0, f - start) % 36) / 36;
  }
  const held = i === n && (f >= end || n === 0);
  const frame = clip.frames[i];
  const showTap = frame.tap && (!held || n === 0 || last !== undefined);
  const tapP = showTap ? interpolate(t, [0.4, 0.95], [0, 1], clamp) : 0;
  const scale = width / 430;
  const winH = clip.window * scale;
  const stepShown = held && last === undefined ? clip.steps : i;
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ width, display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 18 }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: dark ? NIGHT_INK : T.ink }}>{label}</span>
        <span style={{ fontSize: 24, color: dark ? NIGHT_INK2 : T.ink3, fontVariantNumeric: "tabular-nums" }}>
          Step {stepShown} of {clip.steps}
        </span>
      </div>
      <div style={{ position: "relative", width, height: winH, overflow: "hidden", borderRadius: 30, border: `1px solid ${dark ? NIGHT_LINE : T.line}`, background: "#fff" }}>
        <Img src={staticFile(frame.file)} style={{ position: "absolute", left: 0, top: -frame.crop * scale, width, height: 860 * scale }} />
        {frame.tap && tapP > 0 && (
          <div style={{ position: "absolute", left: frame.tap.x * width, top: frame.tap.y * winH }}>
            <div style={{ position: "absolute", width: 72, height: 72, marginLeft: -36, marginTop: -36, borderRadius: 36, border: "3px solid #0866ff", opacity: 1 - tapP, transform: `scale(${0.3 + tapP})` }} />
            <div style={{ position: "absolute", width: 20, height: 20, marginLeft: -10, marginTop: -10, borderRadius: 10, background: "#0866ff", border: "3px solid #fff", opacity: interpolate(tapP, [0, 0.12, 0.85, 1], [0, 1, 1, 0.5], clamp) }} />
          </div>
        )}
      </div>
      <div style={{ height: 40, marginTop: 16, fontSize: 24, color: dark ? NIGHT_INK2 : T.ink2, opacity: result && held ? 1 : 0 }}>{result}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scenes

function ColdOpen({ data, footage, vo }: { data: VideoData; footage: Footage; vo: string | null }) {
  const { coldBaseline: b, coldCandidate: c } = footage.clips;
  const findingIn = useIn(296, 20);
  return (
    <Frame dark center={false} pad="40px 96px 120px">
      <Voice file={vo} />
      <div style={{ display: "flex", gap: 80, height: "100%" }}>
        <div style={{ width: 600, display: "flex", flexDirection: "column", paddingTop: 40 }}>
          <In>
            <div style={{ fontSize: 72, fontWeight: 750, lineHeight: 1.05, letterSpacing: "-0.04em" }}>“I do not want strangers messaging me.”</div>
          </In>
          <In at={24}>
            <div style={{ fontSize: 28, color: NIGHT_INK2, lineHeight: 1.45, marginTop: 30 }}>Muse computer-use Probes on the baseline and the candidate build of Circle.</div>
          </In>
          <div style={{ marginTop: "auto", opacity: findingIn, transform: `translateY(${(1 - findingIn) * 24}px)` }}>
            <Label dark>Finding</Label>
            <div style={{ fontSize: 30, fontWeight: 650, lineHeight: 1.35, marginTop: 10 }}>{v(data.teenFinding)}</div>
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", gap: 64, justifyContent: "flex-end" }}>
          <TracePhone dark clip={b} start={24} end={282} width={430} label="Baseline" result="Oracle: passed" />
          <TracePhone dark clip={c} start={24} end={282} width={430} label="Candidate" result="Oracle: failed" />
        </div>
      </div>
      <Caption dark>
        The baseline Probe blocks strangers in {b?.steps ?? PENDING} steps; this candidate run uses all {c?.steps ?? PENDING} and never does.
      </Caption>
    </Frame>
  );
}

function Problem({ vo }: { vo: string | null }) {
  return (
    <>
      <Voice file={vo} />
      <Beat from={0} to={250}>
        <Frame>
          <In at={6}>
            <div style={{ fontSize: 120, fontWeight: 800, lineHeight: 1.0, letterSpacing: "-0.05em", maxWidth: 1500 }}>Coding agents change interfaces every day.</div>
          </In>
        </Frame>
      </Beat>
      <Beat from={250} to={540} last>
        <Frame>
          <In at={6}>
            <div style={{ fontSize: 96, fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.045em", maxWidth: 1600 }}>
              Few teams re-test whether people can still <span style={{ color: T.blue }}>say no</span>.
            </div>
          </In>
          <In at={60}>
            <div style={{ fontSize: 40, color: T.ink3, marginTop: 48, fontWeight: 500 }}>Decline. Restrict. Cancel. Delete.</div>
          </In>
        </Frame>
      </Beat>
    </>
  );
}

function DiffBlock({ lines, label }: { lines: string[]; label: string }) {
  if (lines.length === 0) return <PendingNote label={label} />;
  return (
    <div>
      <Label style={{ marginBottom: 18 }}>{label}</Label>
      <div style={{ background: NIGHT, borderRadius: 24, padding: "28px 32px", fontFamily: T.mono }}>
        {lines.map((l, i) => (
          <div key={i} style={{ fontSize: 22, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-all", color: l.startsWith("+") ? "#9fe8ae" : l.startsWith("-") ? "#ffa3b1" : "#8a9ba8" }}>
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}

function Verdict({ ok, text, at = 40 }: { ok: boolean; text: string; at?: number }) {
  return (
    <In at={at}>
      <div style={{ marginTop: 36, fontSize: 40, fontWeight: 750, letterSpacing: "-0.02em", color: ok ? T.goodInk : T.badInk }}>{text}</div>
    </In>
  );
}

function Experiment({ data, footage, vo }: { data: VideoData; footage: Footage; vo: string | null }) {
  const { withBaseline: b, withCandidate: c } = footage.clips;
  // Candidate frame 6 is Settings > Location, where the toggle finally is.
  const toggle = c ? Math.min(6, c.frames.length - 1) : 0;
  return (
    <>
      <Voice file={vo} />
      <Beat from={0} to={240}>
        <Frame>
          <Label>The task given to a coding agent</Label>
          <In at={8}>
            <div style={{ fontSize: 62, fontWeight: 700, lineHeight: 1.25, letterSpacing: "-0.03em", marginTop: 26, maxWidth: 1600 }}>“{v(data.onboardPrompt)}”</div>
          </In>
          <Caption>The prompt, verbatim, from eval/agent-prs/tasks.json.</Caption>
        </Frame>
      </Beat>
      <Beat from={240} to={480}>
        <Frame>
          <div style={{ maxWidth: 1500 }}>
            <DiffBlock label="The agent’s diff" lines={data.regressingDiff} />
            <Verdict ok={false} text="AgencyDiff check failed" />
            <In at={70}>
              <div style={{ fontSize: 30, color: T.ink2, marginTop: 12 }}>{v(data.withholdFinding)}</div>
            </In>
          </div>
          <Caption>The first-run location prompt never opens, so declining leaves the first screen.</Caption>
        </Frame>
      </Beat>
      <Beat from={480} to={810}>
        <Frame pad="40px 96px 120px">
          <div style={{ display: "flex", gap: 90, alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 520 }}>
              <Label>Declining precise location, measured</Label>
              <div style={{ fontSize: 120, fontWeight: 800, letterSpacing: "-0.05em", marginTop: 12, fontVariantNumeric: "tabular-nums" }}>
                <span style={{ color: T.ink3, fontWeight: 600 }}>{v(data.declineBaseline)} → </span>
                <span style={{ color: T.badInk }}>{v(data.declineCandidate)}</span>
              </div>
              <div style={{ fontSize: 30, color: T.ink2 }}>steps, baseline → candidate</div>
            </div>
            <TracePhone clip={b} start={20} end={21} last={0} width={420} label="Baseline" />
            <TracePhone clip={c} start={20} end={250} last={toggle} width={420} label="Candidate" />
          </div>
          <Caption>Baseline: Not now on the prompt. Candidate: Settings, then Location, to reach the toggle.</Caption>
        </Frame>
      </Beat>
      <Beat from={810} to={1010}>
        <Frame>
          <div style={{ maxWidth: 1500 }}>
            <DiffBlock label="The same task, with AgencyDiff in the loop" lines={data.fixedDiff.slice(0, 9)} />
            <Verdict ok text={`AgencyDiff check: ${v(data.gateClaimB)}, 0 Findings`} />
          </div>
          <Caption>The gated agent keeps the prompt and its Not now button.</Caption>
        </Frame>
      </Beat>
      <Beat from={1010} to={1200} last>
        <Frame>
          <Label>Pull requests that broke saying no</Label>
          <div style={{ display: "flex", gap: 160, marginTop: 30 }}>
            <In at={10}>
              <div style={{ fontSize: 200, fontWeight: 800, letterSpacing: "-0.06em", lineHeight: 1, color: T.badInk, fontVariantNumeric: "tabular-nums" }}>{v(data.agentNoGate)}</div>
              <div style={{ fontSize: 32, color: T.ink2, marginTop: 18 }}>Agent alone</div>
            </In>
            <In at={40}>
              <div style={{ fontSize: 200, fontWeight: 800, letterSpacing: "-0.06em", lineHeight: 1, color: T.goodInk, fontVariantNumeric: "tabular-nums" }}>{v(data.agentGated)}</div>
              <div style={{ fontSize: 32, color: T.ink2, marginTop: 18 }}>With AgencyDiff in the loop</div>
            </In>
          </div>
          <Caption>Muse-confirmed regressions over {denom(data.agentNoGate)} pull requests per side, from eval/agent-prs/results.json.</Caption>
        </Frame>
      </Beat>
    </>
  );
}

function HowItWorks({ data, footage, vo }: { data: VideoData; footage: Footage; vo: string | null }) {
  const steps: [string, string][] = [
    ["Contract", "Decisions, Intents and Oracles, written once."],
    ["Probes", "Each Intent attempted on both builds."],
    ["Oracle", "Final app state decides success."],
    ["Diff", "Deterministic: same Traces, same Findings."],
  ];
  const ratio = (s: string | null) => {
    const m = s?.match(/^(\d+)\/(\d+)$/);
    return m ? Number(m[1]) / Number(m[2]) : 0;
  };
  return (
    <>
      <Voice file={vo} />
      <Beat from={0} to={330}>
        <Frame>
          <div style={{ display: "flex", flexDirection: "column", gap: 34 }}>
            {steps.map(([k, s], i) => (
              <In key={k} at={10 + i * 30}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 40 }}>
                  <span style={{ fontSize: 34, fontWeight: 700, color: T.blue, width: 40, fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
                  <span style={{ fontSize: 76, fontWeight: 800, letterSpacing: "-0.04em", width: 420 }}>{k}</span>
                  <span style={{ fontSize: 36, color: T.ink2 }}>{s}</span>
                </div>
              </In>
            ))}
          </div>
          <Caption>The agent’s own claim never counts; the Oracle reads the app’s final state.</Caption>
        </Frame>
      </Beat>
      <Beat from={330} to={700}>
        <Frame>
          <Label>Seeded agency regressions caught</Label>
          <div style={{ display: "flex", flexDirection: "column", gap: 44, marginTop: 40, maxWidth: 1500 }}>
            {[
              ["AgencyDiff replay gate", data.gateCaught, T.blue, `${v(data.gateFalseAlarms)} false alarms · ${v(data.gateCost)}`],
              ["Model reviewing PR screenshots", data.screensCaught, "#65676b", ""],
            ].map(([name, val, color, note], i) => (
              <In key={String(name)} at={10 + i * 40}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 40, fontWeight: 650 }}>{name}</span>
                  <span style={{ fontSize: 110, fontWeight: 800, letterSpacing: "-0.05em", fontVariantNumeric: "tabular-nums" }}>{v(val as string | null)}</span>
                </div>
                <div style={{ height: 12, background: "var(--ds-surface-2)", borderRadius: 6, marginTop: 8 }}>
                  <div style={{ height: 12, borderRadius: 6, background: color as string, width: `${ratio(val as string | null) * 100}%` }} />
                </div>
                {note && <div style={{ fontSize: 28, color: T.ink3, marginTop: 14 }}>{note}</div>}
              </In>
            ))}
          </div>
          <Caption>A judge shown every screen of the path still catches only {v(data.walkthroughCaught)} and cannot count effort.</Caption>
        </Frame>
      </Beat>
      <Beat from={700} to={1050} last>
        <Frame>
          <div style={{ display: "flex", gap: 100, alignItems: "center" }}>
            {footage.samSheet ? (
              <Img src={staticFile(footage.samSheet)} style={{ width: 600, height: 502, objectFit: "cover", borderRadius: 30, border: `1px solid ${T.line}` }} />
            ) : (
              <PendingNote label="SAM 3.1 overlay" />
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 1.1 }}>SAM 3.1 segments every control on the recorded screen.</div>
              <In at={120}>
                <div style={{ fontFamily: T.mono, fontSize: 30, marginTop: 50, color: T.ink2 }}>pnpm run propose-fix --report runs/&lt;id&gt;</div>
                <div style={{ fontSize: 30, color: T.ink2, marginTop: 14, lineHeight: 1.4 }}>Turns a failing report into a minimal patch, re-run until the check passes.</div>
              </In>
            </div>
          </div>
          <Caption>Decline in red, allow in green: the SAM 3.1 overlay behind a Finding.</Caption>
        </Frame>
      </Beat>
    </>
  );
}

function Fact({ big, text, mono }: { big: string; text: string; mono?: boolean }) {
  return (
    <Frame>
      <In at={6}>
        <div style={{ fontSize: mono ? 110 : 200, fontWeight: 800, letterSpacing: mono ? "-0.02em" : "-0.06em", lineHeight: 1, fontFamily: mono ? T.mono : T.font, fontVariantNumeric: "tabular-nums" }}>{big}</div>
      </In>
      <In at={30}>
        <div style={{ fontSize: 44, color: T.ink2, marginTop: 40, maxWidth: 1400, lineHeight: 1.3, fontWeight: 500 }}>{text}</div>
      </In>
    </Frame>
  );
}

function Generalize({ data, vo }: { data: VideoData; vo: string | null }) {
  return (
    <>
      <Voice file={vo} />
      <Beat from={0} to={262}>
        <Fact mono big="agencydiff init" text="Drafted contracts for an unseen ntfy server from a 22-step read-only crawl: 36 controls, 3 contracts kept." />
        <Caption>Contract drafting on an app AgencyDiff had never seen.</Caption>
      </Beat>
      <Beat from={262} to={525}>
        <Fact big={v(data.susDetected)} text={`SusBench-derived manipulative patterns detected, with ${v(data.susFalseAlarms)} controls alarmed.`} />
        <Caption>Lab pages built from the SusBench pattern taxonomy, Muse Probes at k=3.</Caption>
      </Beat>
      <Beat from={525} to={787}>
        <Fact big="Android" text="Native Probes on an emulator, with the same Oracles and the same diff." />
        <Caption>A native Android build of Circle, probed with both seeded regressions caught.</Caption>
      </Beat>
      <Beat from={787} to={1050} last>
        <Frame>
          <In at={6}>
            <Label>Public-site audit</Label>
            <div style={{ fontSize: 64, fontWeight: 750, letterSpacing: "-0.03em", marginTop: 16 }}>{v(data.auditRealId)}</div>
          </In>
          <In at={60}>
            <div style={{ fontSize: 44, color: T.ink2, marginTop: 70 }}>Ships as a CLI, a GitHub Action and an MCP server.</div>
          </In>
        </Frame>
        <Caption>The live California DMV renewal page against a concept redesign, under the same Contract.</Caption>
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
        <Beat key={name} from={i * 200} to={i * 200 + 200}>
          <Frame>
            <In at={6}>
              <div style={{ fontSize: 150, fontWeight: 800, letterSpacing: "-0.05em", color: T.blue }}>{name}</div>
            </In>
            <In at={24}>
              <div style={{ fontSize: 56, fontWeight: 600, letterSpacing: "-0.025em", marginTop: 20 }}>{text}</div>
            </In>
          </Frame>
        </Beat>
      ))}
      <Beat from={600} to={900} last>
        <Frame>
          <In at={6}>
            <div style={{ fontSize: 76, fontWeight: 750, letterSpacing: "-0.04em", lineHeight: 1.15, maxWidth: 1500 }}>
              None of them decides the result. The diff compares recorded Traces.
            </div>
          </In>
        </Frame>
      </Beat>
    </>
  );
}

function Close({ data, vo }: { data: VideoData; vo: string | null }) {
  return (
    <Frame dark>
      <Voice file={vo} />
      <In dur={24}>
        <div style={{ fontSize: 140, fontWeight: 800, letterSpacing: "-0.055em", lineHeight: 1.0 }}>
          Regression tests
          <br />
          for human choice.
        </div>
      </In>
      <In at={36}>
        <div style={{ display: "flex", gap: 28, alignItems: "baseline", marginTop: 60, fontSize: 36 }}>
          <span style={{ fontWeight: 750, color: "#4c8dff" }}>AgencyDiff</span>
          <span style={{ fontFamily: T.mono, color: NIGHT_INK2 }}>{data.repoUrl}</span>
        </div>
      </In>
    </Frame>
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
      <Grain />
    </AbsoluteFill>
  );
}
