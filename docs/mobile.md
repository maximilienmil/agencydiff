# Native mobile probes (T15b, exploratory follow-up to T15)

Status: **bar reached on detection, with a metric caveat** (2026-11-02):
48 live Probes ran against a real headless Android emulator (Apple Silicon,
Hypervisor.framework, no KVM/Docker), k=3 per intent per variant, and both
seeded regressions were caught as HIGH findings on the same intents the web
benchmark flags. The caveat: the finding lands on initial visibility, not on
action cost (see below). The T15 section after the appendix is the original
feasibility write-up, kept for context.

## Environment (T15b)

- JDK: Homebrew `openjdk@17` formula (the `temurin@17` cask needs a sudo
  password, which unattended runs do not have; the formula is equivalent).
- SDK: `android-commandlinetools` cask (already present) plus, via
  `sdkmanager --sdk_root=$HOME/Library/Android/sdk`: `platform-tools`,
  `emulator`, `platforms;android-34`, one image
  `system-images;android-34;google_apis;arm64-v8a`, and `build-tools;34.0.0`
  (for the Gradle-free APK build, T15b addition to the ticket list).
- AVD `circle` (Pixel 7 profile, `swiftshader_indirect` GPU) created by
  hand-writing `~/.android/avd/circle.*` because the shipped `avdmanager`
  rejects the image path (`Package path is not valid` even with
  `ANDROID_SDK_ROOT` set). `emulator -list-avds` accepts the hand-written
  AVD; first cold boot took ~23 s.
- Boot: `emulator -avd circle -no-window -no-audio -gpu swiftshader_indirect
  -no-boot-anim`; `adb -s emulator-5554 shell getprop sys.boot_completed`
  returns `1`, `screencap -p` works (1080x2400).

Disk (ticket budget 10 GB, overrides the 5 GB explore rule):

| Point | `du -sh ~/Library/Android/sdk` | `df -h /` avail |
|---|---|---|
| before installs | 0 B | 124 Gi |
| after platform-tools + emulator + android-34 + arm64 image | 5.5 G | 117 Gi |
| after build-tools;34.0.0 | 5.7 G | 117 Gi |

Total SDK downloads ~5.7 GB, inside the 10 GB budget. No Gradle (the app
builds with aapt2 + javac + d8, see below), so no Gradle caches.

## Native target (T15b)

`apps/circle-android/`: hand-rolled Java/Views app (no Gradle, 16 KB APK),
package `com.circle`, built by `build.sh` (aapt2 link, `javac --release 8`,
d8, zipalign, apksigner with a throwaway debug key) and installed with
`adb install`.

- `LocationActivity` (precise_location) and `SubActivity` (subscription),
  reached directly per decision. Baseline shows Allow/Subscribe next to
  Decline; the candidate hides Decline behind More options, mirroring the web
  `LOC_HIDE_DECLINE` / `SUB_HIDE_DECLINE` seeds with the same copy.
- `variant` (`baseline`|`candidate`) and `fixture` (`location-shared`,
  `prompt-answered`, `subscribed`, `cancelled`) arrive as launch extras, the
  same role web query params play. `onNewIntent` + `recreate()` re-applies
  them on relaunch.
- Every decision control sets its content-description to the `data-agency`
  tag (`location.allow`, `location.decline`, `location.more`,
  `location.toggle`, `sub.subscribe`, `sub.decline`, `sub.more`,
  `sub.terms`, `sub.cancel`).
- Oracle state: `State` (SharedPreferences) served as JSON by `StateServer`
  on loopback :8081 (`{"location.precise":…,"location.prompt":…,
  "sub.active":…,"sub.offer":…,"sub.terms_viewed":…}`), forwarded with
  `adb forward tcp:8081 tcp:8081`; every mutation also logs a `CIRCLE_STATE`
  line to logcat as fallback.

## Wiring (T15b)

- `packages/runner/src/mobile.ts`: `adbRunner`, `androidActivityFor`,
  `ensureStateForward`, `launchAndroidApp` (force-stop, start with
  variant/fixture extras). `MobileEnv` itself unchanged.
- `packages/runner/src/probe.ts`: `ProbeTarget` gains `platform`
  (`web`|default, `android`), `serial`, `stateUrl`. With
  `platform: "android"` the probe forwards the state port, launches the
  decision activity at the fixture, and opens `MobileEnv`; the dom adapter is
  rejected (no DOM on device).
- `packages/runner/src/drivers.ts`: `Driver.run` takes `ProbeEnv`
  (`BrowserEnv | MobileEnv`); `ScriptedDriver` returns an error trace without
  a browser page; `MuseDriver` takes `target: "web" | "android"` for the
  system prompt (native-Android wording on device).
- `packages/runner/src/cli.ts`: `--platform android --serial emulator-5554`
  (plus `--baseline baseline --candidate candidate`: on Android the variant
  name is the launch extra, not a URL).
- Offline tests: `mobile.test.ts` 16/16 pass, covering the new launch
  helpers with a fake runner. Plumbing proven without model spend by a
  tag-tapping scratch driver through `runProbe`: 6/6 oracle PASS, baseline
  decline 1 step vs candidate 2 steps on both decisions.

## Live results (T15b)

Driver: Muse (muse-spark-1.3-contributor), k=3, state-hook oracles.
Commands (run from the repo root with platform-tools on PATH):

```
pnpm diff --contract contracts/location.json --driver muse \
  --model muse-spark-1.3-contributor --repeats 3 \
  --platform android --serial emulator-5554 \
  --baseline baseline --candidate candidate --out runs/mobile-location --no-export
pnpm diff --contract contracts/subscription.json --driver muse \
  --model muse-spark-1.3-contributor --repeats 3 \
  --platform android --serial emulator-5554 \
  --baseline baseline --candidate candidate --out runs/mobile-sub --no-export
```

The location run crashed 9/18 in on a hung oracle read
(`fetch failed: HeadersTimeoutError` in `MobileEnv.state()`); the state
reader now retries with a timeout, and the remaining candidate probes ran
with `--variants candidate` into `runs/mobile-location-cand`. Reports:
`runs/mobile-location-merged/report.json` (18 traces merged) and
`runs/mobile-sub/subscription/report.json` (30 traces).

precise_location (17/18 oracle PASS), report FAIL with 3 findings:

| Intent | Baseline success / actions | Candidate success / actions | Finding |
|---|---|---|---|
| share | 1.00 / 14 | 0.67 / 5 | [medium] succeeds less often |
| withhold | 1.00 / 10 | 1.00 / 4 | [high] option no longer on first screen |
| revoke | 1.00 / 1 | 1.00 / 1 | — |

subscription (30/30 oracle PASS), report FAIL with 1 finding:

| Intent | Baseline success / actions | Candidate success / actions | Finding |
|---|---|---|---|
| subscribe | 1.00 / 1 | 1.00 / 1 | — |
| decline | 1.00 / 25 | 1.00 / 12 | [high] option no longer on first screen |
| cancel | 1.00 / 1 | 1.00 / 1 | — |
| terms | 1.00 / 1 | 1.00 / 1 | — |
| resume | 1.00 / 1 | 1.00 / 1 | — |

Timings: median seconds per step ~15 s on location (9+9 probes), ~10 s on
subscription (30 probes). Most of that is model latency plus ~1.8 MB
screenshots per turn, not device time. One probe every ~1-8 min depending on
agent verbosity; decline probes often ran to the 20-step budget.

Screen recording: `media/mobile-probe.mp4` (gitignored, 1.5 MB, 120 s at 8
Mbps via `adb shell screenrecord`), covering live candidate probes. A first
attempt at default settings produced only 28 KB for 180 s (near-static
screen over-compresses), so it was re-recorded with an explicit bit-rate.

Direction vs web: the web ground truth (`eval/ground_truth.json`) expects an
`action_cost` regression on `precise_location.withhold` (LOC_HIDE_DECLINE)
and `subscription.decline` (SUB_HIDE_DECLINE). Mobile flags exactly those
two intents as regressions, but on initial visibility (visible -> hidden,
HIGH) rather than cost: median action counts move the wrong way (withhold
10 -> 4, decline 25 -> 12) because agent verbosity dominates. The agent
treats the phone like a desktop (Tab/Enter keypresses, repeated taps after
visibly succeeding, no DONE discipline), so baseline probes flail to the
step budget while candidate probes happen to stop earlier. The +1 seeded tap
is real — candidate decline traces show More options -> Not now — but it
drowns in +/-10 steps of agent noise. Two instrument notes for follow-ups:
the location screen exposes its settings toggle next to the prompt, and one
candidate share probe failed by flipping the toggle (precise=true) instead
of answering the prompt; and state-hook probes have no per-step early stop,
so agents keep acting after succeeding.

Bottom line: native Probes work end to end (launch, observe, tap, oracle,
diff), both seeded regressions are caught at k=3 with oracle-verified final
states, and the visibility findings match the web direction. Action-cost
comparisons need a less verbose agent (or per-step satisfaction) before they
reproduce the web direction on screens this simple.

## Appendix: original T15 write-up

Status at T15 time: **bar not reached**. No live Probe against a native app
ran on this machine. What exists is a tested adb-backed `MobileEnv` plus
this write-up of exactly what is still needed.

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
