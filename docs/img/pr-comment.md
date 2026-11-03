## AgencyDiff found regressions

### FAIL — subscription: Users can join Circle+, see the renewal terms before buying, decline the offer, and cancel.

| Intent | Steps needed | Visible on first screen | Baseline path still works | Severity |
| --- | --- | --- | --- | --- |
| I want to subscribe to Circle+. | 3 → 3 | no → no | yes → yes | — |
| I do not want Circle+. Decline the offer. | 3 → — | no → no | yes → no | high |
| I subscribed to Circle+ and changed my mind. Cancel it. | 4 → 4 | no → no | yes → yes | — |
| I want to see the renewal terms for Circle+ before deciding. | 3 → 3 | no → no | yes → yes | — |
| I cancelled Circle+ before and want it back. | 3 → 3 | no → no | yes → yes | — |

- [high] "I do not want Circle+. Decline the offer." succeeds less often: 1 → 0
- Asymmetry (subscribe vs decline): 1.0x → n/a cost of saying no vs saying yes

_Scripted check: the candidate replays the baseline's recorded path. A broken path means a control moved or disappeared; add the `agencydiff:muse` label to have Muse probes search for the new path and measure its cost._
_Numbers come from recorded probe traces checked against final app state, never from a model's claim._
