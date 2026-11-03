#!/bin/bash
# Redesign-selectivity deterministic runner.
# Usage:
#   ./run.sh --smoke            # excluded-family plumbing check (screen_time)
#   ./run.sh --controls         # baseline-vs-baseline false-alarm floor
#   ./run.sh --cases LOC-STY    # one case
#   ./run.sh                    # full 18-case matrix (writes raw/summary.json)
#   ./run.sh --cases LOC-STY,LOC-RELOC
set -u
cd "$(dirname "$0")"
"../../packages/runner/node_modules/.bin/tsx" run.ts "$@"
