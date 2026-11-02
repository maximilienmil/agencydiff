#!/usr/bin/env bash
# Optional voiceover: macOS `say` is a free, local TTS voice, so the draft can
# ship with narration without any paid API. Output lands next to the script
# source; the composition stays silent unless you mux it in, e.g.:
#   ffmpeg -i media/agencydiff-demo-draft.mp4 -i video/voiceover.aiff -c copy -shortest out.mp4
set -euo pipefail
cd "$(dirname "$0")/.."
sed -n 's/^> //p' voiceover.md > /tmp/agencydiff-voiceover.txt
say -v Samantha -r 175 -o voiceover.aiff "$(cat /tmp/agencydiff-voiceover.txt)"
echo "wrote video/voiceover.aiff"
