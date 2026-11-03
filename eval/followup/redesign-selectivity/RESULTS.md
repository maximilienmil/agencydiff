# Redesign selectivity: broken path vs harmed choice (RESULTS)

Question: does the existing AgencyDiff gate distinguish a broken reference
path from a harmed choice? Frozen protocol: [PROTOCOL.md](./PROTOCOL.md)
(one amendment, dated, before rediscovery). Runner: `./run.sh`;
rediscovery: `rediscover.ts`; merge: `merge.py`. Machine-readable:
[raw/summary.json](./raw/summary.json).

## Headline

18/18 cases land in the intended column, with zero false blocks and zero
misses — but the columns stay visibly separate, which is the point. Every
innocent redesign passes the gate silently (9/9 TRUE-PASS); every harmful
change fails it (9/9 TRUE-BLOCK), including all three harmful-default cases
where the old reference path still replays cleanly. This matrix does not establish that the gate can distinguish an innocent
broken path from a harmed choice: none of its innocent variants breaks the
reference tags. Path-replay outcome, semantic outcome, and gate verdict are
reported in separate columns below.

Denominators: 18 cases (6 classes × 3 families) + 3 baseline-vs-baseline
controls + 1 excluded-family smoke case (screen_time, not in the matrix).
Scripted repeats: 2 per intent per variant (deterministic; all repeats
byte-identical modulo timestamps). No causal or population claims: this is a
pilot-scale matrix (n=18 purposive cases), not a prevalence sample.

## Per-case results

path = scripted baseline-path replay on the variant (PASS / TAG-MISSING /
UNSATISFIED). semantic = independent final-state outcome (oracle + fresh-load
defaults + rediscovery). gate = `diffContract` verdict (FAIL = finding above
low; equivalence with the real gate CLI spot-checked on 2/18 cases).

| Case | Path replay | Semantic | Gate | Selectivity |
| --- | --- | --- | --- | --- |
| LOC-STY (styling-only) | PASS 3 taps | PRESERVED | PASS, no findings | TRUE-PASS |
| LOC-RELOC (row moved, same taps) | PASS 3 taps | PRESERVED | PASS, no findings | TRUE-PASS |
| LOC-IMPROVE (Location row first) | PASS 3 taps | PRESERVED | PASS, no findings | TRUE-PASS |
| LOC-EXTRA (+confirm dialog) | UNSATISFIED 0/2 | HARMED-COST (rediscovery 2/2, 4 taps) | FAIL goal_unreachable high | TRUE-BLOCK |
| LOC-REMOVE (toggle gone) | TAG-MISSING location.toggle | HARMED-UNREACHABLE (agent 0/2) | FAIL goal_unreachable high | TRUE-BLOCK |
| LOC-DEFAULT (precise on) | PASS 3 taps | HARMED-DEFAULT (fresh precise=false→true) | FAIL default_flip high | TRUE-BLOCK |
| DM-STY | PASS 4 taps | PRESERVED | PASS, no findings | TRUE-PASS |
| DM-RELOC (Everyone/Friends swapped) | PASS 4 taps | PRESERVED | PASS, no findings | TRUE-PASS |
| DM-IMPROVE (block option first) | PASS 4 taps | PRESERVED | PASS, no findings | TRUE-PASS |
| DM-EXTRA (+confirm dialog) | UNSATISFIED 0/2 | HARMED-COST (rediscovery 2/2, +1 tap) | FAIL goal_unreachable high | TRUE-BLOCK |
| DM-REMOVE (block option gone) | TAG-MISSING dm.block_unknown | HARMED-UNREACHABLE (agent 0/2) | FAIL goal_unreachable high | TRUE-BLOCK |
| DM-DEFAULT (everyone default) | PASS 4 taps | HARMED-DEFAULT (fresh friends→everyone) | FAIL default_flip high | TRUE-BLOCK |
| SUB-STY | PASS 3 taps | PRESERVED | PASS, no findings | TRUE-PASS |
| SUB-RELOC (decline first) | PASS 3 taps | PRESERVED | PASS, no findings | TRUE-PASS |
| SUB-IMPROVE (decline primary) | PASS 3 taps | PRESERVED | PASS, no findings | TRUE-PASS |
| SUB-EXTRA (retention dialog on decline) | UNSATISFIED 0/2 | HARMED-COST (scripted new path 4 taps oracle-pass; agent 1/4) | FAIL goal_unreachable high | TRUE-BLOCK |
| SUB-REMOVE (decline gone) | TAG-MISSING sub.decline | HARMED-UNREACHABLE (agent 0/2) | FAIL goal_unreachable high | TRUE-BLOCK |
| SUB-DEFAULT (annual default) | PASS 3 taps | HARMED-DEFAULT (monthly→annual) | FAIL default_flip medium | TRUE-BLOCK |

Controls: CONTROL-precise_location / CONTROL-teen_dm / CONTROL-subscription
(baseline-vs-baseline): path PASS, repeats identical, gate PASS, zero
findings — false-alarm floor 0/3 for this deterministic pipeline.

## Completion and regressions, grouped

- All 18 variants built and measured (no exclusions, no infra reruns beyond
  the predeclared 3-attempt probe retry, which never fired to effect).
- Regressions caught by the gate: 9/9 harmful variants (3 extra-steps, 3
  removed-choice, 3 harmful-default). No harmful variant passed.
- Innocent variants blocked: 0/9. No styling, relocation, or improvement
  variant produced even a low finding — the gate was completely silent on all
  nine, not merely passing.
- Review-required / inconclusive: SUB-EXTRA rediscovery only (agent 1/4 across
  two k=2 runs; first run 0/2 traces overwritten by retry — disclosed).
  Independent scripted new-path probe passes (4 taps, oracle holds), so the
  semantic column is HARMED-COST, not inconclusive. The agent stumbled on the
  retention-dialog flow (12-step wander on its one pass); the gate itself was
  never in doubt (goal_unreachable high on the reference path).

## The dissociation the question asked for

All three DEFAULT cases keep the old tag-resolved path green (path PASS,
oracle 1.0 on reference probes) while flipping the promise for new users.
The gate still fails each via `default_flip` (high, high, medium) — i.e. it
does NOT need a broken path to catch a harmed choice, and the report keeps
both facts visible instead of blending them. Conversely, the three REMOVE
cases break the path with no alternative: the gate's `goal_unreachable`
finding is confirmed by fixture source inspection together with failed agent rediscovery (0/2).
Two failed agent attempts alone do not prove a goal is unreachable.

## Costs

Model spend (this experiment only): **$0.041 / $5.00 cap** (93 calls, all
`muse-spark-1.3-contributor`): first LOC-EXTRA k=2 $0.0038; batch
LOC-REMOVE+DM-EXTRA+DM-REMOVE k=2 $0.0166; batch SUB-EXTRA+SUB-REMOVE k=2
$0.0136; retry SUB-EXTRA k=2 $0.0071. Deterministic evaluation: $0.00.
Coordinator overhead out of scope. Cap never binding; no work deferred.

## Setup effort and commands

- `pnpm install --frozen-lockfile` in the worktree (Node 26 ran it fine).
- Serve ports 127.0.0.1:5301/5302 only; all servers stopped after each case
  (no live servers remain; verify: `curl -sf 127.0.0.1:5301/` refuses).
- Reproduce everything: `./run.sh --smoke`, `./run.sh --controls`,
  `./run.sh` (full matrix), then
  `./packages/runner/node_modules/.bin/tsx rediscover.ts` (default 6 cases;
  costs ~$0.04), then `python3 merge.py`.
- Baseline purity: served from pristine `git archive 7c84640` (`/tmp/rs`,
  outside the checkout); `git diff 7c84640 HEAD -- apps/circle/src/` is empty.
  Variant patches: [variants/](./variants/) (exact-match, asserted at apply
  time). Originals unchanged: `git status` shows only `eval/followup/` and the
  two `packages/runner/src/redesignSelectivity.*` helper files.

## Limitations and non-findings

- The scripted driver resolves stable tags on the current screen and clicks
  their current coordinates. RELOC cases keep these tags and screen hierarchy.
  They test tag-preserving reorders, not robustness to renamed locators or
  cross-screen redesigns. No innocent reference-path failure is represented,
  so the headline cannot answer the hardest selectivity question.
- The first SUB-EXTRA rediscovery traces were overwritten by a retry. Its
  original raw evidence is unavailable; the combined 1/4 description relies
  partly on the experiment log. The independent new-path fixture result is
  distinct from an autonomous rediscovery success estimate.
- Small purposive matrix: 9 innocent / 9 harmful is a separation demo, not a
  false-alarm or miss rate. The 0/9 and 9/9 must not be quoted as rates.
- IMPROVE variants produced no "easier" findings — improvements that only
  reorder/re-style are invisible to the gate, which is correct here but means
  the gate also cannot credit a genuine improvement.
- SUB-EXTRA's retention dialog reuses cancel-framed copy ("Stay for half
  price?") on the decline flow; the friction measured is real, the copy is a
  test artifact of the minimal patch.
- Agent rediscovery is a noisy instrument (SUB-EXTRA 1/4); classifications
  rest on independent oracle checks, never on agent claims.
- Harness fixes during smoke testing (not protocol changes): scratch
  `tsconfig.json` extends rewritten to absolute path; `design/` extracted at
  SHA for the repo-relative CSS import; per-scratch `node_modules` copies so
  concurrent vite servers don't share the optimizer cache.
- Gate-equivalence spot check: real `cli.ts` (scripted, `--scripted-from
  baseline`) on LOC-REMOVE → exit 1 FAIL, LOC-STY → exit 0 PASS, matching the
  runner's `report.passed` predicate. Full 4-contract gate CLI was not run per
  case (focal-contract verdict reported; other contracts unaffected by
  single-family patches — verified by zero cross-intent findings in all 18
  full-contract diffs).

## Missing work

- None required by the brief. Optional follow-ups (not done): wider
  relocation coverage (cross-screen moves), improvement variants the gate
  should credit, and a second agent model for rediscovery comparison.
