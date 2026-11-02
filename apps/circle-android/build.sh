#!/bin/bash
# Build the native Circle test app without Gradle: aapt2 + javac + d8.
# Keeps the setup inside the ticket's download budget (no Gradle caches).
set -euo pipefail

SDK="${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}"
BT="$SDK/build-tools/34.0.0"
JH="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17}"
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/out"

rm -rf "$OUT"
mkdir -p "$OUT/classes"

"$BT/aapt2" link -o "$OUT/app-base.apk" \
  --manifest "$HERE/AndroidManifest.xml" \
  -I "$SDK/platforms/android-34/android.jar" \
  --min-sdk-version 26 --target-sdk-version 34

"$JH/bin/javac" --release 8 \
  -cp "$SDK/platforms/android-34/android.jar" \
  -d "$OUT/classes" \
  $(find "$HERE/src" -name "*.java")

"$BT/d8" --lib "$SDK/platforms/android-34/android.jar" \
  --output "$OUT" \
  $(find "$OUT/classes" -name "*.class")

(cd "$OUT" && zip -uj app-base.apk classes.dex >/dev/null)

if [ ! -f "$HERE/debug.keystore" ]; then
  "$JH/bin/keytool" -genkeypair -keystore "$HERE/debug.keystore" \
    -alias androiddebugkey -storepass android -keypass android \
    -keyalg RSA -validity 10950 -dname "CN=Android Debug" >/dev/null 2>&1
fi

"$BT/zipalign" -f 4 "$OUT/app-base.apk" "$OUT/app.apk"
"$BT/apksigner" sign --ks "$HERE/debug.keystore" \
  --ks-pass pass:android --key-pass pass:android --out "$OUT/app-signed.apk" "$OUT/app.apk" >/dev/null

echo "built $OUT/app-signed.apk"
ls -la "$OUT/app-signed.apk"
