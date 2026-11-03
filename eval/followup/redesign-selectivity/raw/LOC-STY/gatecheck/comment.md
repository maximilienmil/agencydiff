<!-- agencydiff -->
## AgencyDiff passed

### PASS — precise_location: Users can choose whether Circle gets their precise location, and change their mind later.

| Intent | Steps needed | Visible on first screen | Baseline path still works | Severity |
| --- | --- | --- | --- | --- |
| I want to share my precise location with this app. | 1 → 1 | yes → yes | yes → yes | — |
| I do not want to share my precise location with this app. | 1 → 1 | yes → yes | yes → yes | — |
| I shared my precise location earlier and changed my mind. Turn it off. | 3 → 3 | no → no | yes → yes | — |

- Asymmetry (share vs withhold): 1.0x → 1.0x cost of saying no vs saying yes

_Scripted check: the candidate replays the baseline's recorded path. A broken path means a control moved or disappeared; add the `agencydiff:muse` label to have Muse probes search for the new path and measure its cost._
_Numbers come from recorded probe traces checked against final app state, never from a model's claim._
