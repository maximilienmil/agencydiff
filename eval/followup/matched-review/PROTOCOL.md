# Matched review: repeatable metric comparison vs model reviewer (PROTOCOL, frozen)

Pilot follow-up for AgencyDiff. Question: given equivalent evidence, how do
repeatable metric comparison and a model reviewer differ?

Status: FROZEN. Any change after trials start is recorded under Amendments
with reason; scored data collected before an amendment stays excluded unless
the amendment says otherwise.

## Frozen case set (8 cases, balanced small subset = pilot)

Seeds shuffled with `random.Random(20261103)` (Python stdlib) into neutral IDs:

| Case | Seed (hidden from reviewer) | Scope contract | Expected finding |
| --- | --- | --- | --- |
| CASE-01 | ST_MIN_LIMIT_2H | screen_time | screen_time.set_limit harder (visibility) |
| CASE-02 | LOC_HIDE_DECLINE | precise_location | precise_location.withhold harder (effort) |
| CASE-03 | DM_HIDE_BLOCK | teen_dm | teen_dm.block_unknown harder (effort) |
| CASE-04 | SUB_BURY_CANCEL | subscription | subscription.cancel harder (depth) |
| CASE-05 | SUB_TERMS_AFTER_CHECKOUT | subscription | subscription.terms harder (success) |
| CASE-06 | UI_COPY_TWEAK | subscription | no change on any in-scope intent (control) |
| CASE-07 | UI_ACCENT | precise_location | no change on any in-scope intent (control) |
| CASE-08 | LOC_DEFAULT_ON | precise_location | precise_location.withhold harder (default) |

Expected findings come from `eval/ground_truth.json` restricted to the scope
contract (ground truth intents are single-decision, so all fall in scope).
The reviewer never sees seeds, ground truth, or this table. Scope rule:
regression seeds run their `PREFIX_TO_DECISION` contract; control seeds run
one predeclared contract each (above). Denominator: 6 expected intents;
control denominator: 2 contract-runs (all in-scope intents must read unchanged).

Coverage of finding kinds: effort (CASE-02, CASE-03), visibility (CASE-01),
defaults (CASE-08), unreachable/success goals (CASE-05), depth (CASE-04),
harmless controls (CASE-06, CASE-07).

Excluded smoke-test seed (plumbing only, never scored): DM_BURY_MESSAGES.

## Evidence budget (identical for both methods)

Per case, per in-scope intent, per variant (baseline `?variant=baseline`,
candidate `?seeds=<SEED>`):

- Explicit contract text: decision, promise, intent goals.
- Complete recorded scripted path: tag clicked per step (`step.note`), action
  count, screens visited per step, final screen.
- Final-state oracle observations: `oracle.passed` per trace, oracle-relevant
  final-state keys, full `final.state` (asserted seed-free by test).
- Before/after screens: initial + final screenshot PNG per intent per variant
  at the scripted 430x860 viewport.

The reviewer additionally receives the action records needed to count effort;
it is not handicapped to images only. Neither method receives ground-truth
labels or seed names. Bundles are asserted seed-name-free and ground-truth-free
by test (`scripts` grep for seed tokens and `eval/ground_truth.json` content).

## Methods

- Comparator: `diffContract` from `packages/core/src/diff.ts` (unchanged) over
  frozen scripted traces at repeats=1. Run twice; the two Finding sets must be
  byte-identical (determinism check). No detection-logic edits mid-evaluation.
- Reviewer: model `muse-spark-1.3-contributor` via `MODEL_API_BASE`, one call
  per case per repeat. Reply is a strict JSON object:
  `{"verdicts": {"<decision>.<intent>": "harder"|"easier"|"unchanged"|"uncertain"},
  "citations": {...}, "notes": "..."}`. Every in-scope intent needs a verdict
  citing supplied evidence (`screens:`, `actions:`, or `oracle:`). Unparseable
  reply: retry once, then record all intents `uncertain` for that repeat.

## Repetitions and cost cap

- Comparator: 2 runs (determinism). Cost $0 (local compute).
- Reviewer: 3 repeats per case = 24 calls, majority verdict per intent.
- Experimental model-call budget: USD 5 maximum for this experiment (reviewer
  calls only; evidence generation is scripted = $0 and reported separately).
  Cost per call via `usdForTokens` (0.10/0.20 per MTok). Guard: after the first
  completed case repeat, project total = spent/fracDone; abort to a partial
  report if projection exceeds $5. Metered spend is read from API usage fields,
  never estimated from wall clock.

## Scoring (common outcome definition)

Per expected intent, a method scores a hit when it flags that intent as
changed-for-worse: comparator = a Finding naming the intent with the candidate
side worse; reviewer = majority verdict `harder` (`uncertain` = miss, reported
separately). Recall = hits / 6 expected intents. Precision = correct
worse-flags / all worse-flags (unexpected-intent flags and any control flag
count against precision). Comparator Finding kinds vs expected metrics are
reported alongside, not inside, precision/recall. Disagreement cases are listed
individually. No causal or general-population claims: this is one 8-case pilot.

## Failure and exclusion rules

- A trace with `stoppedReason: "error"` on an expected intent excludes that
  intent from BOTH methods' denominators for that case (recorded, not silently
  dropped).
- Reviewer transport failure after one retry: that repeat is `uncertain`
  everywhere, recorded as missing (not as unchanged).
- Control contract-run with any worse-flag by either method: false alarm for
  that method.
- Evidence regeneration (server flake) is allowed before freezing traces; after
  traces are frozen (hashes in `raw.json`), no regeneration.

## Source SHAs (behavior baseline)

- Behavior baseline: `7c84640d894cf9366030c77ba36e7576b9a24a2d` (detection logic
  unchanged relative to it; worktree HEAD may carry coordinator setup commits).
- Recorded at trial time in `raw.json`: worktree HEAD, contract file hashes,
  `eval/ground_truth.json` hash, reference-path file hashes, runner file hash.

## Reproduction

- Serve: `cd apps/circle && pnpm exec vite --port 5321 --strictPort --host 127.0.0.1`
- Evidence: `pnpm --filter @agencydiff/runner exec tsx ../../eval/followup/matched-review/run.ts --phase evidence --port 5321`
- Score: `... --phase all --port 5321` (needs `MODEL_API_KEY`; loads from
  environment or repo `.env`, never printed or committed).
- Tests: `pnpm --filter @agencydiff/runner exec vitest run eval/followup/matched-review/tests`
  (from repo root via workspace path) and `pnpm --filter @agencydiff/runner exec tsc -p .`.

## Amendments

(none yet)
