# AgencyDiff GitHub Action

Run intent regressions on every pull request: the production deploy is the
baseline **Variant**, the preview deploy is the candidate, and the same
**Intents** are probed on both. The gate fails when the candidate makes an
intent harder, less visible, more asymmetric, or impossible.

## Use

```yaml
# .github/workflows/agencydiff.yml
name: agencydiff
on: pull_request

permissions:
  pull-requests: write

jobs:
  diff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: maximilienmil/agencydiff@v1
        with:
          baseline-url: https://shop.example.com/
          candidate-url: https://preview-${{ github.event.number }}.example.com/
          contracts: contracts/checkout.json contracts/settings.json
```

With the defaults the action posts the findings table as a PR comment and
fails the check when any contract fails.

## Inputs

| Input | Required | Default | What |
| --- | --- | --- | --- |
| `baseline-url` | yes | | Production URL (baseline Variant). |
| `candidate-url` | yes | | Preview URL (candidate Variant). |
| `contracts` | yes | | Space-separated contract files in your repo, or bundled Circle decisions. |
| `driver` | no | `scripted` | `scripted` replays recorded paths offline; `muse` drives the UI (needs `model-api-key`). |
| `repeats` | no | `1` | Probes per intent per variant. |
| `model-api-key` | no | | Meta Model API key, for `--driver muse`. Prefer `${{ secrets.MODEL_API_KEY }}`. |
| `post-comment` | no | `true` | Post the findings table on the PR. |

## Outputs

| Output | What |
| --- | --- |
| `passed` | `true` when every contract passed. |
| `comment` | The findings summary (same text as the PR comment). |

```yaml
- uses: maximilienmil/agencydiff@v1
  id: ad
  with:
    baseline-url: https://shop.example.com/
    candidate-url: ${{ steps.deploy.outputs.url }}
    contracts: contracts/checkout.json
- run: echo "passed=${{ steps.ad.outputs.passed }}"
```

## Vercel preview deploys

[Vercel's GitHub integration](https://vercel.com/docs/deployments/github-integration)
comments the preview URL on the PR. Wait for it, then diff production against
it:

```yaml
# .github/workflows/agencydiff.yml
name: agencydiff
on: pull_request

permissions:
  pull-requests: write

jobs:
  diff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: maximilienmil/agencydiff@v1
        with:
          baseline-url: https://shop.example.com/
          # vercel-action outputs the preview URL once the deploy is ready
          candidate-url: ${{ steps.vercel.outputs.preview-url }}
          contracts: contracts/checkout.json
          driver: scripted
```

## Netlify preview deploys

[Netlify's deploy previews](https://docs.netlify.com/site-deploys/deploy-previews/)
follow `https://deploy-preview-<PR#>--<site>.netlify.app`:

```yaml
# .github/workflows/agencydiff.yml
name: agencydiff
on: pull_request

permissions:
  pull-requests: write

jobs:
  diff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: maximilienmil/agencydiff@v1
        with:
          baseline-url: https://shop-example.netlify.app/
          candidate-url: https://deploy-preview-${{ github.event.number }}--shop-example.netlify.app/
          contracts: contracts/checkout.json contracts/newsletter.json
```

Keep `driver: scripted` in CI and let the Muse driver run on demand: the
scripted check replays the baseline's recorded path on the candidate, so a
moved control fails fast instead of silently following the new UI.

## Relation to scripts/ci-agencydiff.sh

`scripts/ci-agencydiff.sh` covers the same gate for the AgencyDiff repo
itself: it builds Circle from two git refs, serves both locally, and runs the
same diff invocation the action runs against two URLs. External repos only
need the action.
