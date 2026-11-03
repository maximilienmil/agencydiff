# README images

Generated with Playwright from the running apps; regenerate after a design change.

```bash
pnpm circle &                                          # Circle on :5173
pnpm --filter @agencydiff/report dev &                 # report on :5174
# A real gate comment: scripted driver, seeded SUB_HIDE_DECLINE candidate.
pnpm diff --driver scripted --contract contracts/subscription.json \
  --baseline "http://localhost:5173/?variant=baseline" \
  --candidate "http://localhost:5173/?seeds=SUB_HIDE_DECLINE" \
  --scripted-from baseline --out runs/readme-comment --no-export
pnpm --filter @agencydiff/runner exec tsx ../../scripts/readme-images.ts ../../runs/readme-comment/comment.md
```

- `hero.png` (1600x900): Circle's location prompt on the baseline and on the
  `LOC_HIDE_DECLINE` candidate, with the Finding read from
  `apps/report/public/data/precise_location/report.json`.
- `replay.png`: the report's Replay view on that Intent, mid-playback.
- `pr-comment.png`: the `comment.md` above, rendered as a PR comment.
