import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { AbsoluteFill, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame, } from "remotion";
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
const v = (s) => (s === null || s === undefined || s === "" ? PENDING : s);
function Fade({ children, dur = 24 }) {
    const f = useCurrentFrame();
    const opacity = interpolate(f, [0, dur], [0, 1], { extrapolateRight: "clamp" });
    const y = interpolate(f, [0, dur], [14, 0], { extrapolateRight: "clamp" });
    return _jsx("div", { style: { opacity, transform: `translateY(${y}px)` }, children: children });
}
function Kicker({ children }) {
    return (_jsx("div", { style: { fontSize: 21, fontWeight: 700, letterSpacing: 3, color: C.accent, textTransform: "uppercase" }, children: children }));
}
function Caption({ children }) {
    return (_jsx("div", { style: {
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
        }, children: children }));
}
function PendingNote({ label }) {
    return (_jsxs("div", { style: {
            border: `2px dashed ${C.amber}`,
            background: C.amberWash,
            color: C.amber,
            borderRadius: 10,
            padding: "28px 34px",
            fontSize: 26,
            fontWeight: 600,
        }, children: [PENDING, " ", label] }));
}
function Shot({ file, label, height = 560 }) {
    if (!file)
        return _jsx(PendingNote, { label: label });
    return (_jsx(Img, { src: staticFile(file), style: { width: "100%", height, objectFit: "cover", objectPosition: "top", borderRadius: 10, border: `1px solid ${C.line}` } }));
}
function Stat({ label, value, tone }) {
    return (_jsxs("div", { style: {
            background: tone === "bad" ? C.badWash : tone === "good" ? C.goodWash : C.wash,
            border: `1px solid ${C.line}`,
            borderRadius: 10,
            padding: "26px 30px",
            minWidth: 300,
        }, children: [_jsx("div", { style: { fontSize: 52, fontWeight: 700, color: tone === "bad" ? C.bad : tone === "good" ? C.good : C.ink }, children: value }), _jsx("div", { style: { fontSize: 22, color: C.muted, marginTop: 6 }, children: label })] }));
}
const base = {
    background: C.paper,
    color: C.ink,
    fontFamily: FONT,
    padding: "72px 88px 150px",
};
function Hook({ data }) {
    return (_jsxs(AbsoluteFill, { style: { ...base, justifyContent: "center" }, children: [_jsxs(Fade, { children: [_jsx(Kicker, { children: "AgencyDiff" }), _jsx("div", { style: { fontSize: 76, fontWeight: 700, lineHeight: 1.12, letterSpacing: -1, marginTop: 28, maxWidth: 1400 }, children: "Teams ship UI changes every day with agents." }), _jsx("div", { style: { fontSize: 40, color: C.muted, lineHeight: 1.4, marginTop: 30, maxWidth: 1250 }, children: "Nobody re-checks whether people can still do what they came to do." }), _jsxs("div", { style: { fontSize: 24, color: C.faint, marginTop: 44 }, children: ["Decline cost ", v(data.declineBaseline), " ", "->", " ", v(data.declineCandidate), " actions, ", v(data.declineVisibility), " on the first screen. Measured, not judged. (eval/results/summary.json, report.json)"] })] }), _jsx(Caption, { children: "Teams ship UI changes every day with agents. Nobody re-checks whether users can still do what they came to do." })] }));
}
function Idea() {
    const rows = [
        ["Intent", "One explicit thing a person wants to accomplish."],
        ["Probe", "A computer-use agent run as a measuring instrument, not a simulated person."],
        ["Oracle", "The check of the final app state. The agent's own claim never counts."],
        ["Agency Diff", "The same Intents on baseline and candidate, compared deterministically."],
    ];
    return (_jsxs(AbsoluteFill, { style: base, children: [_jsxs(Fade, { children: [_jsx(Kicker, { children: "The idea" }), _jsx("div", { style: { fontSize: 58, fontWeight: 700, marginTop: 20 }, children: "Intents as tests" }), _jsx("div", { style: { marginTop: 48, display: "flex", flexDirection: "column", gap: 22 }, children: rows.map(([term, def]) => (_jsxs("div", { style: { display: "flex", gap: 28, borderBottom: `1px solid ${C.line}`, paddingBottom: 20 }, children: [_jsx("div", { style: { width: 280, fontSize: 32, fontWeight: 700 }, children: term }), _jsx("div", { style: { fontSize: 30, color: C.muted, lineHeight: 1.4 }, children: def })] }, term))) })] }), _jsx(Caption, { children: "Intents as tests. Muse probes are instruments, not fake users. An Oracle checks the final state." })] }));
}
function ReplayPanel({ files, title, tone }) {
    const f = useCurrentFrame();
    if (files.length === 0)
        return _jsx(PendingNote, { label: `replay footage (${title})` });
    const idx = Math.min(files.length - 1, Math.floor(f / 55));
    return (_jsxs("div", { style: { flex: 1 }, children: [_jsx("div", { style: { fontSize: 24, fontWeight: 700, color: tone === "bad" ? C.bad : C.good, marginBottom: 12 }, children: title }), _jsx(Img, { src: staticFile(files[idx]), style: { width: "100%", height: 520, objectFit: "contain", background: C.wash, borderRadius: 10, border: `1px solid ${C.line}` } }), _jsxs("div", { style: { fontSize: 20, color: C.faint, marginTop: 10 }, children: ["Trace step ", idx + 1, " of ", files.length, " (recorded screenshots)"] })] }));
}
function DemoScene({ data, footage }) {
    return (_jsxs(AbsoluteFill, { style: base, children: [_jsxs(Fade, { children: [_jsx(Kicker, { children: "Demo" }), _jsxs("div", { style: { fontSize: 52, fontWeight: 700, marginTop: 16 }, children: ["PR \"simplify onboarding\" ", "->", " the AgencyDiff check fails"] }), _jsxs("div", { style: { display: "flex", gap: 36, marginTop: 36 }, children: [_jsx(ReplayPanel, { files: footage.replayBaseline, title: "Baseline: decline visible", tone: "good" }), _jsx(ReplayPanel, { files: footage.replayCandidate, title: "Candidate: decline hidden", tone: "bad" })] }), _jsxs("div", { style: { display: "flex", gap: 24, marginTop: 30, alignItems: "stretch" }, children: [_jsx(Stat, { label: "Decline (Protective Intent), actions", value: `${v(data.declineBaseline)} -> ${v(data.declineCandidate)}`, tone: "bad" }), _jsx(Stat, { label: "Revoke, actions", value: `${v(data.revokeBaseline)} -> ${v(data.revokeCandidate)}`, tone: "bad" }), _jsx(Stat, { label: "Asymmetry (saying no vs yes)", value: `${v(data.asymmetryBaseline)}x -> ${v(data.asymmetryCandidate)}x`, tone: "bad" }), _jsx("div", { style: { flex: 1 }, children: footage.samOverlay ? _jsx(Shot, { file: footage.samOverlay, label: "SAM overlay", height: 190 }) : _jsx(PendingNote, { label: "SAM 3.1 overlay footage" }) })] }), _jsxs("div", { style: { fontSize: 24, color: C.muted, marginTop: 22 }, children: [PENDING, " Propose Fix flow and PR check comment: no fix UI or open PR exists in this checkout yet, so this draft shows the measured Finding instead of a fabricated green check."] })] }), _jsx(Caption, { children: "A PR simplifies onboarding. The check fails: declining takes more steps and leaves the first screen." })] }));
}
function Evidence({ data }) {
    return (_jsxs(AbsoluteFill, { style: base, children: [_jsxs(Fade, { children: [_jsx(Kicker, { children: "Evidence" }), _jsx("div", { style: { fontSize: 52, fontWeight: 700, marginTop: 16 }, children: "Benchmarks, from recorded Traces" }), _jsxs("div", { style: { display: "flex", gap: 24, marginTop: 44, flexWrap: "wrap" }, children: [_jsx(Stat, { label: "AgencyDiff (scripted Probes) caught", value: v(data.scriptedCaught), tone: "good" }), _jsx(Stat, { label: "False alarms on harmless changes", value: v(data.scriptedFalseAlarms) }), _jsx(Stat, { label: "Muse-as-judge caught", value: v(data.judgeCaught) }), _jsx(Stat, { label: "Judge false alarms", value: v(data.judgeFalseAlarms) }), _jsx(Stat, { label: "Judge consistency", value: v(data.judgeConsistency) }), _jsx(Stat, { label: "SusBench-derived patterns detected", value: v(data.susDetected), tone: "good" }), _jsx(Stat, { label: "SusBench false alarms", value: v(data.susFalseAlarms), tone: "bad" })] }), _jsxs("div", { style: { fontSize: 30, marginTop: 44, lineHeight: 1.5 }, children: ["Public-site time-to-fact (docs/audit.md): ", _jsx("strong", { children: v(data.dmvTimeToFact) })] }), _jsxs("div", { style: { fontSize: 24, color: C.muted, marginTop: 16 }, children: ["Muse computer-use Probe results: ", v(data.museProbes), ". Sources: eval/results/summary.json, eval/susbench/results.json, docs/audit.md, read at render time."] })] }), _jsx(Caption, { children: "The benchmark table, SusBench-derived results, and the public-site time-to-fact result." })] }));
}
function Built({ footage }) {
    return (_jsxs(AbsoluteFill, { style: base, children: [_jsxs(Fade, { children: [_jsx(Kicker, { children: "How it is built" }), _jsx("div", { style: { fontSize: 52, fontWeight: 700, marginTop: 16 }, children: "Instruments, Oracles, deterministic diff" }), _jsxs("div", { style: { display: "flex", gap: 36, marginTop: 40 }, children: [_jsxs("div", { style: { flex: 1, display: "flex", flexDirection: "column", gap: 18, fontSize: 29, lineHeight: 1.5 }, children: [_jsxs("div", { children: [_jsx("strong", { children: "Muse Spark" }), " computer use runs each Probe from screenshots only."] }), _jsxs("div", { children: [_jsx("strong", { children: "SAM 3.1" }), " grounds controls for the evidence overlay."] }), _jsxs("div", { children: [_jsx("strong", { children: "Muse" }), " built this repo through delegated agents, one ticket at a time."] }), _jsxs("div", { children: ["The ", _jsx("strong", { children: "Agency Diff" }), " itself is deterministic: same Traces in, same Findings out."] })] }), _jsxs("div", { style: { flex: 1 }, children: [footage.liveReplay ? (_jsx(OffthreadVideo, { src: staticFile(footage.liveReplay), style: { width: "100%", height: 480, objectFit: "cover", borderRadius: 10 } })) : (_jsx(PendingNote, { label: "live/replay footage (media/live-replay.mp4 not present in this checkout)" })), _jsx("div", { style: { marginTop: 20 }, children: _jsx(Shot, { file: footage.reportDiff, label: "report viewer footage (run scripts/capture-footage.ts)", height: 240 }) })] })] })] }), _jsx(Caption, { children: "Muse Spark computer use, SAM 3.1, Muse, and a deterministic diff." })] }));
}
function Close({ data }) {
    return (_jsxs(AbsoluteFill, { style: { ...base, justifyContent: "center", alignItems: "flex-start" }, children: [_jsxs(Fade, { children: [_jsxs("div", { style: { fontSize: 84, fontWeight: 700, letterSpacing: -1.5, lineHeight: 1.1 }, children: ["Regression tests", _jsx("br", {}), "for human choice."] }), _jsx("div", { style: { fontSize: 36, color: C.muted, marginTop: 34 }, children: data.repoUrl }), _jsxs("div", { style: { fontSize: 24, color: C.faint, marginTop: 20 }, children: ["Draft cut. ", PENDING, " marks every number or clip that is not final yet; re-render after the next eval run."] })] }), _jsx(Caption, { children: "Regression tests for human choice." })] }));
}
export function Demo({ data, footage }) {
    return (_jsxs(AbsoluteFill, { style: { background: C.paper }, children: [_jsx(Sequence, { from: 0, durationInFrames: 15 * FPS, children: _jsx(Hook, { data: data }) }), _jsx(Sequence, { from: 15 * FPS, durationInFrames: 30 * FPS, children: _jsx(Idea, {}) }), _jsx(Sequence, { from: 45 * FPS, durationInFrames: 45 * FPS, children: _jsx(DemoScene, { data: data, footage: footage }) }), _jsx(Sequence, { from: 90 * FPS, durationInFrames: 40 * FPS, children: _jsx(Evidence, { data: data }) }), _jsx(Sequence, { from: 130 * FPS, durationInFrames: 30 * FPS, children: _jsx(Built, { footage: footage }) }), _jsx(Sequence, { from: 160 * FPS, durationInFrames: 20 * FPS, children: _jsx(Close, { data: data }) })] }));
}
