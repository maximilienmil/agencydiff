# `agencydiff init`: from a URL to an Agency Contract in minutes

`pnpm run init --url <url> [--promise "<text or .md/.pdf path>"] --out contracts/<name>.json`
explores a web app read-only, drafts one Agency Contract per consequential
Decision it finds, validates each drafted Intent k=1, and writes the
contract plus a two-minute review summary (`<name>.review.md`) and the
exploration ledger (`<name>.exploration.json`).

## Pipeline

1. **Explore (audit guard ON, step cap 40).** A breadth-first census crawl
   clicks through the app from a fresh load per path. The browser refuses
   submits, credential entry and purchase navigation; nothing sensitive is
   ever typed (single empty search/topic fields take benign discovery
   text). Each screen records its text and controls (`data-agency` tags
   when the app has them, otherwise `id`/`aria-label` selectors, else
   stable positional CSS, plus visible text). Navigation opens screens
   first, state-flipping controls second, so deep screens win the step
   budget; controls revealed mid-visit (drawers, dialogs) join the same
   visit with their revealer prefix. Exploration stays same-origin:
   external links are never followed. `--driver muse` adds a Muse Spark
   audit pass (`muse-spark-1.3-contributor`, same guard) that records which
   screens a real probe reaches on its own.
2. **Draft.** The default heuristic drafter groups controls into Decisions
   (privacy, contact, notifications, subscription/cancel, data sharing,
   account deletion, time limits, purchase) and emits opposing Intent Pairs
   plus revoke and inspect Intents. Every dom oracle cites only selectors
   and text from the exploration record, with the screen it came from;
   everything is `draft: true`. A `--promise` text is mapped sentence by
   sentence; unmatched sentences land in `unmappedPromises`
   ("promise not found in product"). `--model-draft` replaces the heuristic
   with a single structured-output call, repaired by `normalizeModelContracts`
   (ungrounded oracles become `needsReview`, never trusted).
3. **Validate (k=1).** The default replays the recorded click path per
   Intent (path clicks, then discovery text, then the target control)
   against the same URL with the dom adapter and keeps the Intents whose
   oracle holds (inspect Intents check state in place, without actuating).
   `--validate muse` sends the real computer-use probe instead, k=1 per
   Intent with the same guard. Anything else gets `needsReview` with the
   reason.

## Generality probes (2026-11-02, heuristic draft, census)

### (a) Circle, without reading `contracts/`

The drafter imports nothing from `contracts/`: grouping comes only from
exploration text plus the taxonomy above. 40-step crawl: 13 screens,
45 controls, 5 decisions, 15 Intents (static validation: 13 kept,
2 flagged).

Intent recall against the four hand-written Circle contracts (strict =
same `data-agency` target; loose = same target or shared vocabulary):

| Contract | Strict | Loose-or-better | Notes |
|---|---|---|---|
| precise_location (3) | 2/3 | 3/3 | share/withhold rediscovered as a data_sharing pair |
| screen_time (5) | 1/5 | 2/5 | reminders found; 1h/4h limit options live below the 40-step horizon |
| subscription (5) | 3/5 | 4/5 | subscribe/decline/resume found; renewal-terms nav matched no verb |
| teen_dm (5) | 3/5 | 3/5 | allow/friends/relax found; reject picked friends-only over block-unknown |
| **Circle total (18)** | **9/18** | **12/18** | |

Muse validation (`--validate muse`, `muse-spark-1.3-contributor`, k=1 per
Intent on the same URL, audit guard on): **15 kept, 0 flagged** — all 15
traces oracle-passed (`/tmp/init-muse/circle.json` plus per-Intent trace
dirs). Step counts tell the honest story:

| Intent | Agent steps | Read |
|---|---|---|
| privacy accept / reject / revoke | 4 / 11 / 6 | real agent runs, oracle held after |
| subscription accept | 3 | real agent run, oracle held after |
| time_limits reject | 3 | real agent run, oracle held after |
| notifications turn on / off | 4 / 3 | real agent runs, oracle held after |
| 5× inspect + data_sharing ×3 + subscription reject | 0 | oracle already held on the entry screen |

The 0-step rows are oracle-held-at-entry, not agent feats: expected for
inspect Intents (they check state in place) and consistent with the 4
draft-flagged presence-only oracles. Total model spend for the pass:
15 probes, ~27 agent steps.

### (b) SusBench store pages, served locally

All 10 non-control pages (`eval/susbench/pages`, lab server on
localhost), 12-step cap each: every page drafted a `purchase` contract
with `accept_add_to_basket` on the observed `add` tag, plus an inspect
Intent. Static validation kept the accept Intent on all 10 pages;
presence-only oracles stay flagged for human strengthening.

Same-tag recall against `eval/susbench/contracts`: 13/20 hand Intents
(10/10 accept sides; the protective `clean` Intents point at
decline/warranty affordances that exist only as concepts on the baseline
page, so there is no tag to rediscover — correctly left flagged).

### (c) Third local target: ntfy (open-source, docker, localhost)

`binwiederhier/ntfy` (popular open-source push-notification server with
a public web UI) run as a local container; init probed
`http://localhost:2586/` read-only with the audit guard on. 22-step
crawl, 1 screen, 36 controls: the nav drawer plus the subscribe and
publish dialogs were all discovered without typing credentials —
including a topic-name field the crawler filled with benign discovery
text. Drafted `notifications` (inspect) and `subscription` (subscribe
accept, cancel reject, inspect) contracts; static validation 3 kept,
1 flagged.

Rejected alternatives: memos image names no longer resolve on the hub;
Uptime Kuma pulls and runs but its public surface is a credential setup
form behind which everything needs a login, so a read-only probe
correctly stops at the account boundary (1 screen, setup form only).
Mastodon/Discourse compose (multi-GB pulls plus database setup) does
not fit the ~1h box. No credentials sent anywhere; no live third-party
sites touched — every probe above ran against localhost.

## Model draft path (1 call)

`--model-draft` on the popup-ad exploration returned one `add_to_basket`
contract with grounded oracles (0 repairs needed that time). Model
replies are shape-checked regardless: missing ids/polarities are
derived, unresolvable pairs dropped, empty or ungrounded oracles flagged
(`normalizeModelContracts`, covered offline in `test/init.test.ts`).

## Limits

- Heuristic goals read machine-drafted; the review file exists because a
  human still rewords them.
- Single-screen content sites draft inspect-heavy contracts.
- Toggle-heavy flows validate state-dependently: the side matching the
  fresh-load default fails k=1 and is flagged, which is correct but noisy.
- `--validate muse` (real probe, k=1) is implemented and its Circle
  numbers are recorded in section (a) above.
