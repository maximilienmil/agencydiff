import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
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
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
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

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bad" | "good" }) {
  return (
    <div
      style={{
        background: tone === "bad" ? C.badWash : tone === "good" ? C.goodWash : C.wash,
        border: `1px solid ${C.line}`,
        borderRadius: 10,
        padding: "22px 28px",
        minWidth: 260,
        flex: 1,
      }}
    >
      <div style={{ fontSize: 48, fontWeight: 700, color: tone === "bad" ? C.bad : tone === "good" ? C.good : C.ink }}>
        {value}
      </div>
      <div style={{ fontSize: 21, color: C.muted, marginTop: 6, lineHeight: 1.35 }}>{label}</div>
    </div>
  );
}

const base: React.CSSProperties = {
  background: C.paper,
  color: C.ink,
  fontFamily: FONT,
  padding: "64px 88px 150px",
};

function Phone({
  file,
  label,
  chip,
  chipTone,
  height = 560,
}: {
  file: string | null;
  label: string;
  chip?: string;
  chipTone?: "bad" | "good";
  height?: number;
}) {
  if (!file) return <PendingNote label={label} />;
  const width = Math.round((height * 430) / 860);
  return (
    <div>
      <div style={{ fontSize: 21, fontWeight: 700, color: C.muted, marginBottom: 10 }}>{label}</div>
      <div style={{ position: "relative", width, height, borderRadius: 14, overflow: "hidden", border: `1px solid ${C.line}` }}>
        <Img src={staticFile(file)} style={{ width, height, objectFit: "cover", objectPosition: "top" }} />
        {chip && (
          <div
            style={{
              position: "absolute",
              left: 10,
              right: 10,
              bottom: 10,
              background: chipTone === "bad" ? C.bad : C.good,
              color: C.paper,
              borderRadius: 8,
              fontSize: 19,
              fontWeight: 700,
              padding: "10px 12px",
              lineHeight: 1.3,
            }}
          >
            {chip}
          </div>
        )}
      </div>
    </div>
  );
}

function Voice({ file }: { file: string | null }) {
  if (!file) return null;
  return <Audio src={staticFile(file)} />;
}

function ColdOpen({ data, footage, vo }: { data: VideoData; footage: Footage; vo: string | null }) {
  const f = useCurrentFrame();
  const leftDone = f > 120;
  const rightLost = f > 200;
  const findingIn = interpolate(f, [250, 290], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={base}>
      <Voice file={vo} />
      <Fade>
        <Kicker>AgencyDiff · live probes</Kicker>
        <div style={{ fontSize: 54, fontWeight: 700, marginTop: 14, lineHeight: 1.15 }}>
          “I do not want strangers messaging me.”
        </div>
        <div style={{ display: "flex", gap: 40, marginTop: 30 }}>
          <Phone
            file={leftDone ? footage.coldBaselineDecided : footage.coldBaselineStart}
            label="Probe A · baseline"
            chip={leftDone ? "Reached the choice · blocked strangers ✓" : undefined}
            chipTone="good"
            height={540}
          />
          <Phone
            file={rightLost ? footage.coldCandidateLost : footage.coldCandidateStart}
            label="Probe B · candidate"
            chip={rightLost ? "Lost · ended on the wrong screen" : undefined}
            chipTone="bad"
            height={540}
          />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 18, justifyContent: "flex-start" }}>
            <div style={{ fontSize: 26, color: C.muted, lineHeight: 1.5 }}>
              Two computer-use probes, same intent, two builds of the same app.
            </div>
            <div
              style={{
                opacity: findingIn,
                transform: `translateY(${(1 - findingIn) * 20}px)`,
                background: C.badWash,
                border: `1px solid ${C.line}`,
                borderLeft: `8px solid ${C.bad}`,
                borderRadius: 10,
                padding: "22px 26px",
              }}
            >
              <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 2, color: C.bad }}>FINDING</div>
              <div style={{ fontSize: 25, fontWeight: 600, marginTop: 8, lineHeight: 1.4 }}>{v(data.teenFinding)}</div>
            </div>
          </div>
        </div>
      </Fade>
      <Caption>Two probes try the same intent — “I do not want strangers messaging me” — on two builds. The right one gets lost.</Caption>
    </AbsoluteFill>
  );
}

function Problem({ vo }: { vo: string | null }) {
  const f = useCurrentFrame();
  const l2 = interpolate(f, [60, 90], [0, 1], { extrapolateRight: "clamp" });
  const l3 = interpolate(f, [150, 180], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ ...base, justifyContent: "center" }}>
      <Voice file={vo} />
      <Fade>
        <Kicker>The problem</Kicker>
        <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.15, letterSpacing: -1, marginTop: 24, maxWidth: 1500 }}>
          Coding agents ship UI every day.
        </div>
        <div style={{ opacity: l2, fontSize: 44, color: C.muted, lineHeight: 1.35, marginTop: 26, maxWidth: 1400 }}>
          Nobody re-checks whether people can still say no.
        </div>
        <div style={{ opacity: l3, fontSize: 26, color: C.faint, marginTop: 40 }}>
          Decline · restrict · cancel · delete — the protective intents nobody re-tests.
        </div>
      </Fade>
      <Caption>Coding agents ship interface changes daily. Nobody re-checks whether users can still say no.</Caption>
    </AbsoluteFill>
  );
}

function DiffCard({ title, lines, tone }: { title: string; lines: string[]; tone: "bad" | "good" }) {
  if (lines.length === 0) return <PendingNote label={title} />;
  return (
    <div style={{ background: C.ink, borderRadius: 10, padding: "18px 20px", fontFamily: C.mono }}>
      <div style={{ fontSize: 19, fontWeight: 700, color: tone === "bad" ? "#f2a49d" : "#9fd8b4", marginBottom: 10 }}>
        {title}
      </div>
      {lines.map((l, i) => (
        <div
          key={i}
          style={{
            fontSize: 17,
            lineHeight: 1.55,
            whiteSpace: "pre",
            overflow: "hidden",
            color: l.startsWith("+") ? "#9fd8b4" : l.startsWith("-") ? "#f2a49d" : "#b9b4aa",
          }}
        >
          {l}
        </div>
      ))}
    </div>
  );
}

function Experiment({ data, footage, vo }: { data: VideoData; footage: Footage; vo: string | null }) {
  const f = useCurrentFrame();
  // One left-column card at a time: only the active beat renders, so the
  // stack can never overflow the caption bar.
  const beat = f >= 930 ? 3 : f >= 620 ? 2 : f >= 300 ? 1 : 0;
  return (
    <AbsoluteFill style={base}>
      <Voice file={vo} />
      <Kicker>The experiment · “{v(data.onboardTitle)}”</Kicker>
      <div style={{ display: "flex", gap: 36, marginTop: 24 }}>
        <div style={{ flex: 1.25 }}>
          {beat === 0 && (
            <Fade>
              <div style={{ background: C.wash, border: `1px solid ${C.line}`, borderRadius: 10, padding: "20px 24px" }}>
                <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 2, color: C.accent }}>THE PROMPT, VERBATIM</div>
                <div style={{ fontSize: 23, lineHeight: 1.5, marginTop: 10 }}>“{v(data.onboardPrompt)}”</div>
              </div>
            </Fade>
          )}
          {beat === 1 && (
            <Fade>
              <DiffCard title="The agent’s diff — first-run prompt never opens" lines={data.regressingDiff} tone="bad" />
              <div
                style={{
                  marginTop: 14,
                  background: C.badWash,
                  borderLeft: `8px solid ${C.bad}`,
                  borderRadius: 10,
                  padding: "16px 20px",
                }}
              >
                <div style={{ fontSize: 22, fontWeight: 700, color: C.bad }}>AgencyDiff check: FAILED</div>
                <div style={{ fontSize: 21, marginTop: 6, lineHeight: 1.4 }}>{v(data.withholdFinding)}</div>
              </div>
            </Fade>
          )}
          {beat === 2 && (
            <Fade>
              <DiffCard title="The gated agent’s diff — prompt stays, decline stays" lines={data.fixedDiff} tone="good" />
              <div
                style={{
                  marginTop: 14,
                  background: C.goodWash,
                  borderLeft: `8px solid ${C.good}`,
                  borderRadius: 10,
                  padding: "16px 20px",
                  fontSize: 22,
                  fontWeight: 700,
                  color: C.good,
                }}
              >
                AgencyDiff check: GATE {v(data.gateClaimB)} · 0 findings
              </div>
            </Fade>
          )}
          {beat === 3 && (
            <Fade>
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <Stat label="Ordinary PRs that broke “no”, no gate (30 attempts, measured)" value={v(data.agentNoGate)} tone="bad" />
                <Stat label="Same tasks with the AgencyDiff check (30 attempts, measured)" value={v(data.agentGated)} tone="good" />
              </div>
            </Fade>
          )}
        </div>
        <div style={{ flex: 1, display: "flex", gap: 24, alignItems: "flex-start" }}>
          <Phone file={footage.withBaseline} label="Baseline · first screen" chip={`${v(data.declineBaseline)} action · decline visible ✓`} chipTone="good" height={500} />
          <Phone file={f > 500 ? footage.withCandidateDeep : footage.withCandidate} label="Candidate · decline buried" chip={`${v(data.declineCandidate)} actions · decline ${v(data.declineVisibility)}`} chipTone="bad" height={500} />
        </div>
      </div>
      <Caption>A coding agent gets “simplify onboarding”. Its diff buries decline — the check fails. The gated agent’s version passes: 8/30 vs 0/30.</Caption>
    </AbsoluteFill>
  );
}

function PipeStep({ label, sub }: { label: string; sub: string }) {
  return (
    <div style={{ flex: 1, background: C.wash, border: `1px solid ${C.line}`, borderRadius: 10, padding: "18px 20px" }}>
      <div style={{ fontSize: 26, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 20, color: C.muted, marginTop: 8, lineHeight: 1.4 }}>{sub}</div>
    </div>
  );
}

function HowItWorks({ data, footage, vo }: { data: VideoData; footage: Footage; vo: string | null }) {
  const f = useCurrentFrame();
  const beat = (at: number) => interpolate(f, [at, at + 20], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={base}>
      <Voice file={vo} />
      <Kicker>How it works</Kicker>
      <div style={{ fontSize: 46, fontWeight: 700, marginTop: 12 }}>Contract → probes → oracle → deterministic diff</div>
      <div style={{ display: "flex", gap: 14, marginTop: 26, alignItems: "stretch" }}>
        <PipeStep label="Contract" sub="Decisions, intents, oracles" />
        <PipeStep label="Probes" sub="Computer-use runs, both builds" />
        <PipeStep label="Oracle" sub="Final app state decides — never the agent’s claim" />
        <PipeStep label="Diff" sub="Same traces in, same findings out" />
      </div>
      <div style={{ display: "flex", gap: 20, marginTop: 24, opacity: beat(150) }}>
        <Stat label="Screenshot review caught (1 screenshot per intent)" value={v(data.screensCaught)} tone="bad" />
        <Stat label={`Replay gate · ${v(data.gateFalseAlarms)} false alarms · ${v(data.gateCost)}`} value={v(data.gateCaught)} tone="good" />
        <div style={{ flex: 1.2, background: C.wash, border: `1px solid ${C.line}`, borderRadius: 10, padding: "22px 28px" }}>
          <div style={{ fontSize: 21, color: C.muted }}>Prompting is not a test. Measuring is.</div>
          <div style={{ fontSize: 24, fontWeight: 600, marginTop: 8, lineHeight: 1.4 }}>
            A judge with a full walkthrough still catches only {v(data.walkthroughCaught)} — and can’t count effort.
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 20, marginTop: 20, opacity: beat(350) }}>
        <div style={{ flex: 1.2, display: "flex", gap: 20, background: C.wash, border: `1px solid ${C.line}`, borderRadius: 10, padding: "20px 24px", alignItems: "center" }}>
          {footage.samSheet ? (
            <Img src={staticFile(footage.samSheet)} style={{ width: 300, height: 251, objectFit: "cover", borderRadius: 8, border: `1px solid ${C.line}` }} />
          ) : (
            <PendingNote label="SAM 3.1 overlay" />
          )}
          <div>
            <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: 2, color: C.accent }}>SAM 3.1 EVIDENCE</div>
            <div style={{ fontSize: 22, color: C.muted, marginTop: 10, lineHeight: 1.45 }}>
              Every control grounded: decline in red, allow in green — the overlay behind each finding.
            </div>
          </div>
        </div>
        <div style={{ flex: 1, background: C.goodWash, border: `1px solid ${C.line}`, borderRadius: 10, padding: "22px 28px" }}>
          <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: 2, color: C.good }}>PROPOSE FIX → GREEN</div>
          <div style={{ fontFamily: C.mono, fontSize: 20, marginTop: 10 }}>pnpm run propose-fix --report runs/&lt;id&gt;</div>
          <div style={{ fontSize: 21, color: C.muted, marginTop: 10, lineHeight: 1.45 }}>
            A failing report becomes a minimal diff, replayed in a clean worktree and re-run until the check passes.
          </div>
        </div>
      </div>
      <Caption>Contract, probes, oracle, deterministic diff. Screenshot review catches 1/20; the replay gate catches 19/20 with no false alarms, for $0.</Caption>
    </AbsoluteFill>
  );
}

function Generalize({ data, vo }: { data: VideoData; vo: string | null }) {
  const f = useCurrentFrame();
  const beat = (at: number) => interpolate(f, [at, at + 20], [0, 1], { extrapolateRight: "clamp" });
  const card: React.CSSProperties = { flex: 1, background: C.wash, border: `1px solid ${C.line}`, borderRadius: 10, padding: "20px 24px" };
  return (
    <AbsoluteFill style={base}>
      <Voice file={vo} />
      <Kicker>It generalizes</Kicker>
      <div style={{ fontSize: 46, fontWeight: 700, marginTop: 12 }}>One command on apps it has never seen</div>
      <div style={{ display: "flex", gap: 18, marginTop: 28 }}>
        <div style={card}>
          <div style={{ fontFamily: C.mono, fontSize: 21, fontWeight: 700 }}>agencydiff init</div>
          <div style={{ fontSize: 22, marginTop: 10, lineHeight: 1.45 }}>Unseen ntfy server: 22-step crawl, 36 controls, read-only — contracts drafted, 3 kept.</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 40, fontWeight: 700, color: C.good }}>{v(data.susDetected)}</div>
          <div style={{ fontSize: 22, marginTop: 6, lineHeight: 1.4 }}>SusBench-derived patterns detected ({v(data.susFalseAlarms)} controls alarmed).</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 40, fontWeight: 700 }}>Android</div>
          <div style={{ fontSize: 22, marginTop: 6, lineHeight: 1.4 }}>Native probes on a real emulator — same oracles, same diff.</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 18, marginTop: 18, opacity: beat(300) }}>
        <div style={{ ...card, flex: 1.2 }}>
          <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: 2, color: C.accent }}>PUBLIC-SITE AUDIT</div>
          <div style={{ fontSize: 23, marginTop: 10, lineHeight: 1.45 }}>{v(data.auditRealId)}</div>
        </div>
        <div style={{ ...card, flex: 1 }}>
          <div style={{ fontFamily: C.mono, fontSize: 21, fontWeight: 700 }}>CLI · GitHub Action · MCP</div>
          <div style={{ fontSize: 22, marginTop: 10, lineHeight: 1.45 }}>The same engine in the terminal, on every PR, and inside the agent that writes the code.</div>
        </div>
      </div>
      <Caption>It generalizes: one init on an unseen app, SusBench patterns, native Android probes, a public-site audit, and the CLI, Action, and MCP.</Caption>
    </AbsoluteFill>
  );
}

function Built({ vo }: { vo: string | null }) {
  const f = useCurrentFrame();
  const beat = (at: number) => interpolate(f, [at, at + 20], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ ...base, justifyContent: "center" }}>
      <Voice file={vo} />
      <Fade>
        <Kicker>Built with Meta’s stack</Kicker>
        <div style={{ display: "flex", flexDirection: "column", gap: 24, marginTop: 36, maxWidth: 1550 }}>
          <div style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.35 }}>
            <span style={{ color: C.accent, fontWeight: 700 }}>Muse Spark</span> runs every probe from screenshots only.
          </div>
          <div style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.35, opacity: beat(150) }}>
            <span style={{ color: C.accent, fontWeight: 700 }}>SAM 3.1</span> grounds each control for the evidence overlay.
          </div>
          <div style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.35, opacity: beat(350) }}>
            <span style={{ color: C.accent, fontWeight: 700 }}>Muse</span> built this repo through parallel agents, one ticket at a time.
          </div>
          <div style={{ fontSize: 28, color: C.muted, lineHeight: 1.45, opacity: beat(550) }}>
            None of that decides the result: the diff compares recorded traces, so the same evidence always produces the same findings.
          </div>
        </div>
      </Fade>
      <Caption>Built with Meta’s stack — Muse Spark, SAM 3.1, and Muse — over a deterministic diff.</Caption>
    </AbsoluteFill>
  );
}

function Close({ data, vo }: { data: VideoData; vo: string | null }) {
  return (
    <AbsoluteFill style={{ ...base, justifyContent: "center", alignItems: "flex-start" }}>
      <Voice file={vo} />
      <Fade>
        <div style={{ fontSize: 84, fontWeight: 700, letterSpacing: -1.5, lineHeight: 1.1 }}>
          Regression tests
          <br />
          for human choice.
        </div>
        <div style={{ fontSize: 36, color: C.muted, marginTop: 34 }}>{data.repoUrl}</div>
      </Fade>
      <Caption>AgencyDiff: regression tests for human choice.</Caption>
    </AbsoluteFill>
  );
}

export function Demo({ data, footage }: DemoProps) {
  return (
    <AbsoluteFill style={{ background: C.paper }}>
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
