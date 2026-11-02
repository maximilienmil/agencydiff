# AgencyDiff MCP server

Coding agents call AgencyDiff before opening a PR to self-check UX regressions
and fix them. The server runs over stdio — `agencydiff mcp` — and exposes three
tools over the one engine as the CLI:

| Tool | Input | Output |
| --- | --- | --- |
| `agencydiff_check` | baseline/candidate URLs + contract | Findings summary + report path |
| `agencydiff_init` | a URL | Draft `agencydiff.config.json` + starter contract |
| `agencydiff_explain` | a finding id (+ optional report dir) | The finding plus its evidence traces |

`contract` accepts a contract file path, a bundled Circle decision name
(`precise_location`, `teen_dm`, `screen_time`, `subscription`), or inline
contract JSON. `driver` is `scripted` (offline reference-path replay) or
`muse` (computer use, needs `MODEL_API_KEY` in the server's environment).
`agencydiff_explain` defaults to the last check run in that server session.

## Muse Code

```json
{
  "mcpServers": {
    "agencydiff": {
      "command": "agencydiff",
      "args": ["mcp"],
      "env": { "MODEL_API_KEY": "${MODEL_API_KEY}" }
    }
  }
}
```

With a local checkout instead of the installed package:

```json
{
  "mcpServers": {
    "agencydiff": {
      "command": "node",
      "args": ["/path/to/agencydiff/packages/cli/dist/cli.js", "mcp"]
    }
  }
}
```

## Claude Code

```bash
claude mcp add agencydiff -- agencydiff mcp
```

or in `.mcp.json`:

```json
{
  "mcpServers": {
    "agencydiff": {
      "command": "agencydiff",
      "args": ["mcp"],
      "env": { "MODEL_API_KEY": "${MODEL_API_KEY}" }
    }
  }
}
```

## Suggested agent loop

1. `agencydiff_check` with the production URL as baseline and the preview URL
   as candidate, `driver: scripted` first (free, offline).
2. For each finding, `agencydiff_explain` to see which traces substantiate it.
3. Fix the UI, re-run `agencydiff_check` until it passes.
4. If the scripted path itself broke (a control moved), re-run with
   `driver: muse` so the probe searches for the new path and measures its
   real cost.

## Verifying the server

With Circle serving on `:5191` (any port works via env):

```bash
pnpm --filter agencydiff build
AGENCYDIFF_BASE="http://127.0.0.1:5191/?variant=baseline" \
AGENCYDIFF_CANDIDATE="http://127.0.0.1:5191/?variant=candidate" \
pnpm --filter agencydiff e2e:mcp
```

The script uses the official `@modelcontextprotocol/sdk` client: it lists the
tools, runs `agencydiff_check` on Circle baseline vs candidate (expects FAIL
with findings), resolves the first finding with `agencydiff_explain`, and
scaffolds into a temp dir with `agencydiff_init`.
