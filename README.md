# AgencyDiff

**Regression tests for human choice.**

AgencyDiff turns a product promise into executable user-intent tests. It runs the same intention against a baseline and a candidate build, and reports whether the change made that intention harder, less visible, more asymmetric, or impossible. Every number comes from recorded traces, not from a model's opinion.

```
product promise → Agency Contract → opposing intents → matched probes (baseline vs candidate)
                → traces + oracle-verified final state → deterministic diff → evidence-backed check
```

The agents are standardized probes, not simulated humans. AgencyDiff measures the interface, not predicted human behaviour.

## Layout

| Path | What |
|---|---|
| `packages/core` | Data model, per-trace metrics, deterministic diff engine |
| `packages/runner` | Playwright environment, scripted reference driver, Muse computer-use driver, CLI |
| `packages/cli` | Publishable `agencydiff` package: init/diff/audit/bench/mcp over the same engine |
| `apps/circle` | Controlled social app; agency regressions are named seeds (`src/seeds.ts`) |
| `contracts/` | Agency Contracts (decision, intents, oracles, accept/reject pairs) |
| `eval/` | Reference paths and ground truth for the seeded benchmark |

## Run

```bash
pnpm install
pnpm circle            # serves Circle on :5173 (?variant=baseline|candidate, ?seeds=A,B)
pnpm diff --driver scripted                       # reference paths, no model
MODEL_API_KEY=... pnpm diff --driver muse --repeats 3   # Muse Spark computer use
```

Exit code is non-zero when the contract fails, so the same command works as a CI gate.

## Use it

Three entry points over the one engine — see [docs/usage.md](docs/usage.md):

- **npm CLI** (`packages/cli`, published as `agencydiff`): `init`, `diff`, `audit`, `bench`, `mcp` (`propose-fix` is coming soon). `npx agencydiff diff --baseline <url> --candidate <url> --contract <file>` works from any directory.
- **GitHub Action** (`action.yml`): diff a production URL against a preview-deploy URL on every PR; see [docs/github-action.md](docs/github-action.md).
- **MCP server** (`agencydiff mcp` over stdio): `agencydiff_check`, `agencydiff_init`, `agencydiff_explain`, so coding agents self-check before opening a PR; see [docs/mcp.md](docs/mcp.md).

## Measurement

- **Success** is checked against the app's final state (oracle), never the agent's claim.
- **Action count**: effortful actions (click, type, keypress, scroll, drag), median over successful runs.
- **Navigation depth**: distinct screens entered.
- **Initial visibility**: whether the control that fulfils the intent is on the first screen, unobscured.
- **Default**: the decision's state before the user chooses.
- **Asymmetry**: reject-side cost ÷ accept-side cost, per variant.
