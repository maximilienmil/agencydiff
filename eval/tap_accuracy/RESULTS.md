# Tap grounding: resolution hypothesis (T5d)

Harness: `packages/runner/src/tapAccuracy.ts` against `eval/tap_accuracy/page.html`
(20 labelled buttons). Each cell is one harness run: 20 buttons x 3 repeats =
60 probes, baseline prompt, `muse-spark-1.3-contributor`. Baseline / size /
verify rows from T5c are the same harness at DSF 1. Costs are model spend per
60-probe run.

| Variant | Screenshot | Hit rate | Mean \|dy\| | Cost |
| --- | --- | --- | --- | --- |
| Baseline 430x860, DSF 1 | 430x860 | 43.3% (26/60) | 24.4px | $0.069 |
| Size note, DSF 1 (T5c) | 430x860 | 36.7% (22/60) | 25.7px | $0.079 |
| Verify-after-click (T5c) | 430x860 | 40.0% (24/60) | 27.2px | $0.078 |
| Same viewport, DSF 2 | 860x1720 | 16.7% (10/60) | 48.3px | $0.134 |
| Desktop 1280x800, DSF 1 | 1280x800 | 83.3% (50/60) | 8.8px | $0.077 |

DSF 3 was not run: the ticket conditions it on DSF 2 helping, and DSF 2
hurts by 27 points.

## Reading the two new rows

DSF 2 rejects the resolution hypothesis. Clicks arrive in screenshot pixels
(the smoke probe's raw x lands at 430, the centre of the 860-wide shot), so
scoring converts to CSS pixels with `toCssPixels` before comparing against
the tag boxes. Even scored fairly, the model overshoots downward: raw y is
about 1.2-1.4x the true screenshot y while x is exact, and the bias grows
down the page (first-button dy +24px CSS, mid-page dy +40-60px). Mean |dy|
doubles to 48px CSS and the hit rate falls to 16.7%. More pixels do not mean
finer grounding; they mean a larger systematic shift.

Desktop width confirms the useful half of the hypothesis: it is not pixel
density that matters but context. At 1280x800 the probe page is the same
430px centred column as on mobile (Circle's `.app` is likewise
`max-width: 430px; margin: 0 auto`), only with neutral margin around it.
First-click hit rate rises to 83.3% (+40 points over baseline) and mean
|dy| falls to 8.8px, at the same cost ($0.077 vs $0.069). All 20 buttons fit
above the 800px fold (last button bottom edge ~771px), so the misses are
grounding misses, not cut-off controls.

## Consequence

The Muse driver defaults to a 1280x800 viewport (`MUSE_VIEWPORT` in
`packages/runner/src/env.ts`, overridable via `AGENCY_MUSE_VIEWPORT=WxH`;
`AGENCY_MUSE_DSF` likewise). Scripted probes, audits and the tap harness
default keep the 430x860 mobile viewport. See the benchmark `RESULTS.md`
for the before/after full-bench comparison.
