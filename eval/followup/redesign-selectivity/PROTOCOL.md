# PROTOCOL — Redesign selectivity: broken path vs harmed choice (FROZEN)

Status: FROZEN. Any amendment after trials start gets a dated entry under
"Amendments" with reasons; affected cases re-run.

## Research question

Does the existing AgencyDiff gate (scripted path-replay + `diffContract`,
PASS = no finding above low) distinguish a broken reference path from a
harmed choice? I.e., across innocent redesigns vs harmful changes, do we see
four separable columns: path-replay failure, semantic regression, gate
verdict, and review-required/inconclusive — rather than one blended FAIL?

## Source SHAs

- Baseline behavior: `7c84640d894cf9366030c72ba36e7576b9a24a2d`. Verified:
  `git diff 7c84640 HEAD -- apps/circle/src/` is empty; only `README.md`
  differs (harmless parent change). Hackathon-2026 tag and published video
  untouched.
- Worktree HEAD at freeze: `54aca69`.
- Baseline served from a pristine temp worktree at `7c84640` (`/tmp/rs-base-src`),
  never from the assigned checkout. Variants = pristine baseline file copies +
  the exact-match patches in `variants/*.patch` (one per case, applied to a
  scratch copy; originals unchanged).

## Families (3 Circle decisions; screen_time excluded except smoke test)

| Family | Contract | Focal protective intent | Fixture | Baseline ref path | Minimal effort |
| --- | --- | --- | --- | --- | --- |
| LOC | precise_location | revoke (turn precise location off) | location-shared | nav.settings → settings.location → location.toggle (3 taps) | 3 |
| DM | teen_dm | block_unknown (block strangers) | prompt-answered | nav.settings → settings.privacy → privacy.messages → dm.block_unknown (4 taps) | 4 |
| SUB | subscription | decline (decline Circle+ offer) | prompt-answered | nav.settings → settings.subscription → sub.decline (3 taps) | 3 |

Co-focal for default checks: LOC withhold (no fixture, 1 tap: location.decline);
SUB subscribe/decline (fixture prompt-answered falls through to the default
expression, so SUB default flips are visible to reference probes); DM default
flips are NOT visible under fixture (prompt-answered pins friends) — this
asymmetry is intentional and predeclared (expect a gate miss on DM-DEFAULT).

## Variant classes (6 × 3 families = 18 cases + controls)

| Class | Code | Intent | Expectation (independent of gate) |
| --- | --- | --- | --- |
| styling-only | STY | innocent | oracle holds, same cost, path intact |
| control relocation at equal effort | RELOC | innocent | oracle holds, same cost, path intact |
| protective improvement | IMPROVE | good | oracle holds, cost same or lower |
| extra unnecessary steps | EXTRA | harmful | oracle needs longer path (+dialog/dismiss) |
| removed/disabled choice | REMOVE | harmful | oracle unreachable via old or any reasonable path |
| harmful default change | DEFAULT | harmful | fresh-load default flips; old path may still work |

Expected final state per case (frozen BEFORE measuring):

- STY/RELOC/IMPROVE (all families): focal oracle achievable; minimal effort
  unchanged (LOC 3, DM 4, SUB 3); fresh-load defaults unchanged
  (location.precise=false, dm.policy=friends, sub.plan=monthly).
- LOC-EXTRA: revoke needs toggle + location.confirm_off (4 taps); oracle holds after.
- DM-EXTRA: block needs dm.confirm_block (+1 tap); oracle holds after.
- SUB-EXTRA: decline needs sub.decline + sub.confirm_cancel; oracle holds after.
- LOC-REMOVE / DM-REMOVE / SUB-REMOVE: focal control absent; no alternative
  tagged path to the oracle; rediscovery should report INFEASIBLE.
- LOC-DEFAULT: fresh load has location.precise=true; withhold path still works.
- DM-DEFAULT: fresh load has dm.policy=everyone; block path still works.
- SUB-DEFAULT: fresh load / prompt-answered start has sub.plan=annual; decline path still works.

## Procedures

Deterministic evaluation (all 18 + controls, $0 model cost):

1. Serve baseline (port 5301) and one variant at a time (port 5302),
   `vite --port PORT --host 127.0.0.1` from scratch copies. Ports bound to
   127.0.0.1 only, in 5300–5319. Servers stopped after the run.
2. ScriptedDriver replays the BASELINE reference path (`--scripted-from baseline`
   semantics) on both variants, repeats=2 per intent per variant. Deterministic
   by construction; the two repeats must produce identical traces.
3. Full family contract per case (all intents), both variants → `diffContract`
   gate verdict per contract (PASS = no finding above low; record every finding
   incl. low). Focal-contract gate verdict = the case's gate column.
4. Fresh-load default read per case: load variant with no fixture/query, read
   `window.__circle.state` defaultKey, compare to baseline.
5. Unchanged controls: baseline-vs-baseline on all 3 family contracts
   (false-alarm floor of this deterministic pipeline; expect zero findings).

Limited Contributor rediscovery (only where scripted path fails or oracle is
unsatisfied on the variant, plus any surprise failure):

- Predeclared procedure, identical for every triggered case: MuseDriver with the
  contract's goal string verbatim, max-steps 12, desktop viewport, k=2, model
  `muse-spark-1.3-contributor`. Agent sees only screenshots + goal (black box:
  no eval files, contracts, patches, seeds, or ground truth in its context).
- Outcome judged by INDEPENDENT final-state validation (`window.__circle.state`
  oracle check), never by the agent's DONE/INFEASIBLE claim.
- Outcome columns: REDISCOVERED-SAME (oracle at ≤ baseline effort via old tags),
  REDISCOVERED-LONGER (oracle via new/longer path, record taps),
  INFEASIBLE-CONFIRMED (oracle not reached), INCONCLUSIVE (mixed k=2, needs review).
- Cost: meter every call via usage events + `usdForTokens`; hard cap USD 5.00
  for this experiment's model calls (participant coding + rediscovery + any
  probe/judge calls). Stop launching new calls if the next call would breach
  the cap; publish partial results with the cap as the stated blocker. Reuse
  committed artifacts where possible; record reuse provenance.

## Scoring (separate columns, never blended)

Per case: (a) path replay: PASS / TAG-MISSING / UNSATISFIED / ERROR;
(b) semantic: PRESERVED / HARMED-COST / HARMED-DEFAULT / HARMED-UNREACHABLE /
REVIEW-REQUIRED; (c) gate: PASS/FAIL + finding list;
(d) selectivity: TRUE-PASS (innocent+PASS), FALSE-BLOCK (innocent+FAIL≥medium),
TRUE-BLOCK (harmful+FAIL), MISS (harmful+PASS).
IMPROVE "easier" findings at low severity do not count as FALSE-BLOCK; any
medium+ finding against an innocent variant does.
DEFAULT cases are scored MISS vs TRUE-BLOCK on the default_flip finding even
when the path column passes — that split is the point of the experiment.

## Failure / exclusion / rerun rules (fixed in advance)

- Infra flake (browser death, port clash, vite error): retry the probe with a
  fresh browser (runner retries 3×); persistent failure records an error trace
  and the case is reported, not silently dropped.
- Non-determinism: scripted repeats must be byte-identical modulo timestamps;
  on mismatch, rerun once; if still split, mark REVIEW-REQUIRED with both traces.
- No reclassification to make the gate pass: if a harmful variant passes, it is
  a MISS; if an innocent variant fails, it is a FALSE-BLOCK. Document, do not edit.
- No engine/detection edits during trials. If a product weakness shows, document
  it; do not rewrite detection mid-evaluation.
- Rerun budget: at most one full deterministic re-run for tooling fixes (with
  amendment note); model-call reruns only inside the $5 cap.

## Cost cap

USD 5.00 maximum for all new experimental model calls in this experiment.
Metered via driver usage events priced by `usdForTokens` (Contributor
$0.10/$0.20 per MTok in/out). Coordinator overhead is out of scope.
Current spend at freeze: $0.00.

## Reproducibility

Runner: `run.sh` (builds scratch copies, applies patches, serves, probes,
scores). Raw data: `raw/` (sanitized traces, no secrets). Summary:
`summary.json` + `RESULTS.md`. Harness tests: `tests/` run before trials.
Exact rerun: one command in RESULTS.md.

## Amendments

- 2026-11-02 (before rediscovery, after deterministic DM batch): corrected the
  DM-DEFAULT expectation. The protocol predicted the gate would likely PASS
  (miss) on reference probes because "prompt-answered pins friends". Re-reading
  `initialDm`, only the `dm-restricted` fixture pins a policy; `prompt-answered`
  falls through to the default expression, so the everyone-default IS visible
  to reference probes and the gate FIRED default_flip (high) as it should.
  The original expectation was a misreading of the fixture branching, not a
  gate behavior; scoring follows the observed columns (TRUE-BLOCK). No
  procedure changed; no variant was edited.
