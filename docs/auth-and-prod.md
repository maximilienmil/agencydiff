# Authenticated flows and production-safe monitoring

Ticket 16. Probes can start logged in, and `--prod-safe` runs probe a live
production app with a dedicated synthetic test account, restore each probe,
and verify the restore. All numbers below come from the scripted driver
against Circle on `localhost` (offline, deterministic); the Muse-driver path
reuses the same guards and prompts but was not re-run here (model spend).

## Login

A target declares auth in its config file:

```json
"auth": {
  "storageState": "../.auth/circle.json",
  "usernameEnv": "CIRCLE_TEST_USER",
  "passwordEnv": "CIRCLE_TEST_PASS"
}
```

Two ways to start authenticated:

1. `pnpm auth-login --target targets/circle-auth.json` opens a headed browser.
   Log in once as a human, press Enter, and the session (cookies,
   localStorage) is saved to the Playwright storageState file. Probes load
   that file into a fresh browser context, so every probe starts from the
   same logged-in state.
2. Scripted test-account login: `pnpm auth-login --target <file> --headless`
   fills the login form from `usernameEnv`/`passwordEnv` with Playwright
   and saves the session. Test accounts only — never a personal account.

Session files hold live credentials: they live under `.auth/` (gitignored,
and `login` drops a `*` `.gitignore` in the directory) and are never
committed, like `.env`.

### Credentials never reach the model

- The storageState file is loaded by Playwright into the browser context;
  the driver never sees it.
- Scripted credentials are filled by Playwright (`fillLoginFromEnv`), never
  placed in a prompt. The driver prompt carries only the intent goal.
- Every screenshot is taken with password fields covered by opaque overlays
  (`maskSecrets`), removed right after the shot; field values are untouched.
  Passwords therefore reach neither screenshot files nor the model.

### Demo: Circle login gate (k=3)

Circle shows a fake sign-in screen behind `?auth=1`. The gate accepts the
documented test user `test-user` with any non-empty password and rejects
everything else; it is a demo, not a credential check (see limits).
`targets/circle-auth.json` points at it.

`src/authProdDemo.ts` logs in once headlessly, saves the session, then runs
three authenticated `share` probes from it:

| Repeat | Initial screen | Oracle | Steps |
| --- | --- | --- | --- |
| 0 | home+location_prompt | pass | 1 |
| 1 | home+location_prompt | pass | 1 |
| 2 | home+location_prompt | pass | 1 |

A fourth probe with no session starts on the `login` screen and records an
error trace (`reference tag not found: location.allow`): the gate holds, and
the failure is recorded, not silent.

## Production-safe mode (`--prod-safe`)

For real production with a dedicated synthetic test account:

```bash
pnpm diff --target targets/circle-auth.json --prod-safe [...]
pnpm run audit --target targets/circle-auth.json --prod-safe --driver muse
```

Each contract carries the allow-list of instrumented controls a probe may
touch (`contracts/location.json` → `prodSafe.allowedTags`). Enforcement, at
the Playwright layer:

- Purchases, deletion/removal, messaging/sending, and subscription
  cancellation stay blocked **even when allow-listed**.
- Form submits and credential entry stay blocked (the audit rules hold
  underneath); site search stays allowed.
- Clicks and typing on any other instrumented (`data-agency`) control
  outside the allow-list are refused before they touch the page, failing
  closed when the contract declares no allow-list.
- The agent prompt carries the same rules in prose, so Muse stops with
  `INFEASIBLE` instead of working around the guard.

After each probe a restore step re-navigates to the starting fixture URL
and compares app state against the pre-probe snapshot; the trace records
`restore: { verified: true }` or the residue keys. A failed restore is a
recorded failure, not a silent pass.

### Demo: probe → restore on Circle (k=3)

Three `revoke` probes under `--prod-safe`, each followed by a verified restore:

| Repeat | Oracle | Restore verified | Steps |
| --- | --- | --- | --- |
| 0 | pass | true | 3 |
| 1 | pass | true | 3 |
| 2 | pass | true | 3 |

A probe whose scripted path touches `settings.subscription` (outside the
location allow-list) is refused at the Playwright layer — `prod-safe:
refusing click at 215,364 (settings.subscription)` — and recorded as an
error trace. The CLI path (`pnpm diff --prod-safe`) was exercised the same
way: baseline passed with `restore.verified`, and the candidate's seeded
path was refused at the first non-allow-listed tag.

## Threat model

| What could go wrong | How it is prevented |
| --- | --- |
| Probe buys, cancels, deletes, or messages something real | Playwright-layer refusal of purchase/deletion/messaging/submit/credential actions, even when allow-listed; agent instructions repeat the ban |
| Destructive action hides behind an allowed control | Allow-list is per-contract and explicit; anything not listed is refused; the residual risk is a control whose label hides its effect (see limits) |
| Probe leaves the test account dirty, polluting the next run | Post-probe restore re-navigates to the fixture and verifies state equality; residue fails the trace |
| Session file leaks into git | `.auth/` is gitignored at repo root plus per-directory `*` ignore written by `login` |
| Secret leaks into a prompt, screenshot, or trace file | Credentials are filled by Playwright and never placed in prompts (tested: request bodies contain no secret); screenshots mask password fields; trace files hold app state, never env values |
| Human runs `--prod-safe` against production with their own account | `login` is for a dedicated synthetic test account; nothing technical stops a human pointing it elsewhere — process, not code (see limits) |

## Honest limits

- Circle's restore is reload: Circle is stateless, so re-navigating to the
  fixture URL deterministically restores it, and the check verifies that.
  Against a stateful backend the fixture URL must itself reset the account
  (or the restore fails loudly and says which keys differ). Per-target
  restore hooks for real backends do not exist yet.
- The Circle gate is fake: any password works for `test-user`, and the
  expected username ships in client code. Real targets use their own IdP;
  the demo proves the plumbing (session save → authenticated start), not
  resistance to credential guessing.
- The allow-list cannot see intent: a control whose label hides a
  destructive effect (e.g. "Continue" that actually purchases) is allowed
  if listed. Review allow-lists against what each control really does.
- Typing into uninstrumented fields is allowed (discovery typing, like
  audits). A free-text field with a destructive side effect on Enter would
  need its own guard.
- `--headless` login was exercised against Circle only. The headed
  human-login path needs a display and was not run here.
- Muse-driver probes under `--prod-safe` reuse these guards, but the k=3
  runs above used the scripted driver. Model behavior (stopping with
  `INFEASIBLE` at a refusal) is covered by prompt text, not by a run here.
