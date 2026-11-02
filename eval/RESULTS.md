# Benchmark results

Each of the 26 Circle seeds runs in isolation against its baseline: the same
intent is probed on the unseeded app and on the app with exactly one seed,
and the resulting Findings are scored against `eval/ground_truth.json`.
Caught means every intent the seed should move got a written Finding; a
false alarm means a no-change control seed produced a Finding.

| Method | Caught regressions /20 | False alarms /6 | Cost per full run |
| --- | --- | --- | --- |
| AgencyDiff, muse probes, mobile viewport (pre-T5d) | 15/20 | 6/6 | $2.44 (k=3, model calls) |
| AgencyDiff, muse probes, desktop viewport (T5d) | 8/20 | 3/6 | $2.37 (k=3, model calls) |
| Muse-as-judge, given a walkthrough (upper bound) | 17/20 | 0/6 | $0.02 (one call per seed) |
| Muse-as-judge, first screens only | 1/20 | 0/6 | $0.02 (one call per seed) |
| AgencyDiff, scripted probes (sanity) | 19/20 | 0/6 | $0.00 (offline, no model calls) |
| Hybrid: scripted gate, muse cost probe | 19/20 | 0/6 | $0.88 (computed, no extra runs) |

The hybrid row is not a new run: detection and false alarms come from the
scripted replay (the gate), and the cost is the recorded muse spend on the
seeds where the gate fired, measuring the new path only where the old one
broke. Seeds the gate never fires on cost nothing. Its cost is computed
from the current (desktop-viewport) muse partials.

T5d re-ran the muse row end to end at the new default 1280x800 viewport
(tap grounding: 83% first-tap hits vs 43% at 430x860; see
`eval/tap_accuracy/RESULTS.md`). Better grounding made probes more
consistent on both variants, which cut noise and signal together under the
strict counting rule: every one of the 12 missed regressions still shows a
trace difference (lenient-only), but no strict Finding, while control false
alarms halved from 6/6 to 3/6. The recommended mode stays hybrid: the
scripted gate keeps 19/20 strict detection with 0/6 false alarms, and the
desktop-viewport muse probes measure cost where the gate fires.

Judge walkthrough k=3 consistency: 100% agreement over 18 verdicts (LOC_HIDE_DECLINE, LOC_DEFAULT_ON, LOC_CONFIRM_SHAME).

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
run costs a couple of dollars in model calls. With the counting rule at
three repeats per intent, half the no-change controls still produce a
Finding (3/6 at the desktop viewport, 6/6 at the mobile one): with so few
runs, luck alone can separate the two sides.

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
- One dead browser killed the whole benchmark: a probe whose page died mid-run threw out of runProbe, through the pool, and out of the bench with no partial for its seed. Probes now retry with a fresh browser (3 attempts) and record an error trace instead of throwing, so infrastructure flakes cost one trace, not the run.
- A wrong screenshot size would silently shift every model click, so the browser env now asserts each shot is exactly viewport times deviceScaleFactor and converts screenshot pixels to CSS pixels on execute (identity at scale 1).

## Notes

- AgencyDiff scripted missed DM_BURY_MESSAGES (expected teen_dm.friends_only to move) (caught leniently: trace difference, no Finding).
- AgencyDiff scripted on ST_REQUIRE_SAVE: caught, and also flagged remove_limit (goal_unreachable).
- AgencyDiff muse missed LOC_DEFAULT_ON (expected precise_location.withhold to move) (caught leniently: trace difference, no Finding).
- AgencyDiff muse missed LOC_CONFIRM_SHAME (expected precise_location.revoke to move) (caught leniently: trace difference, no Finding).
- AgencyDiff muse missed LOC_BURY_SETTING (expected precise_location.revoke to move) (caught leniently: trace difference, no Finding).
- AgencyDiff muse missed LOC_NO_DIRECT_TOGGLE (expected precise_location.revoke to move) (caught leniently: trace difference, no Finding).
- AgencyDiff muse missed DM_HIDE_BLOCK (expected teen_dm.block_unknown to move) (caught leniently: trace difference, no Finding).
- AgencyDiff muse missed DM_DEFAULT_EVERYONE (expected teen_dm.block_unknown to move) (caught leniently: trace difference, no Finding).
- AgencyDiff muse missed DM_BURY_MESSAGES (expected teen_dm.allow_all, teen_dm.friends_only, teen_dm.block_unknown, teen_dm.inspect, teen_dm.relax to move) (caught leniently: trace difference, no Finding).
- AgencyDiff muse missed DM_CONFIRM_BLOCK (expected teen_dm.block_unknown to move) (caught leniently: trace difference, no Finding).
- AgencyDiff muse missed DM_INFO_AFTER_CHOICE (expected teen_dm.allow_all, teen_dm.friends_only, teen_dm.block_unknown, teen_dm.relax to move) (caught leniently: trace difference, no Finding).
- AgencyDiff muse missed ST_HIDE_REMOVE (expected screen_time.remove_limit to move) (caught leniently: trace difference, no Finding).
- AgencyDiff muse on ST_REQUIRE_SAVE: caught, and also flagged remove_limit (action_cost).
- AgencyDiff muse missed ST_REQUIRE_SAVE (expected screen_time.shorten to move) (caught leniently: trace difference, no Finding).
- AgencyDiff muse missed SUB_HIDE_DECLINE (expected subscription.decline to move) (caught leniently: trace difference, no Finding).
- AgencyDiff muse on SUB_BURY_CANCEL: caught, and also flagged resume (action_cost), resume (navigation_depth).
- AgencyDiff muse on SUB_DEFAULT_ANNUAL: caught, and also flagged resume (action_cost), resume (navigation_depth).
- Judge walkthrough on LOC_HIDE_DECLINE: caught, and also flagged precise_location.share (judge:easier).
- Judge walkthrough missed LOC_DEFAULT_ON (expected precise_location.withhold to move).
- Judge walkthrough on DM_DEFAULT_EVERYONE: caught, and also flagged teen_dm.allow_all (judge:easier), teen_dm.friends_only (judge:harder).
- Judge walkthrough missed DM_DEFAULT_EVERYONE (expected teen_dm.block_unknown to move).
- Judge walkthrough missed DM_INFO_AFTER_CHOICE (expected teen_dm.friends_only, teen_dm.block_unknown to move).
- Judge walkthrough on ST_REQUIRE_SAVE: caught, and also flagged screen_time.remove_limit (judge:harder).
- Judge walkthrough on SUB_DEFAULT_ANNUAL: caught, and also flagged subscription.resume (judge:harder).
- Judge first-screens missed every regression seed except LOC_HIDE_DECLINE: buried controls are invisible from the start screen by construction.
- Judge first-screens on LOC_HIDE_DECLINE: caught, and also flagged precise_location.share (judge:easier).
