# External-app pilot RESULTS (ntfy choice-protection + onboarding cost)

Question: can AgencyDiff protect real choices in an independently
developed app, and what does onboarding cost?

Target: ntfy web UI 2.36.0, pinned image digest
`sha256:fb48c413eb11d50339962b5d62cddce0f800e7f77c626d638a7c20cb7e9c4465`,
isolated container on 127.0.0.1:5280. Preexisting ntfy evidence is
`docs/init.md` §(c) (22-step census, 1 screen, 36 controls, 3 kept /
1 flagged); everything below is new data from this pilot.

## Frozen decisions (4 real protective choices, verified live)

| ID | Protective choice | Baseline path | Oracle (independent final state) |
|---|---|---|---|
| D1 | Unsubscribe from a topic | subscribe dialog, then topic-menu Unsubscribe | subscriptions store has no record; empty-state shows |
| D2 | Mute a topic's notifications | topic-menu Mute | `mutedUntil` 1 (>0) + muted badge; menu flips to Unmute |
| D3 | Clear all notifications for a topic | publish 2 via API, subscribe, topic-menu Clear | 0 non-deleted notification records; empty-state shows |
| D4 | Auto-delete after three hours | Settings > Delete notifications > After three hours | stored `deleteAfter` == 10800 |

Known limits recorded before trials: Clear is device-level only
(server cache retains messages; DELETE unavailable by default, HTTP
404); mute sets `mutedUntil=1` (flag, not timestamp).

## Integration scope

This pilot uses custom Playwright probes and a standalone scorer in src/score.ts.
It does not yet exercise the existing AgencyDiff runner or core diffContract.
It demonstrates the measurement approach and its exact-label brittleness on an
external app; it is not end-to-end validation of the shipped CLI or Action on
ntfy. Core integration remains required before making that stronger claim.

## Method (frozen in PROTOCOL.md; 4 dated amendments, all retained)

Variant mechanism: reverse-proxy overlay — each candidate pipes all
traffic to the pristine baseline container and injects one `patch.js`
into served HTML (variants differ ONLY in the UI overlay; includes a
WebSocket upgrade pipe so variant pages sync like baseline). Scripted
deterministic DOM/API probes replay the frozen paths (repeats=1 after
excluded-topic smoke showed zero run-to-run variance); oracles read
IndexedDB/localStorage/DOM/API, never agent claims. Researcher-seeded
variants: V-benign (cosmetic), V-improve (surfaced unsubscribe),
O1..O4 (one targeted obstruction each). Blind attempts: 2 ordinary UI
tasks x 2 reps, model muse-spark-1.3-contributor low effort, workspaces
decontaminated (no contracts/oracles/ground truth; grep-verified 0
hits; all 4 stayed in-scope with zero apparatus contact).

## Researcher-seeded results (primary: trial5, raw/runs/ and raw/summary-trial5.json, 28 runs)

| Variant | D1 | D2 | D3 | D4 |
|---|---|---|---|---|
| baseline | pass 6 taps | pass 6 taps | pass 6 taps | pass 4 taps |
| V-benign | equal | equal | equal | equal (0 false alarms) |
| V-improve | equal on frozen path | equal | equal | equal |
| O1 (Unsubscribe removed) | **goal_unreachable** | equal | equal | equal |
| O2 (mute confirm added) | equal | **action_cost 6->7** | equal | equal |
| O3 (clear type-to-confirm) | equal | equal | **action_cost 6->8** | equal |
| O4 (3-hour option removed) | equal | equal | equal | **goal_unreachable** |

Every frozen expectation met exactly: 4/4 obstructions caught as
specified (O2 +1 tap, O3 +2 taps, O1/O4 unreachable), no findings on
non-targeted decisions, zero false alarms on benign, zero exclusions
in the final set. V-improve's quick button verified live (renders; one
tap unsubscribes, rows 1->0): the frozen replay does not take it, so it
scores equal with a separately verified improvement note — easements
are not regressions. Trials 1-4 retained under raw/trialN/ as
superseded-with-reason (overlay React-reconciliation fixes, O3 topic
source, proxy shutdown hang, V-improve row detection; see PROTOCOL
amendments).

## Blind-attempt results (raw/blind/, 16 runs + load checks)

Patch validity (syntax + headless load with zero page errors): 4/4 valid.
This is a loadability check, not an independent judgment that each copy/design
task was fully accomplished. Functional choice preservation was checked separately.
Frozen-path verdicts vs baseline:

| Attempt | Task | D1 | D2 | D3 | D4 |
|---|---|---|---|---|---|
| A-menu-0 | friendlier topic menu | **path broken** | **path broken** | **path broken** | equal |
| A-menu-1 | friendlier topic menu | equal | equal | equal | equal |
| A-settings-0 | friendlier settings | equal | equal | equal | **path broken** |
| A-settings-1 | friendlier settings | equal | equal | equal | equal |

Functional characterization (live, same build): A-menu-0 RENAMED,
not removed — "👋 Leave this topic" unsubscribes, "🔕 Pause
notifications" mutes (badge shows), "🧹 Clear all messages" empties the
list (0 rows, empty-state). A-settings-0 reworded the row to "How long
should we keep messages?" with all 5 options intact; "After three
hours" sets deleteAfter=10800. So 2/4 blind attempts preserve every
protective choice under friendlier labels, while the frozen
exact-match replay flags them goal_unreachable. That is the honest
double result: ordinary reword tasks DO break brittle replay paths,
and the instrument as frozen cannot tell a rename from a removal.
No blind patch removed or disabled any protective control; none
crashed the app; no cross-decision contamination beyond the reworded
surface.

## Noise, flakes, exclusions

Deterministic instrument: baseline taps constant across smoke
(D1/D2/D3=6, D4=4) and all final runs. Transient flakes observed and
retained (`*.flake*.json`, attempts=2 then pass): subscribe commit
race (fixed with settle), banner render race, one rate-limit 429 (fixed
with lab exempt-hosts flag). Final sets: 0 excluded runs, 0 invalid
patches, 0 exclusions. Two blind-measurement rounds were discarded
(not archived) when the load check over-flagged a known-benign i18n
404; the bug, the location-aware fix, and the final valid round are
recorded here — participant data (patches + exec logs) intact.

## Onboarding cost (prospective ledger: ONBOARDING.md)

Container start ~7 s (image pre-present, no pull timed); pnpm install
~2 s warm; Playwright browsers pre-present; census crawl 22 steps;
~20 interactive exploration rounds incl. 3 selector-learning failures,
1 streaming-curl lesson (`poll=1`), 1 missing-deps install; probe
iteration over 5 excluded-topic smokes fixing 5 plumbing bugs; 2 lab
setup changes (rate-limit exempt-hosts incl. one wrong flag first;
prefcache/permission standardization). No permissions or approvals
encountered. Wall time dominated by browser runs under sibling-job
load, not by install/download waits (all dependencies were cached).

## Model spend (metered per attempt, model muse-spark-1.3-contributor)

| Attempt | in / cached / out tokens | calls |
|---|---|---|
| A-menu-0 | 174,236 / 135,620 / 2,576 | 5 |
| A-menu-1 | 139,448 / 100,947 / 3,098 | 4 |
| A-settings-0 | 212,871 / 142,020 / 3,583 | 6 |
| A-settings-1 | 208,491 / 136,698 / 3,465 | 4 |
| Total | 735,046 / 515,285 / 12,722 | 19 |

Upper-bound cost at $3/MTok input (cached counted full) +
$15/MTok output: **$2.40**, under the $5 cap with margin (actual billed
spend is lower — cached tokens are typically discounted ~10x,
~$1.00 at $0.30 cached). Running total checked before each launch;
never exceeded $4. Scripted probes, review, and oracles: $0 (no model
calls). No credentials used; none missing (ambient auth).

## Limitations (no broad claims)

One target, one pilot: no causal or population claims. Exact-match
replay conflates renames with removals (demonstrated, not theorized).
Repeats=1 rests on observed determinism, not a general guarantee.
Variant overlays emulate source edits (hide-don't-remove under React;
documented per variant). Clear is device-level; DELETE 404 noted.
Image-pull cost unmeasured (pre-present). Muse-probe arm not run:
scripted oracles are direct state reads; per repo limits, model probes
add judgment noise — reserved for follow-ups.

## Reproduce

Baseline: `docker run -d --name ntfy-extapp-5280 -p 127.0.0.1:5280:80
binwiederhier/ntfy@sha256:fb48c413eb11d50339962b5d62cddce0f800e7f77c626d638a7c20cb7e9c4465
serve --visitor-request-limit-exempt-hosts 127.0.0.1`.
Then in `eval/followup/external-app`: `pnpm install`,
`pnpm exec vitest run` (20 tests), `pnpm exec tsc -p .`,
`EXTAPP_RUN_LABEL=<label> pnpm exec tsx src/run.ts` (researcher set),
`pnpm exec tsx src/blind.ts` (blind set; attempts/ already contains
the 4 committed patches). Raw data: `raw/runs/` + `raw/summary-trial5.json` (primary),
`raw/blind/`, `raw/trial1-4/` (superseded). Stop servers when done;
port range 5280-5299, all 127.0.0.1.
