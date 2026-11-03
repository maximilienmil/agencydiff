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

## Trial runs (instrumented; filled in as they run)

- Researcher-seeded variants (scripted, $0 model cost): see `raw/`.
- Blind coding attempts (metered `muse exec`, low effort): see `raw/`.
- Per-probe `durationMs` and run `elapsedMs` recorded in raw JSON.
- Cumulative experimental model spend tracked before each new model call
  (cap $5.00, stop launching at $4.00 running total).

## Dependencies added for the pilot

- `eval/followup/external-app/package.json`: playwright 1.63.0;
  devDeps tsx 4.19.2, typescript 5.9.3, vitest 3.2.4,
  @types/node 22.10.5 (all same pins as `packages/runner`).
- No weight downloads, no browser downloads, no external services.
