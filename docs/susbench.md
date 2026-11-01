# SusBench external benchmark

An external check of AgencyDiff against dark-pattern susceptibility cases from
[SusBench](https://github.com/SusBench-creator/SusBench) (UW, IUI'26;
[arXiv:2510.11035](https://arxiv.org/abs/2510.11035)).

## What was reused — and what was not

The SusBench repository was cloned to `/tmp/susbench-src`, outside this repo,
and treated as untrusted data: nothing in it was executed, and no SusBench
code is vendored here. The repository has **no root license file** (the only
`LICENSE` found covers the `openai-cua/` subfolder, MIT, OpenAI), so to stay
on safe ground this benchmark re-implements the documented *behaviors* of ten
SusBench injections in original static pages rather than copying extension
code or live-site markup.

Coverage: all 9 SusBench pattern types, mapped to the injection codes whose
behavior each page reproduces:

| Page | Pattern | SusBench codes |
|---|---|---|
| `disguised-ad` | Disguised ad | `amz_disguised` |
| `false-hierarchy` | False hierarchy | `amz_false_hierarchy` |
| `preselect` | Preselection | `amz_preselect` |
| `popup-ad` | Pop-up ad | `amz_pop_up` |
| `double-negative` | Double negative | `amz_double_neg_notif` |
| `confirm-shaming` | Confirm shaming | `amz_confirm_notif` |
| `social-proof` | Fake social proof | `amz_social` |
| `forced-action` | Forced action | `wgs_forced_action` |
| `hidden-info` | Hidden information | `wgs_hidden_information`, `ghd_hidden_information` |
| `preselect-plan` | Preselection (2nd template) | `att_preselect` |

## Method

Each page is served locally by `eval/susbench/server.mjs` (zero-dependency
static server, default port 5183). The same file renders both Variants,
selected by `?variant=`: `baseline` is the clean page, `candidate` applies
the injection client-side. For the 3 no-change controls (`control-*` in
`eval/susbench/manifest.json`) the candidate URL is the baseline URL, so any
finding there is a false alarm by construction.

Every pair has an Agency Contract (`eval/susbench/contracts/*.json`) with two
Intents — an accept Intent (add the item) and a Protective Intent (add it
without the extra, the signup, the account, or the cookies) — and a DOM
oracle per Intent. `eval/susbench/run.ts` probes each
Intent × Variant 3 times with the Muse computer-use driver
(`muse-spark-1.3-contributor`), diffs with the deterministic engine, and
writes `eval/susbench/runs/<pair>/report.json` plus the aggregate
`eval/susbench/results.json`. A pair counts as **detected** when its diff has
at least one medium- or high-severity finding.

## Safety

- No live pages, no purchases, no checkout: the lab pages contain no forms
  and no purchase-flow links, and every probe runs with the audit guard
  (enforcement) on — submits, credentials, and purchase navigation are
  refused at the browser layer.
- One deliberate split: the guard's *enforcement* stays on, but the driver
  does not use the read-only Audit instruction preamble, because that text
  forbids basket steps outright while this eval's Intents require completing
  basket adds on pages that structurally cannot check out.
- A guard refusal mid-probe becomes a recorded no-op step
  (`MuseDriver` `tolerateBlocked`, opt-in) instead of aborting the probe, so
  findings reflect achievable outcomes rather than the agent's first
  keyboard impulse. Refusals are visible in trace notes.

## Limits

- Local re-implementations, not live snapshots: the pages reproduce the
  injection *behaviors* (a lookalike ad button, a pre-checked box, an
  unequal modal, …) on a fictional store, so this measures AgencyDiff's
  response to those pattern shapes, not SusBench scores on real shops.
- Persuasion without a cost delta is invisible by design: `social-proof`
  changes no control and no price, so a diff of choice cost is expected to
  report nothing there. That negative is part of the result, not a gap.
- Default flips cannot fire here: black-box pages expose no initial state
  key, so `defaultValue` is undefined on both Variants.
- Small samples (k=3) and a keyboard-happy agent: medians over 3 runs are
  noisy, and spatial misses happen. Treat single-finding detections as
  indicative, and controls as the false-alarm baseline.
- SusBench's own scoring (agentAvoid/agentNotAvoid extension signals) is not
  reproduced; the oracle here is final page state, per AgencyDiff's rule
  that success is decided by the app, never by the agent's claim.

## Results

Run: 2026-11-01, `muse-spark-1.3-contributor`, 3 repeats per Intent and Variant.

| Pair | Pattern | Caught | What moved |
|---|---|---|---|
| disguised-ad | Disguised ad | yes | steps |
| false-hierarchy | False hierarchy | yes | success rate, steps |
| preselect | Preselection | yes | steps, success rate, asymmetry |
| popup-ad | Pop-up ad | yes | success rate, visibility, steps |
| forced-action | Forced action | yes | steps, visibility, success rate |
| hidden-info | Hidden information | yes | success rate |
| preselect-plan | Preselection (plan) | yes | steps, asymmetry |
| double-negative | Trick wording | no | nothing |
| confirm-shaming | Confirmshaming | no | nothing |
| social-proof | Fake social proof | no | nothing |

**Caught 7 of 10 injected patterns. 1 false alarm on 3 no-change controls.**

The three misses are all wording or persuasion patterns. They change what the page says, not what it costs to act, and the probe still finished each Intent in the same number of steps. AgencyDiff measures the cost and reachability of a choice, so it cannot see these. That limit is expected, and a persuasion check would have to cover them.

The false alarm (control-preselect) came from the agent itself: on two identical pages, one set of repeats took more steps than the other. With 3 repeats, run-to-run noise can look like a regression. Requiring a cost change to exceed the spread seen across repeats before reporting a finding would remove this class of false alarm.

