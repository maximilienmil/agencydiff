# agencydiff

Intent regression testing for UX. Run the same user intent on a baseline and a
candidate build, and get a deterministic diff of what changed: action cost,
navigation depth, first-screen visibility, defaults, success, and the cost of
saying no vs saying yes. Success is decided by an **Oracle** on the final app
state, never by the agent's claim.

## Install

Requires Node 22+. The scripted driver needs Playwright browsers once:

```bash
npm install -g agencydiff
npx playwright install chromium
```

## Quick start

```bash
# Scaffold a config + starter contract for any page
agencydiff init --url https://example.com/settings

# Diff two builds with the offline scripted driver
agencydiff diff --baseline https://prod.example.com/ --candidate https://preview-123.example.com/ --contract ./contracts/settings.json

# Single-variant audit (cost + asymmetry only, no baseline)
agencydiff audit --url https://example.com/settings --contract ./contracts/settings.json --driver muse

# Seeded Circle benchmark (needs a local Circle on --base)
agencydiff bench --base http://localhost:5173 --driver scripted

# MCP server for coding agents (stdio)
agencydiff mcp
```

`agencydiff diff` exits non-zero when the contract fails, so the same command
works as a CI gate. `MODEL_API_KEY` must be set for `--driver muse`.

## Config file

`agencydiff.config.json` (found by walking up from the cwd):

```json
{
  "targets": { "baseline": "https://prod.example.com/", "candidate": "https://preview.example.com/" },
  "contracts": ["./contracts/settings.json"],
  "driver": "scripted",
  "repeats": 1
}
```

Explicit flags override the config. `--contract` also accepts a bundled Circle
decision name (`precise_location`, `teen_dm`, `screen_time`, `subscription`).

## MCP tools

When served over stdio (`agencydiff mcp`):

- `agencydiff_check` — baseline/candidate URLs + contract → findings summary + report path
- `agencydiff_init` — a URL → draft config + contract in the server cwd
- `agencydiff_explain` — a finding id → the finding plus its evidence traces

See `docs/mcp.md` in the AgencyDiff repo for client config snippets.
