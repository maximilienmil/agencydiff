# AgencyDiff demo video

A 3:00, 1920x1080, 30fps film with burned-in captions. Flat and
typographic: white or near-black, one accent (blue #0866FF), red and green
only on measured deltas, one idea per frame with calm crossfades, and a
static monochrome film grain at 4.5% opacity over everything. Colours and
type come from `design/tokens.css`, the same file the report site and Circle
use. Recorded Trace screenshots play back step by step in hairline frames,
with a tap ripple where the Probe tapped and step counters ticking.

## Structure (all timings in `src/Demo.tsx`)

0:00–0:12 cold open: two probes on "I do not want strangers messaging me"
(baseline reaches the Messages decision, candidate ends lost), Finding
animates in. 0:12–0:30 the problem in plain words. 0:30–1:10 the experiment:
the verbatim "Simplify onboarding" prompt from `eval/agent-prs/tasks.json`,
the regressing agent diff, the red check card with the measured visibility
Finding, the gated agent's diff, the green gate card, then 8/30 vs 0/30 —
both computed at render time from `eval/agent-prs/results.json`
(muse-confirmed regressions per arm). 1:10–1:45 how it works (1/20 vs 19/20,
SAM overlay, propose-fix). 1:45–2:20 generalization (init on ntfy, SusBench
7/10, native Android, the `docs/audit.md` REAL ID row, CLI / Action / MCP).
2:20–2:50 built with Meta's stack. 2:50–3:00 close.

## Data rule

No number is hard-coded. `src/data.ts` reads, at render time:

- `eval/agent-prs/results.json` + `tasks.json` + `demo/` (8/30 vs 0/30, the
  prompt, both diff excerpts, GATE claim)
- `eval/results/summary.json` (replay gate 19/20, 0/6, $0; screenshot review
  1/20; walkthrough 17/20)
- `eval/susbench/results.json` (7/10, 1/3 controls)
- `apps/report/public/data/<decision>/report.json` (Finding titles, 1 → 7
  actions, hidden on first screen)
- `docs/audit.md` (REAL ID row, 0/3 → 3/3 · 4 actions to fact)

Anything missing renders as `[PENDING]`. Preview defaults are all
`[PENDING]` on purpose: the film can only show a number that came from a
file. `src/footage.ts` does the same for stills and voiceover.

## Footage

Real footage only. `pnpm --filter video capture` (`scripts/capture.ts`)
stages whole recorded Traces from `apps/report/public/data` into
`public/footage` with a `clips.json` manifest: each screenshot, the tap the
Probe made on it, and the Oracle verdict. The cold open uses
`teen_dm.block_unknown.baseline.1` (Oracle passed: it ends on Messages with
"Block unknown people" selected) against `teen_dm.block_unknown.candidate.0`
(ran out of its 20-step budget on the location prompt). Older Traces carry
Circle's "fictional test app" banner; capture detects it per frame and crops
it, shifting tap positions by the same amount. Nothing else is retouched.
Current Circle builds hide that banner from automated browsers, so new Traces
have none.

## Tooling: Remotion, not HyperFrames

The ticket asked for HyperFrames first. It was cloned and read
(Apache-2.0; `npx hyperframes init` / `preview` / `render`), but its README
lists a system FFmpeg as a hard requirement. Remotion's renderer bundles its
own compositor, so `video/` uses Remotion 4.0.539 instead. The composition is
plain React, so porting the scenes to HyperFrames HTML later is mechanical.

## Voiceover and render

`video` is a pnpm workspace member, so from the repo root:

```bash
pnpm install
pnpm --filter video capture   # stage Traces into public/footage (gitignored)
pnpm --filter video tts       # per-scene voiceover into public/vo (macOS `say`; optional)
pnpm --filter video test && pnpm --filter video typecheck
pnpm --filter video exec tsx scripts/stills.ts 6 45 80   # layout check, no encode
pnpm --filter video render
```

The render writes `media/agencydiff-demo.mp4` and
`media/agencydiff-demo-captions.mp4` (same video, no audio track), asserts
both are within (0, 180.0] seconds, and fails otherwise. It needs `ffmpeg`
and `ffprobe` on PATH (or `FFMPEG` / `FFPROBE`). Without `public/vo` the
film is captions-only. Large mp4s, staged footage and generated voiceover
stay out of git (see the repo `.gitignore`).
