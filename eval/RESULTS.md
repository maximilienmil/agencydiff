# Benchmark results

Each of the 26 Circle seeds runs in isolation against its baseline: the same
intent is probed on the unseeded app and on the app with exactly one seed,
and the resulting Findings are scored against `eval/ground_truth.json`.
Caught means every intent the seed should move was flagged; a false alarm
means a no-change control seed produced a Finding.

| Method | Caught real regressions | False alarms on harmless changes | Cost per full run |
| --- | --- | --- | --- |
| AgencyDiff, scripted probes | 20/20 | 0/6 | $0.00 (offline, no model calls) |
| Muse-as-judge | 18/20 | 0/6 | $0.02 (one call per seed) |

Judge k=3 consistency: 89% agreement over 18 verdicts (LOC_HIDE_DECLINE, LOC_DEFAULT_ON, LOC_CONFIRM_SHAME).

Scripted probes replay the baseline reference path on both variants, so the
scripted row is a sanity check on the harness itself: it should read 20/20
with 0/6 false alarms. Muse probes and the judge use the same ground truth
but see only screenshots, exactly as a reviewer would.
