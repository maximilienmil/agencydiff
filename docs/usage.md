# Use it

Three entry points, one engine: the CLI ships the product, the GitHub Action
runs it in CI, and the MCP server lets coding agents self-check before they
open a PR.

## CLI

```bash
npm install -g agencydiff
npx playwright install chromium

agencydiff init --url https://shop.example.com/settings
agencydiff diff --baseline https://shop.example.com/ --candidate https://preview-41.example.com/ --contract ./contracts/settings.json
agencydiff audit --url https://shop.example.com/ --contract ./contracts/settings.json --driver muse
agencydiff bench --base http://localhost:5173 --driver scripted
agencydiff mcp
```

`--contract` takes a file, a bundled Circle decision (`precise_location`,
`teen_dm`, `screen_time`, `subscription`), or inline JSON. `agencydiff.config.json`
holds the same defaults (`targets`, `contracts`, `driver`, `repeats`).
`diff` exits non-zero when a contract fails, so it doubles as a CI gate.
`MODEL_API_KEY` is required for `--driver muse`. Not published to npm yet —
see `packages/cli/README.md` for the `npm pack` verification.

## GitHub Action

```yaml
- uses: maximilienmil/agencydiff@v1
  with:
    baseline-url: https://shop.example.com/
    candidate-url: https://preview-${{ github.event.number }}.example.com/
    contracts: contracts/checkout.json
```

Posts the findings table on the PR and fails the check on regressions. Full
inputs, Vercel/Netlify examples, and the relation to
`scripts/ci-agencydiff.sh` are in `docs/github-action.md`.

## MCP server

```json
{ "mcpServers": { "agencydiff": { "command": "agencydiff", "args": ["mcp"] } } }
```

Tools: `agencydiff_check` (URLs + contract → findings + report path),
`agencydiff_init` (URL → draft config + contract),
`agencydiff_explain` (finding id → evidence traces). Client setup for Muse
Code and Claude Code, plus the agent self-check loop, are in `docs/mcp.md`.
