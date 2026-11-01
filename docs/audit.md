# Audit method

An **Audit** probes a single **Variant** with read-only discovery **Intents** and
reports cost and **Asymmetry** only. There is no baseline, so there are no
**Findings**. Success is decided by an **Oracle** on the final state, or is
labelled **model-judged** when a model judges the final screenshot.

## Running one

```bash
pnpm run audit --target targets/public-audit.json --driver muse --repeats 3
pnpm run redesign --audit audits/dmv-baseline --name dmv-renewal
pnpm run serve-redesigns   # localhost:5199, for re-probing the mockup
pnpm run audit --target targets/dmv-redesign.json --driver muse --repeats 3 --out audits/dmv-redesign
pnpm run compare-audits --before audits/dmv-baseline --after audits/dmv-redesign
```

The audit guard stays on for every live run: the browser refuses non-search
form submits, credential entry, purchase navigation, and the Enter key outside
site search, and the agent is instructed to stop with `INFEASIBLE` rather than
work around that. The site's own search box is allowed (a search field, or a
search / GET form with no login fields), including pressing Enter there: that
is read-only discovery. Read-only discovery **Intents** only.

Prefer `dom` oracles: assertions (`textContains`, `visible`) on the final
page, checked against the live DOM the agent never sees. Use
`model-judged` only when the target exposes no stable DOM markers; those
results are always labelled `modelJudged` and can never enter a two-Variant
diff (`assertDiffOracle` rejects them there).

Keep spend modest: repeats (`k`) at most 3. The per-Probe step budget
defaults to 25 (`--max-steps`, or `MUSE_MAX_STEPS`), and the redesign step
sends only key final screenshots, never full screenshot history.

Comparison reports success rate plus median steps over successful runs (see
`summarizeIntent`); medians are empty when an Intent never succeeded.

## The DMV case (Ticket 7b)

Target: the California DMV portal (`targets/public-audit.json`), one Variant
with four discovery Intents about renewing a driver's license
(`contracts/dmv-renewal.json`): online renewal, office renewal, REAL ID
documents, appointments. This is a findability study for a read-only agent,
not a judgement of the agency: it asks how much work it takes a probing
agent to reach pages that show each fact.

All oracles are loose `dom` content checks on the page body, validated
against the rendered pages before the run, and the same contract re-probes
both sites. Each Intent passes when the final page shows the fact words a
person would need: online + renew, office + renew, REAL ID + document +
passport, appointment + office.

The redesign step fed the audit **Traces** (screens visited, step costs, one
final screenshot per Intent) plus the Intent goals to Muse Spark and produced
a single-file static mockup at `apps/redesigns/dmv-renewal/index.html`,
labelled "concept redesign". The redesign prompt never sees the oracles, and
the generated mockup is used unedited.

Result (Muse driver `muse-spark-1.3-contributor`, k=3, 25 steps):
baseline 7/12 successful (99 actions / 95 steps across 12 traces), mockup
12/12 successful (74 actions / 54 steps, including one 0-step pass where the
answer was visible on first paint). Per-Intent success plus median steps over
successful runs:

| Intent | Success before → after | Steps before → after | Time before → after |
| --- | --- | --- | --- |
| renew-online | 3/3 → 3/3 | 5 → 3 | 45.2s → 26.8s |
| renew-office | 3/3 → 3/3 | 4 → 4 | 33.1s → 42.0s |
| real-id-docs | 0/3 → 3/3 | — → 5 | — → 44.9s |
| renew-appointment | 1/3 → 3/3 | 8 → 5 | 77.8s → 40.6s |

Reading the baseline: the portal homepage already names the online and office
renewal services, so all three renew-online passes and two of three
renew-office passes ended on the homepage (final URL `/portal/`); the oracle
counts that as the fact shown. The remaining passes navigated somewhere: one
renew-office pass via site search, and the renew-appointment pass via site
search (`?s=schedule+appointment`). No baseline probe reached a REAL ID
document list: one exhausted the 25-step budget in the wrong branch
(MyDMV account pages), one ended on the homepage, and one reached the site
search results for "REAL ID documents" but died on an unsupported keypress
(`Page_Down`, which the runner does not map) before finishing. Eight of
twelve baseline probes ended on the guard's Enter block: agents press Enter
with focus outside the search field, and the guard refuses an Enter it cannot
place in a search context. Three probes reached `?s=` search-result pages,
so search-led discovery works when the agent keeps focus in the box.

No hero image was generated: the mockup is an informational flow where
illustration adds no measurable findability.

## Limits

- A probing agent is a proxy, not a person. It presses Enter out of habit,
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
- The loose oracles count a fact shown anywhere on the final page, including
  the portal homepage. Homepage passes are honest successes of "the page
  shows the fact", but they say nothing about navigation; check final URLs
  in the traces before claiming an agent found its way somewhere.
- The guard sees clicks, typing, keypresses, and navigation URLs. It cannot
  see JavaScript side effects, so read-only also depends on the agent
  following its instructions. The runner does not map every key the agent
  may emit (`Page_Down` ended one baseline probe that had reached its
  search results).
- k=3 is a small sample. Success rates and medians over three Probes show
  direction, not a statistically firm cost.
