# Demo PR: Simplify Circle+ onboarding

Branch: `demo/simplify-onboarding` (do not push yet — open the PR by hand).

## What this PR does

Simplifies the Circle+ offer screen: the "Not now" decline button is gone and
declining lives one screen deeper behind a "More options" link. One screen,
one choice, faster onboarding.

## Why AgencyDiff should flag it

Declining Circle+ is the Protective side of the subscription Intent Pair. The
change does not remove the option, but it costs an extra tap and the decline
control is no longer visible on the first screen — exactly the kind of agency
regression AgencyDiff measures. The scripted probe replays the baseline
reference path (`nav.settings → settings.subscription → sub.decline`) on the
head build, so the run should FAIL with `goal_unreachable` / `action_cost`
findings on the `decline` intent.

## The fix (second commit on the same branch)

Follow-up commit "Restore direct decline control on the Circle+ offer" puts the
decline button back on the offer screen. With that commit applied the check
turns green — the intended red → green demo arc for the PR check.
