#!/usr/bin/env bash
# Build Circle from two git refs, serve both builds locally, and run AgencyDiff
# over every contract in targets/circle-pr.json (baseline URL = base build,
# candidate URL = head build). The scripted driver replays the BASELINE
# reference path on the candidate, so a moved control fails instead of
# silently following the new UI.
#
# Usage:
#   scripts/ci-agencydiff.sh <base-ref> <head-ref> [--out DIR]
#     [--driver scripted|muse] [--repeats N] [--report-url URL]
#     [--base-port 5181] [--candidate-port 5182]
#
# Exit code is non-zero when any contract fails, so callers can use it as a gate.
set -euo pipefail

BASE_REF="${1:?usage: ci-agencydiff.sh <base-ref> <head-ref> [flags]}"
HEAD_REF="${2:?usage: ci-agencydiff.sh <base-ref> <head-ref> [flags]}"
shift 2

OUT=""
DRIVER="scripted"
REPEATS="1"
REPORT_URL=""
BASE_PORT="5181"
CANDIDATE_PORT="5182"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --out) OUT="$2"; shift 2 ;;
    --driver) DRIVER="$2"; shift 2 ;;
    --repeats) REPEATS="$2"; shift 2 ;;
    --report-url) REPORT_URL="$2"; shift 2 ;;
    --base-port) BASE_PORT="$2"; shift 2 ;;
    --candidate-port) CANDIDATE_PORT="$2"; shift 2 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
if [[ -z "$OUT" ]]; then
  OUT="runs/ci-$(date -u +%Y%m%dT%H%M%S)-$(git rev-parse --short "$BASE_REF")-$(git rev-parse --short "$HEAD_REF")"
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/agencydiff-ci.XXXXXX")"
PIDS=()
cleanup() {
  for pid in "${PIDS[@]:-}"; do kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
  git worktree remove --force "$WORK/base" 2>/dev/null || true
  git worktree remove --force "$WORK/head" 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT

echo "base: $BASE_REF -> $WORK/base (port $BASE_PORT)"
echo "head: $HEAD_REF -> $WORK/head (port $CANDIDATE_PORT)"
git worktree add --detach "$WORK/base" "$BASE_REF" 1>&2
git worktree add --detach "$WORK/head" "$HEAD_REF" 1>&2

build_one() {
  local src="$1" dist="$2"
  (
    cd "$src"
    pnpm install --frozen-lockfile --prefer-offline 1>&2
    cd apps/circle
    # VITE_SEEDS passes through from the environment when set, so a build can
    # bake a regression in without query flags.
    pnpm exec vite build --outDir "$dist" --emptyOutDir 1>&2
  )
}
mkdir -p "$OUT"
build_one "$WORK/base" "$ROOT/$OUT/dist-base"
build_one "$WORK/head" "$ROOT/$OUT/dist-candidate"

serve() {
  python3 -m http.server "$1" --directory "$2" >/dev/null 2>&1 &
  PIDS+=($!)
  # Disowned but still killed by the EXIT trap: death notices stay out of the log.
  disown || true
}
serve "$BASE_PORT" "$ROOT/$OUT/dist-base"
serve "$CANDIDATE_PORT" "$ROOT/$OUT/dist-candidate"

for port in "$BASE_PORT" "$CANDIDATE_PORT"; do
  for _ in $(seq 1 50); do
    if curl -sf -o /dev/null "http://127.0.0.1:$port/"; then break; fi
    sleep 0.2
  done
  curl -sf -o /dev/null "http://127.0.0.1:$port/" || { echo "server on $port never came up" >&2; exit 1; }
done

ARGS=(--target targets/circle-pr.json
  --baseline "http://127.0.0.1:$BASE_PORT/"
  --candidate "http://127.0.0.1:$CANDIDATE_PORT/"
  --driver "$DRIVER" --repeats "$REPEATS"
  --scripted-from baseline --out "$OUT"
  --base-ref "$BASE_REF" --head-ref "$HEAD_REF")
if [[ -n "$REPORT_URL" ]]; then ARGS+=(--report-url "$REPORT_URL"); fi

set +e
# Direct tsx, not `pnpm diff`: the pnpm wrapper prints its own failure note
# ("undefined" + ERR block) on a failing gate and would bury the verdict.
# Gate runs must not rewrite the report app's committed sample data either.
"$ROOT/packages/runner/node_modules/.bin/tsx" "$ROOT/packages/runner/src/cli.ts" "${ARGS[@]}" --no-export
STATUS=$?
set -e

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "out=$OUT" >> "$GITHUB_OUTPUT"
  echo "status=$STATUS" >> "$GITHUB_OUTPUT"
else
  echo "out=$OUT"
fi
exit "$STATUS"
