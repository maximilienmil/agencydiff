# Circle (native Android test app, T15b)

The smallest native app that reproduces Circle's location-permission and
Circle+ decline flows for mobile Probes. Plain Java + Views, no Gradle: the
APK builds with aapt2 + javac + d8 so setup stays inside the ticket's
download budget.

## Build and install

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export PATH=$JAVA_HOME/bin:$HOME/Library/Android/sdk/platform-tools:$PATH
./build.sh   # -> out/app-signed.apk (16 KB)
adb -s emulator-5554 install -r out/app-signed.apk
```

`build.sh` generates a throwaway debug key on first run. `out/` and the key
are regenerable and stay out of version control.

## How it works

- `LocationActivity` (precise_location) and `SubActivity` (subscription)
  are launched directly per decision. `variant` (`baseline`|`candidate`)
  and `fixture` (`location-shared`, `prompt-answered`, `subscribed`,
  `cancelled`) arrive as launch extras; baselines show Decline next to
  Allow/Subscribe, candidates hide it behind More options (mirroring the
  web `LOC_HIDE_DECLINE` / `SUB_HIDE_DECLINE` seeds).
- Decision controls expose the `data-agency` tags as content-descriptions
  (`location.allow`, `sub.decline`, …) for `MobileEnv.observe()`.
- `StateServer` serves oracle state as JSON on loopback :8081; the runner
  forwards it (`adb forward tcp:8081 tcp:8081`) and reads it in
  `MobileEnv.state()`. Every mutation also logs a `CIRCLE_STATE` line.

## Manual smoke test

```bash
adb -s emulator-5554 shell am start -n com.circle/.LocationActivity --es variant candidate
adb -s emulator-5554 forward tcp:8081 tcp:8081
curl -s http://127.0.0.1:8081/
```
