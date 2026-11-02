# Native mobile probes (T15, exploratory)

Status: **bar not reached**. No live Probe against a native app ran on this
machine. What exists is a tested adb-backed `MobileEnv` plus this write-up of
exactly what is still needed.

## Bar

Baseline vs one seeded candidate, k=3, with findings matching the web
version's direction, reported with success rate, actions and time per step.

## Result

| Measure | Value |
|---|---|
| Live mobile Probes | 0 |
| Successful live Probes | 0 |
| Baseline-vs-candidate Findings | none (no runs) |
| `MobileEnv` unit tests (offline, no device) | 13/13 pass |

The k=3 comparison did not run because no emulator or simulator can run here
within the ticket's budget (~1h setup, <5GB downloads). Evidence dated
2026-11-02:

- `xcrun simctl list devices` fails: `unable to find utility "simctl"`. Only
  the command line tools are installed (`/Library/Developer/CommandLineTools`,
  26.6); there is no Xcode.app in /Applications and no
  `~/Library/Developer/CoreSimulator`. `xcodebuild` refuses to run without
  Xcode. A full Xcode download is well over the 5GB limit before any simulator
  runtime.
- No Android tooling: no Java runtime, no `ANDROID_HOME`/`ANDROID_SDK_ROOT`,
  no `adb`, no emulator, no `sdkmanager`/`avdmanager`.
- Docker exists (29.8.2 via OrbStack, ~123GB disk free) but running the
  Android emulator inside a macOS-hosted container has no KVM path, and the
  emulator + system image + JDK + a from-scratch native build of Circle does
  not fit a one-hour budget.
- No native Circle build exists yet: `apps/circle` is a web app. The native
  target (minimal native or React Native/Expo build of the location and
  subscription flows) still has to be written.

## What was built

`packages/runner/src/mobile.ts`: `MobileEnv`, an adb-backed environment that
mirrors the observable surface of `BrowserEnv` (`open`, `close`,
`screenshot`, `observe`, `state`, `execute`). Every adb call goes through an
injectable runner; `packages/runner/src/mobile.test.ts` covers the mapping
and parsers offline.

Method parity with `BrowserEnv`:

| BrowserEnv | MobileEnv | Note |
|---|---|---|
| `screenshot` (Playwright) | `adb exec-out screencap -p`, numbered files | same shape |
| tags via `[data-agency]` + topmost check | content-desc, else resource-id, from `uiautomator dump` | no occlusion info in the dump; `inViewport` means the box intersects the screen |
| `screen` via `[data-screen]` | top activity from `dumpsys activity`, shortened (`LocationActivity` -> `location`) | needs activity-per-screen convention in the app |
| `state()` via `window.__circle` | GET on a configurable local state URL (`adb forward` it) | `undefined` when unconfigured, same as black-box web targets |
| `execute` (mouse/keyboard) | `input tap`, `swipe`, `text`, `keyevent`, sleep | `move` is a no-op (no hover); key chords collapse to sequential keyevents; unknown keys default to Enter |
| audit refusal guards | none: `openAudit()` throws | accessibility-tree refusal guard is future work |

`MuseDriver` only calls `execute` and `observe`, so it works against
`MobileEnv` unchanged. `ScriptedDriver` reaches into `env.page`, which has no
mobile equivalent, so scripted reference paths stay web-only. Wiring
`MobileEnv` into `probe.ts` needs a one-line type widening once a device
exists to verify against; that change is deliberately left out until then.

## Native target contract (for whoever builds it)

- Every decision-relevant control sets its accessibility label to the
  `data-agency` tag (e.g. `location.toggle`); resource-id suffixes are
  accepted as fallback.
- One screen = one activity (or unique window label) so `screen` is stable.
- The app serves oracle state as JSON on a loopback endpoint (e.g.
  `GET /state` -> `{"location.precise": false, ...}`); the runner forwards it
  with `adb forward tcp:PORT tcp:PORT`. Fixtures (`location-shared`,
  `subscribed`, ...) must be settable the same way the web app does via query
  params, e.g. a launch extra or deep link.

## What a capable machine needs

Android path (cheaper): JDK 17, Android cmdline-tools + platform-tools +
emulator + one ARM64 system image, an AVD, `adb forward` for the state
endpoint, and the native Circle build installed. Roughly 3-4GB of downloads
and a working hardware-accelerated emulator.

iOS path: full Xcode + one simulator runtime, `xcrun simctl io booted
screenshot` for frames. Taps need an extra driver (idb or WebDriverAgent);
`simctl` alone cannot synthesize taps.

Then: install the baseline and candidate builds, run each Intent k=3 through
`MuseDriver` + `MobileEnv`, and compare the direction of the Findings against
the web diff in `eval/RESULTS.md`.
