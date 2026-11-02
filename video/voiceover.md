# Voiceover script — AgencyDiff demo (3:00)

Timed to the composition in `src/Demo.tsx` (1920x1080, 30fps, captions burned
in). Lines prefixed with `> ` are the spoken text; `scripts/tts.sh` extracts
them for the optional local TTS pass (macOS `say`). Every number is read from
`eval/results/summary.json`, `eval/susbench/results.json`, the report data and
`docs/audit.md` at render time — update those files and re-render instead of
editing numbers here. Numbers spoken below that are not yet final are marked
[PENDING] in the film itself.

## 0:00–0:15 — Hook

> Teams ship UI changes every day with agents. Nobody re-checks whether users can still do what they came to do.

On screen: title card. A measured Finding (decline cost, visibility) is shown
small, with its source file named.

## 0:15–0:45 — The idea

> AgencyDiff turns a product promise into executable user-intent tests. An Intent is one explicit thing a person wants to accomplish. A Probe is a computer-use agent run as a measuring instrument, not a simulated person. An Oracle checks the final app state — the agent's own claim never counts. The same Intents run on baseline and candidate, and the Agency Diff is deterministic.

On screen: Intent / Probe / Oracle / Agency Diff definitions (GLOSSARY.md).

## 0:45–1:30 — Demo

> A pull request simplifies Circle+ onboarding: one screen, one choice, faster. AgencyDiff fails the check. In the side-by-side replay, the baseline declines in one action from the first screen. The candidate hides decline behind More options — more actions, deeper navigation, no longer visible. The SAM 3.1 overlay shows where the control went. Restoring the direct decline control turns the check green again.

On screen: side-by-side Trace replay, decline/revoke/Asymmetry stats, SAM
overlay. [PENDING] Propose Fix flow and the PR check comment — neither exists
in this checkout yet, so the draft shows the Finding, not a fabricated pass.

## 1:30–2:10 — Evidence

> On the seeded Circle benchmark, scripted Probes catch twenty of twenty real regressions with zero false alarms on harmless changes. Muse-as-judge catches eighteen of twenty, at eighty-nine percent consistency across repeated verdicts. On SusBench-derived patterns, seven of ten injected patterns are detected. And on a public site, time-to-fact for the REAL ID document list dropped to four actions after the redesign.

On screen: benchmark table (eval/results/summary.json), SusBench-derived
results (eval/susbench/results.json), public-site time-to-fact (docs/audit.md).
[PENDING] Muse Probe benchmark row — `agencydiff.muse` is null in
summary.json until that run is recorded.

## 2:10–2:40 — How it's built

> Muse Spark runs each Probe from screenshots only. SAM 3.1 grounds the controls for the evidence overlay. Muse built the repository itself, through delegated agents working one ticket at a time. None of that decides the result: the diff compares recorded Traces, so the same evidence always produces the same Findings.

On screen: pipeline diagram, report viewer footage. [PENDING] live/replay
clip — `media/live-replay.mp4` does not exist in this checkout yet.

## 2:40–3:00 — Close

> Regression tests for human choice.

On screen: "Regression tests for human choice." and the repo URL.
