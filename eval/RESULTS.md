# Benchmark results

Each of the 26 Circle seeds runs in isolation against its baseline: the same
intent is probed on the unseeded app and on the app with exactly one seed,
and the resulting Findings are scored against `eval/ground_truth.json`.
Caught means every intent the seed should move got a written Finding; a
false alarm means a no-change control seed produced a Finding.

| Method | Caught regressions /20 | False alarms /6 | Cost per full run |
| --- | --- | --- | --- |
| AgencyDiff, muse probes | 1/2 | 1/1 | $0.39 (k=3, model calls) |
| Muse-as-judge, given a walkthrough (upper bound) | 18/20 | 0/6 | $0.02 (one call per seed) |
| Muse-as-judge, first screens only | not run yet | not run yet | — |
| AgencyDiff, scripted probes (sanity) | 19/20 | 0/6 | $0.00 (offline, no model calls) |

Judge walkthrough k=3 consistency: 89% agreement over 18 verdicts (LOC_HIDE_DECLINE, LOC_DEFAULT_ON, LOC_CONFIRM_SHAME).

Scripted probes replay the baseline reference path on both variants, so the
scripted row is a sanity check on the harness itself: it should read 19/20
strict with 0/6 false alarms. The twentieth seed, DM_BURY_MESSAGES, is
caught only leniently: burying Messages strands the scripted replay before
it can act, while the friends_only oracle already holds in the default
state, so no Finding names that intent. Muse probes and both judges see
only screenshots, exactly as a reviewer would.

## What each method is good and bad at

AgencyDiff with muse probes drives the app like a person would, so it is
the only method that produces quantified evidence: how many taps an intent
takes, and traces anyone can replay. That makes it the only method that can
catch a control that vanished entirely. Its weakness is noise: the same
intent can take a different number of taps on each run with nothing changed,
so small differences do not count (see the counting rule below), and a full
run costs on the order of a dollar in model calls.

The judge with a walkthrough is the upper bound for screenshot review: it
is shown every screen along the reference path, which is a human-written
tour of where each control lives. It is cheap (pennies per run) and good at
visible changes such as moved or renamed controls, but it cannot measure
effort, and it misses anything the tour does not show, such as defaults
that only appear before the user has chosen anything.

The judge with first screens only is what a reviewer looking at PR
screenshots would see: one starting screen per intent, no tour. It is the
fairest comparison for review-time usefulness, and the weakest: anything
buried deeper than the first screen is invisible to it by construction.

Scripted probes are not a contender. They replay a fixed path, so they
cannot discover anything new; they only check that the harness itself
works.

## How we count a Finding from noisy probes

Model probes are noisy: the same intent can take 3 taps on one run and 6
on the next with nothing changed. So a cost or depth change only counts
when the slowest baseline run is still faster than the fastest candidate
run, and the typical (median) difference is at least one tap. A drop in
success rate only counts when at least two thirds of runs flip from pass
to fail. A seed counts as caught only when there is a written Finding on
one of the intents it was supposed to move; a visible-but-unmeasured
behaviour change counts only as a second-chance lenient score, reported
separately. Any Finding on a no-change control seed is a false alarm.
Single runs and scripted replays use the old rule: any median increase
counts, because there is no run-to-run noise to guard against.

## Harness bugs found and fixed

- The bench crashed on the license_renewal_info contract: it was added by a parallel ticket, has no baseline reference path and no ground-truth seeds, and the scripted driver tried to replay a path that does not exist. The bench now runs only contracts that have a baseline reference path.

## Notes

- AgencyDiff scripted missed DM_BURY_MESSAGES (expected teen_dm.friends_only to move) (caught leniently: trace difference, no Finding).
- AgencyDiff scripted on ST_REQUIRE_SAVE: caught, and also flagged remove_limit (goal_unreachable).
- AgencyDiff muse on ST_REQUIRE_SAVE: caught, and also flagged remove_limit (goal_unreachable), remove_limit (action_cost).
- AgencyDiff muse missed SUB_HIDE_DECLINE (expected subscription.decline to move) (caught leniently: trace difference, no Finding).
- Judge walkthrough on LOC_HIDE_DECLINE: caught, and also flagged precise_location.share (judge:easier).
- Judge walkthrough missed LOC_DEFAULT_ON (expected precise_location.withhold to move).
- Judge walkthrough on DM_DEFAULT_EVERYONE: caught, and also flagged teen_dm.allow_all (judge:easier), teen_dm.friends_only (judge:harder).
- Judge walkthrough missed DM_INFO_AFTER_CHOICE (expected teen_dm.friends_only, teen_dm.block_unknown to move).
- Judge walkthrough on ST_REQUIRE_SAVE: caught, and also flagged screen_time.remove_limit (judge:harder).
