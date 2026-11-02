# Audit method

An **Audit** probes a single **Variant** with read-only discovery **Intents** and
reports cost and **Asymmetry** only. There is no baseline, so there are no
**Findings**. Success is decided by an **Oracle** on the final state, or is
labelled **model-judged** when a model judges the final screenshot.

## Running one

```bash
pnpm run audit --target targets/public-audit.json --driver muse --repeats 3
pnpm run redesign --audit audits/dmv-baseline-v3 --name dmv-renewal
pnpm run serve-redesigns   # localhost:5199, for re-probing the mockup
pnpm run audit --target targets/dmv-redesign.json --driver muse --repeats 3 --out audits/dmv-redesign-v3
pnpm run compare-audits --before audits/dmv-baseline-v3 --after audits/dmv-redesign-v3
```

The audit guard stays on for every live run: the browser refuses non-search
form submits, credential entry, purchase navigation, and the Enter key outside
site search, and the agent is instructed to stop with `INFEASIBLE` rather than
work around that. The site's own search box is allowed (a search field, or a
search / GET form with no login fields), including pressing Enter there: that
is read-only discovery. Read-only discovery **Intents** only.

Prefer `dom` oracles: assertions (`textContains`, `visible`, `visibleText`,
`anyOf`) on the page, checked against the live DOM the agent never sees. Use
`model-judged` only when the target exposes no stable DOM markers; those
results are always labelled `modelJudged` and can never enter a two-Variant
diff (`assertDiffOracle` rejects them there).

Keep spend modest: repeats (`k`) at most 3. The per-Probe step budget
defaults to 25 (`--max-steps`, or `MUSE_MAX_STEPS`), and the redesign step
sends only key final screenshots, never full screenshot history.

## Time to fact

The `dom` oracle is cheap local DOM, so the probe evaluates it after every
step — on the initial observation and after each driver step — and stops
early once the needed fact is on screen (`stoppedReason: "satisfied"`). Each
**Trace** records `firstSatisfiedStep` (steps elapsed, 0 for the initial
observation) and `actionsToSatisfy` (effortful actions up to that point).
Final-state success is still recorded, but the headline audit cost is
time-to-fact: median `actionsToSatisfy` over successful runs (see
`summarizeIntent` and `compare-audits`). Medians are empty when an Intent
never succeeded. Early stopping also saves model spend: a probe that finds
the fact in 5 steps costs 5 steps, not the 25-step budget.

`visibleText` assertions check only the element's text that intersects the
viewport, so an oracle can require the fact to be on screen rather than
anywhere in the DOM body. `anyOf` disjoins assertions for one fact: the same
Intent can be answered by different pages (a dedicated page or a search
advisor) in different words, and the oracle accepts any genuine answer while
the homepage still fails.

Probes that die on model-API transport errors (HTTP 5xx) carry no finding
and are re-run; guard refusals and step budgets are kept as traces. The
audit report is recomputed from the trace files with `auditContract`, so a
merged set of repeats stays deterministic.

## The DMV case (Ticket 7c)

Target: the California DMV portal (`targets/public-audit.json`), one Variant
with four discovery Intents about renewing a driver's license
(`contracts/dmv-renewal.json`): online renewal, office renewal, REAL ID
documents, appointments. This is a findability study for a read-only agent,
not a judgement of the agency: it asks how much work it takes a probing
agent to reach pages that show each fact.

History: `audits/dmv-baseline` (Ticket 7b, loose body-word oracles) and
`audits/dmv-baseline-v2` (guard-fix rerun) were superseded by
`audits/dmv-baseline-v3` and deleted, as was `audits/dmv-redesign` by
`audits/dmv-redesign-v3`. The v2 run "succeeded" 3/3 on most Intents while
hitting the 25-step budget every time (31–41 actions): body-level word
checks the portal homepage already satisfied, judged on the final state, so
step counts measured the budget, not findability.

Each v3 oracle requires the specific fact to be visible in the viewport,
specific enough that the homepage and nav menu fail. Validated by loading
the live pages: the homepage fails every oracle (every string but one is
absent from the whole homepage body; `Get in Line Now` lives only in the
collapsed nav and never in the viewport across all three hero slides), each
dedicated answer page passes, and wrong-topic registration pages fail the
license oracles.

| Intent | Oracle (all `visibleText` on `body`) | Passes on |
| --- | --- | --- |
| renew-online | ("Online Renewal" OR "Renew Online") AND ("renewal notice" OR "eligible to renew") | Online-renewal page; renewal search advisor |
| renew-office | ("Renew at a DMV Office" OR "renew at the DMV office") AND ("office visit" OR "Get in Line Now") AND "Driver's License Renew" | Office section of the renewal page; renewal search advisor |
| real-id-docs | ("passport" OR "birth certificate") AND "residency" | REAL ID how-to section (document list) |
| renew-appointment | "Know Before You Go" AND "Start Application" | Appointments selection page |

The license anchor on renew-office closed a real false positive found
mid-ticket: two probes passed on the vehicle-registration advisor, which
shares the office-visit wording. The anchor (in both apostrophe variants
the site uses) rejects wrong-topic pages; the two probes were re-run under
the tightened oracle. The eDL-44 application page fails the appointment
oracle (no "Know Before You Go"), and the renewal hub page fails the office
oracle (it links to answers without stating them).

Result (Muse driver `muse-spark-1.3-contributor`, k=3, 25 steps):
baseline 4/12 successful (352 actions / 249 steps), mockup 3/12 successful
(141 actions / 84 steps). Success plus median time-to-fact over successful
runs:

| Intent | Success before → after | To fact before → after | Steps before → after | Time before → after |
| --- | --- | --- | --- | --- |
| renew-online | 3/3 → 0/3 | 20 → — | 19 → — | 284.5s → —s |
| renew-office | 0/3 → 0/3 | — → — | — → — | —s → —s |
| real-id-docs | 0/3 → 3/3 | — → 4 | — → 4 | —s → 36.3s |
| renew-appointment | 1/3 → 0/3 | 19 → — | 24 → — | 344.3s → —s |

Reading the baseline: renew-online passes came from license-topic pages
only — one direct to the dedicated page (14 steps), two via license
searches ending on the renewal advisor (19 and 25 steps). Renew-office
0/3: all three probes searched registration topics for a license question
(one claimed done on the registration search, two exhausted the budget),
never reaching license office-renewal content. Real-id-docs 0/3: one guard
click refusal on the homepage at step 7, two budget failures via search
(one reached the what-is-REAL-ID page, none the document list). The single
renew-appointment pass navigated homepage → search → appointment selection
(24 steps, 19 actions); the other two ended on a guard Enter refusal and
the search page.

Reading the mockup: the existing blind mockup (`apps/redesigns/dmv-renewal`,
unchanged, built from earlier evidence) answers all four Intents in
ordinary words, but the strict oracles demand page-specific strings, so
only real-id-docs passes (3/3, one scroll away, median 4 actions to fact).
The other nine probes read the mockup's answers and stopped, correctly
failing oracles written against dmv.ca.gov wording. That inversion is the
honest finding: page-anchored oracles do not transfer to a redesign that
paraphrases. The mockup was not regenerated: a blind regeneration cannot
target page-specific wording and would most likely repeat the same 1/4.

No hero image was generated: the mockup is an informational flow where
illustration adds no measurable findability.

## Limits

- A probing agent is a proxy, not a person. It searches the wrong topic,
  misses content a person would see, and stalls where a person would ask for
  help. Treat step counts as agent effort under read-only rules, not as
  predictions of human behaviour.
- The redesign is a concept with no backend: a static page answering four
  questions. A one-page mockup is an easier target than a real site by
  construction, and every mockup probe sees all four answers at once. The
  before/after gap measures the design idea's headroom, not a prediction of
  real-world gains.
- The live site may change. `dom` oracles assert rendered text on live
  third-party pages, which change, run experiments, and sometimes block bots;
  re-validate the checks before re-running, and treat a failed Probe as site
  drift until the trace says otherwise.
- `model-judged` results record what the final screenshot looks like to a
  model, not what happened in app state. They are labelled, never diffed.
- Strict oracles are page-anchored: they demand the fact in the live site's
  own words, so a redesign that paraphrases the same answer fails them.
  Before/after success gaps say as much about wording overlap as about
  findability; check which strings matched before claiming a design regressed.
- The search advisor is accepted as an answer where it genuinely states the
  fact (renewal Options 1–3), not where it only links onward. Advisor
  content is query-dependent and unversioned; re-validate it like any page.
- The guard sees clicks, typing, keypresses, and navigation URLs. It cannot
  see JavaScript side effects, so read-only also depends on the agent
  following its instructions.
- k=3 is a small sample. Success rates and medians over three Probes show
  direction, not a statistically firm cost.
