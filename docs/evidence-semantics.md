# Evidence semantics: replay failure vs outcome regression

When a success-rate drop triggers a finding, core distinguishes three things that all look like "success rate
dropped": a reference path that could not be replayed, a probe that
errored without an independent final state, and a completed run whose
independent oracle still failed. The last one is an observed outcome failure
(`goal_unreachable`), not proof that no alternative path exists. The first two stay blocking but under
their own kinds, visibly review-required.

## Kinds

| Kind | When | Severity | Gate |
|---|---|---|---|
| `goal_unreachable` | driver finished (`script_done`, `agent_done`, `step_budget`, `satisfied`) and the oracle still failed | high when candidate 0, else medium | FAIL |
| `replay_blocked` | candidate oracle failed (or state unreadable) and the trace error names a reference control (`reference tag not found`, `menuitem absent`, waits for a named selector) | medium | FAIL, needs review |
| `probe_inconclusive` | probe errored without reference-path signature, or oracle unchecked (browser closed, navigation timeout, 429, page crash) | medium | FAIL, needs review |

`action_cost`, `navigation_depth`, `visibility`, `default_flip`, and
`asymmetry` are unchanged: verified cost and default failures keep
their old verdicts.

Every success-rate finding carries `provenance`:

```json
{ "basis": "outcome | replay-path | infrastructure",
  "baselineSuccesses": 1, "candidateSuccesses": 0,
  "candidateOutcomeFailures": 1, "candidateReplayBlocked": 0,
  "candidateInconclusive": 0 }
```

Old reports have no `provenance`; readers must treat a missing field
as "unknown basis" (the pre-fix conflated verdict), never as confirmed.

## Rediscovery, not substring guessing

A blocked path alone never proves a rename or a removal. When a second,
independently collected set of traces exists (a Muse probe searching
freely, or a second scripted path with different labels), use:

```ts
import { assessRediscovery, compareReachableCost } from "@agencydiff/core";
assessRediscovery(independentTraces); // { reachable, verifiedSuccesses, medianActions }
compareReachableCost(baselineTraces, rediscoveryTraces); // { reachable, baselineCost, rediscoveryCost, delta }
```

Both helpers count only oracle-checked successes. Oracle-unchecked
`agent_done` traces (model claims) never count as reachable. No label
fuzzy-matching, no synthetic evidence.

## What this fixes, and what it does not

Fixes false classification: the ntfy A-menu-0 rename (and the
timing-sensitive A-menu-1 mute read) previously reported
`goal_unreachable`. Under these semantics the same traces report
`replay_blocked`: still blocking, but honestly labeled as
removal-not-established.

Does NOT by itself rediscover controls: no new path is found here.
Actual rediscovery still needs a runner-side independent probe and a
`compareReachableCost` call. Without that second probe, a genuine
removal whose only signal is a missing menuitem also reports
`replay_blocked` (review-required, blocking) rather than
`goal_unreachable`. A completed run that fails the independent oracle may report
`goal_unreachable`; this establishes a failure of the observed attempt,
not exhaustive unreachability. Failed rediscovery remains uncertain.

## Runner follow-ups (sibling owner, not done here)

1. Surface the two new kinds in the CLI PR comment and `classifyRegressions`
   (currently any protective-intent finding counts; decide whether
   `replay_blocked`/`probe_inconclusive` keep that label or get a
   separate "needs review" section).
2. After a `replay_blocked`, optionally run a Muse rediscovery probe on
   the same intent and attach `compareReachableCost` output as review
   evidence; on `reachable: true` report the delta as cost, on
   `reachable: false` retain the review-required status.
3. Add a rerun path for `probe_inconclusive` (transient infra) distinct
   from the review path for `replay_blocked`.
4. Schema consumers: `Finding.kind` gained two values;
   `Finding.provenance` is new and optional. Old JSON stays readable.

## Limits

- Heuristic error classification: a genuinely removed control and a
  renamed one are indistinguishable from one scripted trace. The seam
  is conservative by design (review-required, still blocking).
- No timing analysis: the A-menu-1 overlay race (verdict flips with
  read timing) is labeled, not resolved. Repeats and later reads still
  belong to the runner.
- Black-box `agent_done`-without-oracle still counts as success for
  backcompat; `assessRediscovery` deliberately excludes it.
