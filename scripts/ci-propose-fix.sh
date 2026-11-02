#!/usr/bin/env bash
# Opt-in self-heal for the AgencyDiff gate. Captures the failing scripted
# report for a PR, asks Muse for a minimal restoring patch, verifies it in a
# temp worktree (scripted full contract + muse k=3 on the failing intents),
# and posts the result as a PR review whose per-hunk comments carry
# ```suggestion blocks. Never pushes or applies anything to the PR branch.
#
# Required env: BASE_SHA, HEAD_SHA, PR_NUMBER, REPO (owner/name).
# MODEL_API_KEY must be in the environment for the model calls.
set -uo pipefail

: "${BASE_SHA:?BASE_SHA is required}"
: "${HEAD_SHA:?HEAD_SHA is required}"
: "${PR_NUMBER:?PR_NUMBER is required}"
: "${REPO:?REPO is required}"

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
OUT="runs/ci-fix-${PR_NUMBER}-${GITHUB_RUN_ID:-local}"

scripts/ci-agencydiff.sh "$BASE_SHA" "$HEAD_SHA" --out "$OUT" --driver scripted || true

if pnpm run propose-fix --report "$OUT" --base "$BASE_SHA" --head "$HEAD_SHA"; then
  VERDICT="verified green"
else
  VERDICT="did not verify green"
fi

if [[ ! -f "$OUT/fix.patch" ]]; then
  echo "no fix.patch produced; nothing to post"
  exit 0
fi

python3 - "$OUT" "$HEAD_SHA" "$VERDICT" <<'EOF' >"$OUT/review.json"
import json, sys

out, head, verdict = sys.argv[1], sys.argv[2], sys.argv[3]
with open(f"{out}/fix.md") as f:
    summary = f.read()
with open(f"{out}/fix.patch") as f:
    patch = f.read()
try:
    with open(f"{out}/suggest.json") as f:
        comments = json.load(f)
except FileNotFoundError:
    comments = []

body = (
    f"## AgencyDiff propose-fix ({verdict})\n\n"
    f"{summary}\n"
    f"<details><summary>Full patch</summary>\n\n```diff\n{patch}\n```\n\n</details>\n"
)
payload = {"commit_id": head, "body": body[:64000], "event": "COMMENT", "comments": comments}
print(json.dumps(payload))
EOF

GH_TOKEN="${GH_TOKEN:?GH_TOKEN is required}" gh api "repos/${REPO}/pulls/${PR_NUMBER}/reviews" --input "$OUT/review.json" >/dev/null
echo "posted propose-fix review on PR #${PR_NUMBER}"
