# AgencyDiff demo video

A 3:00, 1920x1080, 30fps film: typography-led scenes, real Trace screenshots
shown full phone-column (never letterboxed), and burned-in captions. Palette
and type match the report viewer (`apps/report/src/styles.css`).

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

Real footage only: phone-column Trace screenshots staged by
`npm run capture` (see `scripts/capture.ts`) plus a decision-sheet crop of
the SAM 3.1 overlay fixture. The report viewer's live/replay clip is
deliberately unused: its footer carries driver debug text ("safety checks
acknowledged…") and its phones are tiny inside a wide panel.

## Tooling: Remotion, not HyperFrames

The ticket asked for HyperFrames first. It was cloned and read
(Apache-2.0; `npx hyperframes init` / `preview` / `render`), but its README
lists a system FFmpeg as a hard requirement. Remotion's renderer bundles its
own compositor, so `video/` uses Remotion 4.0.539 instead. The composition is
plain React, so porting the scenes to HyperFrames HTML later is mechanical.

## Voiceover and render

```bash
cd video
npm install
npm run capture   # stage stills into public/footage (gitignored)
npm run tts       # per-scene AIFFs into public/vo (gitignored, macOS `say`)
npm test && npm run typecheck
npx tsx scripts/stills.ts [seconds...]  # layout check without the encode
nohup npx tsx scripts/render.ts > /tmp/agencydiff-render.log 2>&1 &
```

Long renders go through `nohup` so they survive host restarts. The render
writes `media/agencydiff-demo.mp4` (voiced) and
`media/agencydiff-demo-captions.mp4` (identical video, no audio), asserts
both are within (0, 180.0] seconds, and fails otherwise. Large mp4s, staged
footage, and generated voiceover stay out of git (see the repo `.gitignore`).
