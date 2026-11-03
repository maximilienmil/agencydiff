# Voiceover script — AgencyDiff demo (3:00)

Timed to the composition in `src/Demo.tsx` (1920x1080, 30fps, captions burned
in). Lines prefixed with `> ` are the spoken text; `scripts/tts.sh` writes
one AIFF per scene (`public/vo/*.aiff`, macOS `say`, voice Samantha) and the
composition plays each under its own scene. Every number is read from
`eval/agent-prs/results.json`, `eval/results/summary.json`,
`eval/susbench/results.json`, the report data and `docs/audit.md` at render
time — update those files and re-render instead of editing numbers here.

Two renders ship: `media/agencydiff-demo.mp4` (voiced) and
`media/agencydiff-demo-captions.mp4` (captions only, same video track).

## 0:00–0:15 — Cold open (≤15 s)

> Two probes try one intent — I do not want strangers messaging me — on two builds. The left probe reaches the choice. The right one gets lost, and the Agency Diff records a finding.

On screen: two phone-column Trace screenshots side by side (baseline reaches
the Messages decision, candidate ends on the wrong screen); the Finding card
animates in. No report-viewer chrome: its footer carries driver debug text.

## 0:15–0:31 — Problem (≤16 s)

> Coding agents ship new interfaces every day. Nobody re-checks whether people can still do what they came to do — decline, restrict, cancel, delete. AgencyDiff turns those choices into executable tests.

On screen: plain-words statement card.

## 0:31–1:23 — The experiment (≤52 s)

> We gave a coding agent one ordinary task: simplify onboarding, fewer screens before the feed. Its diff never opens the first-run prompt, so decline leaves the first screen. The AgencyDiff check fails: decline takes seven actions instead of one, and is no longer visible. The same task goes back with the check in the loop. The gated agent keeps the prompt and the decline control. Gate pass, zero findings. Across thirty ordinary pull requests per side: without the check, eight broke saying no. With it, zero.

On screen: the verbatim prompt; the regressing diff; the red check card with
the measured visibility Finding; the side-by-side decision screens (one
action, visible / seven actions, hidden); the gated agent's diff; the green
gate card; the 8/30 vs 0/30 result card. All numbers computed at render time
from `eval/agent-prs/results.json` (muse-confirmed regressions per arm).

## 1:23–1:57 — How it works (≤34 s)

> A contract names the decisions, the intents, and the oracles. Probes run each intent on both builds. The oracle checks the final app state — the agent's own claim never counts. The diff is deterministic: same traces, same findings. Screenshot review catches one in twenty. The replay gate catches nineteen, with zero false alarms, for zero dollars. SAM grounds every control for the evidence overlay, and propose fix turns a failing report into a verified patch.

On screen: contract → probes → oracle → diff; 1/20 vs 19/20 cards ($0);
SAM 3.1 overlay; the `propose-fix` flow turning green.

## 1:57–2:30 — It generalizes (≤33 s)

> One init command maps an app it has never seen — an unseen notification server yielded thirty-six controls from a twenty-two step crawl. SusBench-derived patterns: seven of ten. Native Android probes on a real emulator. A public-site audit: the REAL ID document list went from zero of three to three of three, four actions to fact. And the same engine ships as a CLI, a GitHub Action, and an MCP server inside the agent that writes the code.

On screen: `agencydiff init` (ntfy), SusBench 7/10, native Android, the audit
row from `docs/audit.md`, CLI / Action / MCP cards.

## 2:30–2:52 — Built with Meta's models (≤22 s)

> Muse Spark runs every probe from screenshots only. SAM grounds the controls. Muse built this repository through parallel agents, one ticket at a time. None of that decides the result: the diff compares recorded traces, so the same evidence always produces the same findings.

On screen: one claim per model, then the determinism line.

## 2:52–3:00 — Close (≤8 s)

> AgencyDiff: regression tests for human choice.

On screen: "Regression tests for human choice." and the repo URL.
