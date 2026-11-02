# Audit method

> A read-only agent asked four license-renewal questions five times each on
> the live California DMV site and found the answer 8 times out of 20, taking
> a median of 5 to 23 effortful actions when it succeeded; the same agent
> asked the same questions of a one-page concept redesign built blind from
> the same facts and found the answer 20 times out of 20, taking a median of
> 0 to 5 actions. On a second site, IRS refund information, the agent
> succeeded 6 of 9 times live and 9 of 9 on the redesign.

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

## Fact oracles and blind redesign (Ticket 7d)

The v3 result was unfair in a precise way: the **Oracles** demanded the live
site's own page wording, so a redesign that paraphrased the same answers
failed them (live 4/12, mockup 3/12). The fix separates ground truth from
wording in three steps: facts → fact **Oracles** → blind redesign.

**Facts.** For each **Intent**, the real answer page on the live site was
visited (read-only) and the facts a person needs were extracted into
`eval/dmv/facts.json` (and `eval/refund/facts.json` for the second site),
with source URLs and retrieval date. Example: the REAL ID document
categories with concrete examples, the online-renewal eligibility window,
how to book an appointment.

**Fact oracles.** A new `facts` **Oracle** kind passes when the visible
viewport text covers at least `minFacts` of the required facts (2 of 5 for
every **Intent** here). Each fact carries a synonym list, and matching is
case- and punctuation-insensitive (`normalizeText` in `packages/core`:
lowercase, punctuation stripped, whitespace collapsed; synonyms shorter
than three characters never match). The SAME fact **Oracle** is applied to
both sites. Validation: the hand-checked fact texts pass every **Oracle**
with margin, homepage-like and unrelated-topic text fails all of them, and
`packages/core/src/dom.test.ts` covers the matcher offline, including a
paraphrase control.

**Blind redesign.** The redesigner receives the audit evidence plus the
facts file content, because a redesign reorganises the same information,
and MUST NOT receive the **Oracles**, synonym lists, thresholds, or
selectors. `pnpm run redesign` takes the facts path via `--facts`, records
exactly what it was given in the mockup's `meta.json` (`facts`,
`oraclesWithheld`), and the mockups (`apps/redesigns/dmv-renewal`,
`apps/redesigns/refund-status`) were generated with no hand edits.

```bash
pnpm run audit --target targets/public-audit.json --driver muse --repeats 5 --out audits/dmv-baseline-v4
pnpm run redesign --audit audits/dmv-baseline-v4 --name dmv-renewal --facts eval/dmv/facts.json
pnpm run serve-redesigns   # localhost:5199, for re-probing the mockups
pnpm run audit --target targets/dmv-redesign.json --driver muse --repeats 5 --out audits/dmv-redesign-v4
pnpm run compare-audits --before audits/dmv-baseline-v4 --after audits/dmv-redesign-v4
pnpm run audit --target targets/public-audit-refund.json --driver muse --repeats 3 --out audits/refund-baseline
pnpm run redesign --audit audits/refund-baseline --name refund-status --facts eval/refund/facts.json
pnpm run audit --target targets/refund-redesign.json --driver muse --repeats 3 --out audits/refund-redesign
pnpm run compare-audits --before audits/refund-baseline --after audits/refund-redesign
```

## The DMV result (Ticket 7d)

Result (Muse driver `muse-spark-1.3-contributor`, k=5, 25 steps):
baseline 8/20 successful (445 actions / 392 steps), mockup 20/20
successful (59 actions / 56 steps). Success plus median time-to-fact over
successful runs:

| Intent | Success before → after | To fact before → after | Steps before → after | Time before → after |
| --- | --- | --- | --- | --- |
| renew-online | 3/5 → 5/5 | 5 → 0 | 6 → 0 | 68.7s → 0s |
| renew-office | 0/5 → 5/5 | — → 5 | — → 4 | —s → 76.1s |
| real-id-docs | 3/5 → 5/5 | 21 → 1 | 22 → 2 | 372.3s → 24.2s |
| renew-appointment | 2/5 → 5/5 | 23 → 5 | 20 → 5 | 380.0s → 67.0s |

Reading the baseline: the fact **Oracles** transfer the failure from wording
to findability. Renew-office 0/5: four **Probes** exhausted the budget
searching registration topics or spinning on the portal homepage, one gave
up (`agent_done`) — none reached license office-renewal content.
Renew-online 3/5: the two failures spent all 25 steps on the homepage.
Real-id-docs 3/5 and renew-appointment 2/5: passes took 20+ actions of
searching and wandering; failures ended on search pages or the budget. Two
**Probes** died on Playwright screenshot protocol errors (environment
fault, no finding) and were re-run once each; both reruns failed genuinely.

Reading the mockup: the blind one-page redesign answers renew-online above
the fold (all five **Probes** satisfied on the initial observation, 0
steps) and the other three **Intents** a scroll away (median 1–5 actions
to fact). The same wording-independent **Oracle** now passes both sites,
so the gap measures findability headroom, not vocabulary overlap.

## Second site: IRS refund status (Ticket 7d)

Generality check on one more public, read-only, non-political government
information task: federal tax-refund information on irs.gov
(`contracts/refund-status.json`, `targets/public-audit-refund.json`): how
to check refund status online, how long a refund takes, and what to do when
something goes wrong. Same pipeline at k=3, neutral tone throughout.

Result (same driver, k=3, 25 steps): baseline 6/9 successful (109 actions /
118 steps), mockup 9/9 successful (33 actions / 36 steps):

| Intent | Success before → after | To fact before → after | Steps before → after | Time before → after |
| --- | --- | --- | --- | --- |
| refund-tracker | 3/3 → 3/3 | 0 → 0 | 0 → 0 | 0s → 0s |
| refund-timing | 1/3 → 3/3 | 21 → 4 | 19 → 5 | 336.6s → 64.7s |
| refund-help | 2/3 → 3/3 | 12 → 6 | 12 → 6 | 189.0s → 79.8s |

Reading it: refund-tracker passes at 0 steps on both sites — the audit
starts on the refunds landing page, which states the tracker facts in the
first viewport. That is answer placement, not navigation, and it is the
same for both **Variants**. Refund-timing 1/3 live: two **Probes** clicked
language links on the landing page and spent the budget on Haitian Creole
and Korean pages, where English facts cannot match; the third run died on
a Muse 500 transport error (no finding) and its rerun passed in 19 steps.
Refund-help 2/3: one **Probe** wandered to the withholding estimator, the
homepage, and site search; two passed in 9–14 actions. The blind mockup
passes all nine **Probes** in 0–7 actions.

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
  direction, not a statistically firm cost. The v4 DMV run uses k=5, which
  is still small: treat every rate and median here as directional.
- Fact oracles are only as complete as their synonym lists. A genuine
  answer phrased outside the list fails, so residual wording dependence
  remains — weaker than page-anchored strings, but not zero. The lists and
  thresholds are human-authored judgement calls, validated against the
  ground-truth texts and negative controls, not derived from them.
- A fact oracle accepts any page stating the facts, including the starting
  page. Zero-step passes (renew-online on the mockup, refund-tracker on
  both sites) measure answer placement in the first viewport, not
  navigation. That is a fair comparison only because both Variants face the
  same check.
- The ground-truth facts are a snapshot. Source pages change, and a stale
  `facts.json` silently re-anchors the oracle to old wording; re-validate
  the facts against the live pages before re-running.
- Environment faults are re-run, not counted: one Muse 500 and two
  screenshot protocol errors in these runs were each re-run once, and the
  rerun stands as the record. Reruns are noted in the per-case reading, not
  hidden in the totals.
