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

The audit guard stays on for every live run: the browser refuses form
submits, credential entry, purchase navigation, and the Enter key, and the
agent is instructed to stop with `INFEASIBLE` rather than work around that.
Read-only discovery **Intents** only.

Prefer `dom` oracles: exact-match assertions (`textContains`, `visible`) on
the final page, checked against the live DOM the agent never sees. Use
`model-judged` only when the target exposes no stable DOM markers; those
results are always labelled `modelJudged` and can never enter a two-Variant
diff (`assertDiffOracle` rejects them there).

Keep spend modest: repeats (`k`) at most 3, `MUSE_MAX_STEPS` caps the per-Probe
step budget (default 20), and the redesign step sends only key final
screenshots, never full screenshot history.

## The DMV case (Ticket 7)

Target: the California DMV portal (`targets/public-audit.json`), one Variant
with four discovery Intents about renewing a driver's license
(`contracts/dmv-renewal.json`): online renewal, office renewal, REAL ID
documents, appointments. All oracles are `dom` assertions validated against
the rendered pages before the run.

The redesign step fed the audit **Traces** (screens visited, step costs, one
final screenshot per Intent) to Muse Spark and produced a single-file static
mockup at `apps/redesigns/dmv-renewal/index.html`, labelled "concept
redesign". The mockup preserves the contract's exact-match phrases so the
SAME contract re-probes it (`targets/dmv-redesign.json`); the comparison is
in `audits/dmv-redesign/comparison.md` (one hand-edit after generation: the
`<h1>` now names the page topics so the contract's `h1` oracles check it —
see Limits).

Result (Muse driver `muse-spark-1.3-contributor`, k=3, `MUSE_MAX_STEPS=12`):
baseline 0/12 successful (94 actions / 88 steps across 12 traces), mockup
12/12 successful (48 actions / 54 steps, including one 0-step pass where the
answer was visible on first paint). Per-Intent medians:

| Intent | Steps before → after | Time before → after |
| --- | --- | --- |
| renew-online | 4 → 3 | 40.6s → 27.4s |
| renew-office | 12 → 7 | 176.3s → 82.9s |
| real-id-docs | 12 → 5 | 142.6s → 44.8s |
| renew-appointment | 5 → 5 | 60.8s → 50.6s |

Four baseline probes died on the guard's Enter block (agents type into the
homepage search and press Enter out of habit); six more exhausted the
step budget without leaving the homepage area (one reached vehicle
registration renewal, one the online portal — both wrong branches).

No hero image was generated: the mockup is an informational flow where
illustration adds no measurable findability.

## Limits

- `model-judged` results record what the final screenshot looks like to a
  model, not what happened in app state. They are labelled, never diffed.
- `dom` oracles assert exact rendered text on live third-party pages. Those
  pages change, run experiments, and sometimes block bots; re-validate the
  selectors before re-running, and treat a failed Probe as site drift until
  the trace says otherwise.
- The guard blocks the Enter key everywhere, including site search. Probes
  therefore undercount search-led discovery and over-rely on menu
  navigation; the audit measures menu-led findability under read-only rules.
  In this run the Enter block ended 4 of 12 probes outright (agents search
  first, then press Enter).
- A mockup re-probed by the same contract must satisfy the oracles at the
  selector level, not just phrase level: the first mockup draft put "Online
  Renewal" in an `<h2>` while the oracle checks the `<h1>`, and re-probing
  caught it. `pnpm run redesign` now passes per-phrase element hints; the
  shipped mockup still needed one `<h1>` hand-edit.
- The guard sees clicks, typing, keypresses, and navigation URLs. It cannot
  see JavaScript side effects, so read-only also depends on the agent
  following its instructions.
- k=3 is a small sample. Medians over three Probes show direction, not a
  statistically firm cost.
- The redesign mockup is judged by the same oracles, but a one-page mockup
  answering four questions is an easier target than a real site by
  construction. The before/after gap measures the design idea's headroom,
  not a prediction of real-world gains.
