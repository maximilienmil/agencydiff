# Onboarding-cost ledger (prospective)

All times EST, 2026-11-02 evening unless noted. Durations measured with
`date`/file mtimes/docker timestamps as they happened; estimates are
flagged as such.

## Setup (environment)

- 21:42–21:43 — `docker run` of pinned image on 127.0.0.1:5280: first
  HTTP 200 after ~7 s. Image `binwiederhier/ntfy:latest` (= 2.36.0,
  digest `sha256:fb48…c4465`) was pre-present locally: zero pull time.
  Setup cost had the image been absent is NOT measured (limitation).
- 23:23 — container restarted with lab-only flag
  `--visitor-request-limit-exempt-hosts 127.0.0.1` (kills visitor
  rate-limit 429s from our own probes/publishes; no UI behavior change).
  One failed restart first with a nonexistent flag name
  (`--visitor-message-limit-burst`); corrected after `serve --help`.
  Same image digest; ~4 s to healthy.
- `pnpm install` (repo root, warm store): ~2 s first run, <1 s second
  run. No dependency download waited on.
- Playwright browsers pre-present in `~/Library/Caches/ms-playwright`
  (chromium-1234/1243/1248 + headless shells): zero download time.
- Permissions/approvals encountered: none (docker, loopback ports
  5280+, browser launch all worked without prompts).

## App exploration (identify real protective choices)

- ~21:43–21:52 (est.) — census `init` crawl (heuristic draft, static
  validation, no model calls): 22 steps, 1 screen, 36 controls; drafted
  `notifications` + `subscription` contracts, 3 kept / 1 flagged.
  Matches the preexisting `docs/init.md` §(c) shape (new run, new data).
- ~21:52–22:05 (est.) — interactive verification in isolated browser:
  subscribed/unsubscribed, mute/unmute toggle, clear-all (client list),
  Settings rows (sound / min priority / delete-after with options
  Never–1mo). Server-side DELETE unavailable in default config (HTTP
  404); Clear leaves server cache intact (verified via API).
- Tool friction (all exploration, none affecting trials):
  - 3 ego-browser click failures learning `@ref` selector syntax.
  - 1 `curl` hang: ntfy `/json` streams; learned `poll=1`.
  - 1 `pnpm exec` failure (`tsx` not found before install).
  - 1 killed background `find /` (unneeded; superseded).
  - 1 stalled playwright discovery run (terminated; sibling-experiment
    CPU contention suspected; reran via file-logged runs).

## Instrument building (probe + proxy + scoring)

- 21:53 — `src/proxy.ts`, `src/score.ts`, `tests/proxy.test.ts`,
  `tests/score.test.ts` written; 19/19 pass first run; `tsc` clean after
  adding `@types/node` (same pin as runner package).
- Narrowly scoped changes outside the assigned dir: `pnpm-workspace.yaml`
  +1 line (`eval/followup/*`); `pnpm-lock.yaml` additive-only for the new
  pilot package. Explained in PR.
- 21:54–22:24 — probe iteration over 6 excluded-topic smoke runs
  (`smoke-excluded-*`, never reused in trials). Bugs found and fixed
  before trials (all pre-trial plumbing, expectations unchanged):
  1. React fill-commit race on SUBSCRIBE → 400 ms settle (no tap).
  2. First-run banner render race (±1 tap) → 1500 ms settle; constant 6/6/6/4.
  3. ntfy publish 429s → paced seeds + retry; then lab exempt-hosts flag.
  4. Clear oracle wrong (rows kept with `deleted=1`) → count non-deleted.
  5. D4 text-match ambiguity ("After one week" in two places) →
     `div[role=combobox]` locator; option list verified live.
- Client-state map (verified live, frozen oracles read this):
  - `localStorage.prefcache.deleteAfter` (10800 after change).
  - IndexedDB `ntfy` db: `subscriptions` ({topic, mutedUntil: 1 when
    muted}), `notifications` ({subscriptionId, deleted}).
- Smoke verdict at 22:24: deterministic — D1/D2/D3 = 6 taps ×3,
  D4 = 4 taps ×3, all oracles pass → trials use repeats=1, deterministic
  scoring rule.

## Trial runs (instrumented ledger)

- trial1 (raw/trial1/, 28 runs, ~3 min): exposed 3 overlay bugs (O1
  React-reconciliation crash on mute; O2/O3 re-entrancy; O3 topic
  source). Superseded, retained.
- trial2 (raw/trial2/): with suppression-flag + hide-don't-remove
  fixes; O3 D3 still failed (topic-source bug). Superseded, retained.
- trial3 (raw/trial3/, salvaged offline): run.ts hung at shutdown on
  open ws pipes AFTER all probes completed; scored with src/salvage.ts
  (same frozen rule). Superseded, retained.
- trial4 (raw/trial4/): clean shutdown; V-improve button absent
  (row-detection regex miss). Superseded, retained.
- trial5 (raw/trial5/, primary): all frozen expectations met; 0
  exclusions; 4 transient flakes recovered via retry rule.
- blind (raw/blind/, 16 runs): 4/4 valid; A-menu-0 D1-D3 + A-settings-0
  D4 frozen-path breaks, functionally characterized as renames.
- Per-probe `durationMs` and run `elapsedMs` in raw JSON.
- Model spend (metered per attempt, cap $5.00, upper bound $2.40):
  A-menu-0 174,236/2,576; A-menu-1 139,448/3,098; A-settings-0
  212,871/3,583; A-settings-1 208,491/3,465 (in/out tokens, 19 calls
  total). Running total checked before each launch; never near cap.
  Scripted probes/review/oracles: $0. No credentials used or missing.

## Dependencies added for the pilot

- `eval/followup/external-app/package.json`: playwright 1.63.0;
  devDeps tsx 4.19.2, typescript 5.9.3, vitest 3.2.4,
  @types/node 22.10.5 (all same pins as `packages/runner`).
- No weight downloads, no browser downloads, no external services.

## Core-integration phase (adaptation ledger, 2026-11-02 ~23:30–24:00 EST)

Target-specific adapter authoring cost (the "what does onboarding cost"
question extends to core integration, not just probing):

- New files, all under `eval/followup/external-app/`: `src/coreProbe.ts`
  (~600 lines: instrumented mirror of `src/probe.ts` — same selectors,
  waits, settles, oracle predicates — plus real-coordinate actions, real
  screenshots, live per-step oracle reads, core Trace assembly),
  `src/coreRun.ts` / `src/coreBlind.ts` (frozen proxy/port/retry/topology
  reused from `src/run.ts` / `src/blind.ts`), `src/coreCompare.ts`
  (pure standalone-vs-core agreement classifier), `tests/coreTrace.test.ts`
  (11 tests), `contracts/ntfy-choice-protection.json`.
  `packages/core`: zero lines changed (verified by clean `git status`).
  Two bug fixes during the phase, both retained in code: per-attempt trace
  dirs so retried attempts no longer overwrite flake screenshots, and flake
  + attempts accounting in the blind summary.
- `package.json`: +2 scripts (`core-trial`, `core-blind`) only. No new
  dependencies, no version changes.
- Environment (own isolated instance, nothing shared touched): `docker run`
  of the pinned digest on 127.0.0.1:5280 with the frozen exempt-hosts flag
  as container `ntfy-coreint-5280`, healthy <10 s (image pre-present, no
  pull); `pnpm install` ~2 s warm; Playwright browsers reused from cache
  (zero downloads); ports 5281–5290 for overlay proxies, same mapping.
- Verification: `pnpm exec tsc -p .` clean; `pnpm exec vitest run` 31/31
  (20 pre-existing + 11 new); tap-parity gate passed (baseline 6/6/6/4
  reproduced exactly before scoring anything); two screenshots
  eyes-checked as real ntfy UI (menu-open mute state; topic-row state).
- Runs: researcher 28 traces / 110 s; blind run 1, 20 traces (superseded
  for flake-shot provenance, verdicts retained); blind run 2, 20 traces /
  173 s (canonical); 3 exploratory A-menu-1 D2 reps + 1 time-series +
  1 functional click-check to /tmp (diagnostics only, never committed).
- Model/API spend for the phase: $0 (scripted only; no participant,
  probe, judge, or coordinator experimental calls). No credentials used.
- Frictions: one import-depth fix (`../../../../packages/core`); tsx CJS
  handling for /tmp scratch (moved diagnostics in-package, deleted after);
  one misread of attempts accounting from grep-filtered multiline output,
  resolved by full logging in run 2 (no code defect).
