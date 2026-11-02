# AgencyDiff demo video

A 3:00, 1920x1080, typography-led draft film: text cards, recorded Trace
replays and burned-in captions. Palette and type match the report viewer
(`apps/report/src/styles.css`). This is a silent cut; see
[voiceover.md](voiceover.md) for the timed narration script.

## Tooling: Remotion, not HyperFrames

The ticket asked for HyperFrames first. It was cloned and read
(Apache-2.0; `npx hyperframes init` / `preview` / `render`), but its README
lists a system FFmpeg as a hard requirement and this machine has none
(`ffmpeg` is not installed, and installing system packages was out of scope).
Remotion's renderer bundles its own compositor, so `video/` uses Remotion
4.0.539 as the composition dependency instead. The composition is plain
React, so porting the scenes to HyperFrames HTML later is mechanical.

## Data rule

No number is hard-coded. `src/data.ts` reads, at render time:

- `eval/results/summary.json` and `eval/RESULTS.md` (AgencyDiff vs judge)
- `eval/susbench/results.json` (SusBench-derived results)
- `apps/report/public/data/<latest run>/report.json` (Findings, Asymmetry)
- `docs/audit.md` (public-site time-to-fact table)

Anything missing renders as `[PENDING]`. Preview defaults are all
`[PENDING]` on purpose: the film can only show a number that came from a
file. `src/footage.ts` does the same for clips.

## Footage

Real footage only: Trace screenshots from the report data, the SAM 3.1
overlay fixture, and Playwright captures. Re-record the captures with:

```bash
pnpm --filter @agencydiff/runner exec tsx ../../scripts/capture-footage.ts
```

That writes `media/footage/*.png` (Circle baseline/candidate, report Diff
page, and a PR-check comment rendered from the real Findings — there is no
live PR in this checkout). Then stage everything the composition uses:

```bash
cd video && npm run capture
```

`media/live-replay.mp4` does not exist yet; until it does, the "How it's
built" scene shows a `[PENDING]` card instead of stock footage.

## Render

```bash
cd video
npm install
npm run capture
npm run render   # writes ../media/agencydiff-demo-draft.mp4
```

Optional narration (free, local, macOS only): `npm run tts` uses `say` to
read [voiceover.md](voiceover.md) into `voiceover.aiff`; mux it with any
FFmpeg install. The draft ships silent with captions burned in.

Checks: `npm run typecheck` and `npm test` (offline, reads the real eval
files). Large mp4s stay out of git (see the repo `.gitignore`).
