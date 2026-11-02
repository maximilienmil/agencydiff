#!/usr/bin/env bash
# Voiceover: macOS `say` is a free, local TTS voice (Samantha), so the film
# ships with narration and no paid API. One AIFF per scene, played by the
# composition under its own scene (`src/footage.ts` maps public/vo/*.aiff).
# Usage: npm run tts — then check durations with:
#   for f in public/vo/*.aiff; do echo "$f $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")"; done
# Each line must fit its scene slot (cold 12, problem 18, experiment 40, how
# 35, generalize 35, built 30, close 10 seconds); trim words if one overruns.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p public/vo

say_scene() {
  local name="$1" text="$2"
  say -v Samantha -r 175 -o "public/vo/${name}.aiff" "$text"
  # Remotion's bundled ffprobe cannot parse `say` AIFFs, so ship WAV too.
  ffmpeg -y -v error -i "public/vo/${name}.aiff" -ac 1 -ar 44100 -c:a pcm_s16le "public/vo/${name}.wav"
  local dur
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "public/vo/${name}.wav")
  echo "vo/${name}.wav ${dur}s"
}

say_scene cold "Two probes try one intent — I do not want strangers messaging me — on two builds. The left probe reaches the choice. The right one gets lost, and the Agency Diff records a finding."

say_scene problem "Coding agents ship interface changes every day. Nobody re-checks whether people can still do what they came to do — decline, restrict, cancel, delete. AgencyDiff turns those choices into executable tests."

say_scene experiment "We gave a coding agent one ordinary task: simplify onboarding, fewer screens before the feed. Its diff never opens the first-run prompt, so decline leaves the first screen. The AgencyDiff check fails: decline takes seven actions instead of one, and is no longer visible. The same task goes back with the check in the loop. The gated agent keeps the prompt and the decline control. Gate pass, zero findings. Across thirty ordinary pull requests per side: without the check, eight broke saying no. With it, zero."

say_scene how "A contract names the decisions, the intents, and the oracles. Probes run each intent on both builds. The oracle checks the final app state — the agent's own claim never counts. The diff is deterministic: same traces, same findings. Screenshot review catches one in twenty. The replay gate catches nineteen, with zero false alarms, for zero dollars. SAM grounds every control for the evidence overlay, and propose fix turns a failing report into a verified patch."

say_scene generalize "One init command maps an app it has never seen — an unseen notification server yielded thirty-six controls from a twenty-two step crawl. SusBench-derived patterns: seven of ten. Native Android probes on a real emulator. A public-site audit: the REAL ID document list went from zero of three to three of three, four actions to fact. And the same engine ships as a CLI, a GitHub Action, and an MCP server inside the agent that writes the code."

say_scene built "Muse Spark runs every probe from screenshots only. SAM grounds the controls. Muse built this repository through parallel agents, one ticket at a time. None of that decides the result: the diff compares recorded traces, so the same evidence always produces the same findings."

say_scene close "AgencyDiff: regression tests for human choice."
