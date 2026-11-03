# Matched review: repeatable metric comparison vs model reviewer (RESULTS)

Pilot, 8 frozen cases. Protocol (frozen before trials, amendments A1–A4
recorded there): [PROTOCOL.md](./PROTOCOL.md). Machine-readable:
[summary.json](./summary.json), [raw.json](./raw.json). Runner:
`packages/runner/src/matchedReview/run.ts`. Do not confuse with
`eval/RESULTS.md` or `eval/agent-prs/RESULTS.md` (different experiments).

## Question

Given equivalent evidence, how do repeatable metric comparison and a model
reviewer differ? Both methods received the same bundle per case: contract text
(including the default key after A4), identical before/after screenshots,
complete recorded scripted paths/actions, starting and final states, and
final-state oracle outcomes. Neither saw seed names or ground truth
(asserted by test and by a pre-review bundle check).

## Headline (common outcome: flags the expected intent as changed-for-worse)

| Case (seed hidden from reviewer) | Expected | Comparator | Reviewer majority (3/3) |
| --- | --- | --- | --- |
| CASE-01 screen_time | set_limit harder | hit (goal_unreachable) | hit, 3/3 unanimous |
| CASE-02 precise_location | withhold harder | hit (goal_unreachable + visibility) | hit, 3/3 unanimous |
| CASE-03 teen_dm | block_unknown harder | hit (goal_unreachable) | hit, 3/3 unanimous |
| CASE-04 subscription | cancel harder | hit (goal_unreachable) | hit, 3/3 unanimous |
| CASE-05 subscription | terms harder | hit (goal_unreachable) | hit, 3/3 unanimous |
| CASE-06 control | no change | clean | clean, 3/3 unanimous |
| CASE-07 control | no change | clean | clean, 3/3 unanimous |
| CASE-08 precise_location | withhold harder (default) | hit (default_flip) | hit, 3/3 unanimous |

Recall 6/6 both; worse-flag precision 1.0 both (0 false flags); zero
`uncertain` verdicts in 24 reviewer calls; zero parse retries. Comparator
determinism: two runs over frozen traces byte-identical on all 8 cases.

## How they differ (same evidence, different output)

- Mechanism labels: the comparator names a metric kind, but on scripted
  traces 4 of 6 regression hits collapse to `goal_unreachable` because the
  reference control is gone and the replay errors out — the truth metrics
  there were visibility (CASE-01), effort (CASE-03), depth (CASE-04) and
  success (CASE-05). Only CASE-02 (`visibility`) and CASE-08 (`default_flip`)
  match the independently expected metric. The reviewer instead returns
  direction + cited evidence (screens/actions/oracle) without a mechanism
  kind; its citations correctly named truncated paths and flipped defaults.
- Both directions: on CASE-08 the reviewer rated the accept side
  (`share`) `easier` 3/3 alongside `withhold` harder — the comparator has no
  vocabulary for improvement. Not counted in precision (not a worse-flag).
- Stability evidence differs in kind: comparator bit-identical by
  construction over fixed artifacts; reviewer 24/24 unanimous on this small
  set — agreement, not a general variability claim.

## Cost and setup

- Evidence generation (scripted probes, repeats=1, deterministic): $0.00.
- Scoring: comparator $0.00; reviewer metered $0.0323 for the scored pass
  (24 calls, 242,730 in / 39,983 out tokens at 0.10/0.20 per MTok).
  Two discarded pre-registration passes (A3/A4 bundle fixes, unscored) cost
  ~$0.03 each from console logs. Total experimental model spend ≈ $0.10,
  far under the $5 cap. No other model calls were made for this experiment.
- Setup effort: one `pnpm install`, one Playwright chromium install
  (browsers already cached), ~10 min scripted evidence collection on
  127.0.0.1:5321 (assigned range 5320–5339, server stopped after each phase).

## Oracle and setup advantages (shared, disclosed)

- Both methods inherit the scripted driver's human-written reference tour:
  paths show where controls live, so neither demonstrates discovery.
- Oracle observations come from the app state-hook (not model-judged);
  error traces (`reference tag not found`) are the seeded signal itself
  (amendment A1), which is why goal_unreachable dominates comparator kinds.
- The default key's meaning had to be spelled out for the reviewer (A4);
  the comparator reads it from the contract struct. Equivalent after the fix.

## Limitations

- n=8 pilot, one app, one reviewer model (`muse-spark-1.3-contributor`),
  unanimous repeats are not a variability estimate. No causal or general
  claims.
- Controls cover 2 single-contract runs, not the full bench control set.
- Kind-level comparator recall against truth metrics is 2/6; the 6/6 common
  outcome rests on goal_unreachable collapse, an artifact of scripted replay.
- Trace PNGs are regenerable inputs, not committed (see `.gitignore`);
  `manifest.json` per case pins every file hash; `raw.json` pins source SHAs.

## Reproduce

- Evidence: `pnpm --filter @agencydiff/runner exec tsx src/matchedReview/run.ts --phase evidence --port 5321`
- Comparator: `... --phase comparator` (asserts byte-identical ×2)
- Review: `... --phase review` (needs `MODEL_API_KEY`; loads from
  environment or repo `.env`, never printed or committed; $5 guard inside)
- Score: `... --phase score` (writes `raw.json`, `summary.json`)
- Tests: `pnpm --filter @agencydiff/runner test` (170 passed 2026-11-02,
  incl. 18 matched-review tests); typecheck `pnpm --filter @agencydiff/runner exec tsc -p .`
