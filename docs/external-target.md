# External targets: score recorded Traces through the shipped CLI

This is the minimal route for a target the live `diff`/`audit` probers cannot
drive (no `data-agency` tags, no state-hook server, oracles that need
IndexedDB/localStorage/DOM reads). It adds no target-specific code to the
runner or CLI: the adapter stays target-owned, and the shipped
`diff-traces` command scores its recorded output with the unmodified
`diffContract`.

## What this is and is not

- **Recorded-trace scoring** (`diff-traces`): answers "do these two recorded
  runs differ" from Trace bundles on disk. No browser, no model calls, no
  state server. This is what this page describes.
- **Live CLI probing** (`diff`/`audit`): drives the app in a browser right
  now. Still limited to targets the built-in drivers support (scripted
  reference paths or Muse). Recording an adapter does not extend live
  probing.
- **GitHub Action deployment**: runs live `diff` on baseline/candidate
  URLs. Recorded traces are not an Action input; the Action claim stays
  open for external targets.

## Before / after

- **Before:** an external target could record spec-compliant Traces and score
  them only through bespoke pilot scripts (ntfy: `src/coreRun.ts` /
  `src/coreBlind.ts` via `tsx`). The shipped CLI and Action were unexercised,
  so there was no documented, tested path from third-party evidence to a CLI
  verdict.
- **After:** the same Trace bundles score end-to-end through the shipped
  CLI (`diff-traces`), with missing/invalid evidence rejected instead of
  silently passing. Live probing, `diffContract`, and all existing commands
  are untouched. What the target author must still write by hand is listed
  under Remaining authoring burden below — the seam does not reduce that
  work, it only stops it from needing runner/CLI forks.

No onboarding timing metric is claimed here: setup cost remains
target-specific (see the prospective ledger in
`eval/followup/external-app/ONBOARDING.md` for the ntfy observation, not a
general estimate).

## Setup steps

1. **Pin the target.** Version, image digest when containerized, and the
   exact URLs/ports. Probes run against loopback only
   (`127.0.0.1:5280+`; never restart a pre-existing live service).
   No paid model calls are needed for scripted recording.

2. **Write the contract first.** One decision per file, protective intents
   with `mustSucceed`, frozen baseline paths and independent final-state
   oracles (never agent self-report). Reference implementation:
   `eval/followup/external-app/contracts/ntfy-choice-protection.json`.
   Keep `pairs: []` when only protective sides are measured (asymmetry is
   then out of scope, not passing evidence).

3. **Write a target-owned adapter.** Reference:
   `eval/followup/external-app/src/coreProbe.ts` (~600 lines, the full
   pattern). Requirements:
   - Mirror the frozen interaction path step for step (same selectors,
     waits, settles, oracle predicates).
   - Record every effortful tap as one real core `Action` at measured
     viewport coordinates (`click` = box center, `fill` = one `type`
     action); waits and settles are free, matching core metrics.
   - Capture a real screenshot file per observation (1280x800 in the
     pilot), stored as a bare filename.
   - Evaluate the oracle live per step and finally; assemble a
     spec-compliant core `Trace` in runner layout:
     `<tracesDir>/<traceId>/trace.json` plus `<tracesDir>/<traceId>/NNN.png`.
   - Mark the driver honestly (`scripted` when no model drove).
   - Never invent ntfy- or app-specific branches in the runner: all
     selectors, store reads, and oracle predicates live in the adapter.

4. **Record baseline and candidate runs.** One directory per comparison
   holding baseline traces (`variant: "baseline"`) plus one candidate
   variant's traces (`variant: "candidate"`), all for the same contract
   decision. Repeats follow the target's own determinism smoke (ntfy used
   repeats=1 after a 3x-identical smoke); the CLI does not set this.

5. **Score through the shipped CLI:**

   ```bash
   node packages/cli/dist/cli.js diff-traces \
     --contract <contract.json> --traces <scoring-dir> --out <report-dir>
   ```

   Exit code is 1 when the report fails (same gate rule as `diff`: only
   `low` findings pass). `report.json` + `comment.md` land in the out dir.
   `--intents D1,D2` optionally narrows scoring; unlisted intents are
   excluded from both loading and the report.

6. **Read the verdict like a diff.** Findings reuse repo vocabulary
   (`goal_unreachable`, `action_cost`, …). A `low` finding still prints but
   passes the gate — check the finding list, not just the exit code, when
   any cost change matters to you.

## Validation enforced by the CLI

- Every `trace.json` must parse and carry the full Trace shape
  (`id/decision/intentId/variant/repeat/driver/startedAt/initial/steps/
  final/oracle/stoppedReason`); clicks need finite `x/y`, `type` needs
  `text`.
- Every referenced screenshot must exist next to its trace and be
  non-empty; absolute paths and `..` traversal are rejected.
- Trace `decision` must match the contract; unknown intent ids are
  excluded only via `--intents`, never silently.
- Every selected intent needs at least one baseline **and** one candidate
  trace, or scoring aborts with `Missing recorded evidence` instead of
  reporting a silent pass.

Provenance (real device screenshots, live oracle reads) is **not**
machine-verified: the checks above confirm the evidence is present and
well-formed, not that it was honestly recorded. Trust comes from the
adapter being reviewed and its runs reproducible, as in the ntfy pilot.

## Worked example: ntfy stored traces (no containers, no model calls)

The committed core-integration traces already carry `variant:
baseline|candidate` (the pilot variant rides in the trace-id segment).
Stage one scoring dir per candidate from the worktree root, then score:

```bash
for V in O1 O2 O3 O4 V-benign V-improve; do
  D=/tmp/ntfy-score/$V; mkdir -p $D
  for DD in D1 D2 D3 D4; do
    cp -r eval/followup/external-app/raw/core-integration/traces/ntfy-choice-protection.$DD.baseline.0 $D/
    cp -r eval/followup/external-app/raw/core-integration/traces/ntfy-choice-protection.$DD.$V.0 $D/
  done
done
node packages/cli/dist/cli.js diff-traces \
  --contract eval/followup/external-app/contracts/ntfy-choice-protection.json \
  --traces /tmp/ntfy-score/O1 --out /tmp/ntfy-score/out-O1
```

Observed CLI verdicts (this branch, `$0`, no live app involved):

| Scoring dir | CLI result | Detail |
| --- | --- | --- |
| O1 | FAIL, exit 1 | D1 `goal_unreachable` high |
| O2 | PASS, exit 0 | D2 `action_cost` 6 → 7 low (finding printed, gate passes per the low-severity rule) |
| O3 | FAIL, exit 1 | D3 `action_cost` 6 → 8 medium |
| O4 | FAIL, exit 1 | D4 `goal_unreachable` high |
| V-benign | PASS, exit 0 | no findings |
| V-improve | PASS, exit 0 | no findings (recorded path takes the frozen route) |

This matches the pilot's frozen expectations cell-for-cell at the CLI
layer, including the O2 nuance (a real +1-tap finding that does not fail
the gate). It exercises scoring only: no page was loaded, no container
started, and the GitHub Action path remains unvalidated for this target.

## Remaining target-specific authoring burden

- Contract, selectors, oracle predicates, and baseline paths: all hand
  written and frozen before trials; renames still read as unreachable
  (exact-match replay cannot tell a relabel from a removal — demonstrated,
  not fixed, by this seam).
- Screenshot capture, viewport, trace layout, per-step oracle reads.
- Determinism smoke and repeats policy; flake accounting (per-attempt
  dirs so retries never overwrite evidence).
- Coverage discipline: one baseline + one candidate trace per scored
  intent per comparison dir; the CLI errors loudly when this is missing
  rather than guessing.

## Limits

- `diffTraces` never probes: a green report means the recordings match,
  not that the live app still behaves that way.
- No new detection logic: kinds, severities, and the low-passes rule are
  `diffContract` unchanged (`packages/core` has zero diff in this route).
- The Action, MCP `agencydiff_check`, and live `diff`/`audit` do not accept
  recorded traces; extending them is out of scope.
