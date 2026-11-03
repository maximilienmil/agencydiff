# AgencyDiff demo video

A 3:00, 1920x1080, 30fps film with burned-in captions. The visual reference is
[the owner-provided Watch Dogs film](https://www.youtube.com/watch?v=scyA9cnbja4):
black space, sharp sans-serif type, data fragments, thin wireframe connections
and quick graphic cuts. All visuals are original or recorded AgencyDiff evidence;
no game assets or audio are included. An original procedural electronic score
(`scripts/soundtrack.ts`) adds a low pulse, quiet data ticks and section accents.
It contains no samples or speech. Inter headlines, Martian Mono data and
Atkinson body text share the existing licensed font files. Blue tracks the active
path; red and green describe measured deltas. Film grain stays subtle and static.

## Structure (all timings in `src/Demo.tsx`)

0:00–0:15 cold open: “YOU SAID NO.” cuts to the recorded location-decline
Probes: one action before the update, seven after. A wireframe built from the
candidate's actual screen sequence moves behind the evidence. 0:15–0:31 the problem in plain words. 0:31–1:23 the experiment: the
verbatim "Simplify onboarding" prompt from `eval/agent-prs/tasks.json`
(typed at 35 characters per second in Atkinson, then held), the regressing agent diff and the failed check, the
seeded decline Traces (1 step against the candidate's hunt for the toggle),
the gated agent's diff and the passed check, then two animated 30-tile grids showing 8/30 against 0/30 from
`eval/agent-prs/results.json`. 1:23–1:57 how it works (Contract, Probes,
Oracle, Diff; 19/20 against 1/20; SAM overlay; propose-fix). 1:57–2:30 it
generalizes (init on ntfy, SusBench 7/10, native Android, the
`docs/audit.md` REAL ID row, CLI / Action / MCP). 2:30–2:52 built with
Meta's models. 2:52–3:00 close, ending on black at exactly 3:00.

## Data rule

Evaluation numbers are never hard-coded. `src/data.ts` reads, at render time:

- `eval/agent-prs/results.json` + `tasks.json` + `demo/` (8/30 vs 0/30, the
  prompt, both diff excerpts, GATE claim)
- `eval/results/summary.json` (replay gate 19/20, 0/6, $0; screenshot review
  1/20; walkthrough 17/20)
- `eval/susbench/results.json` (7/10, 1/3 controls)
- `apps/report/public/data/<decision>/report.json` (Finding titles, 1 → 7
  actions, hidden on first screen)
- `docs/audit.md` (REAL ID row, 3/5 → 5/5 · 21 → 1 actions to fact)

Anything missing renders as `[PENDING]`. Preview defaults are all
`[PENDING]` on purpose: the film can only show a number that came from a
file. `src/footage.ts` does the same for stills and voiceover.

The opening code-activity animation uses the real text-line totals from design
merge `9abc947`: 6,522 additions and 6,070 deletions (`git show --numstat`).
These describe this repository update, not an evaluation result. Its segmented
bar represents the same proportions. The task is presented as the actual tasks.json artifact, with its recorded
diff layered behind it. It does not imitate Muse Code’s interface. The Contract → Probes →
Oracle → Diff diagram highlights each stage in sequence.

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
and `ffprobe` on PATH (or `FFMPEG` / `FFPROBE`). Without `public/vo` the film has captions and the procedural score, without
spoken narration. The `-captions.mp4` export is silent. Large mp4s, staged footage and generated voiceover
stay out of git (see the repo `.gitignore`).
