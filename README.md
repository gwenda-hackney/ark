# Gwenda web

Marketing site for [Gwenda](https://gwenda.co.uk) — Astro on Cloudflare Pages.

## Deployments

| Environment | Site | Branch | Trigger | GitHub |
|---|---|---|---|---|
| **Staging** | [gwenda-staging.pages.dev](https://gwenda-staging.pages.dev) | `main` | Push to `main` | [Deployments](https://github.com/gwenda-hackney/web/deployments/activity_log?environment=staging) |
| **Production** | [gwenda.co.uk](https://gwenda.co.uk) | `release` | Push to `release` | [Deployments](https://github.com/gwenda-hackney/web/deployments/activity_log?environment=production) |

![Staging deployment](https://img.shields.io/github/deployments/gwenda-hackney/web/staging?label=staging)
![Production deployment](https://img.shields.io/github/deployments/gwenda-hackney/web/production?label=production)

All deployment history: [github.com/gwenda-hackney/web/deployments](https://github.com/gwenda-hackney/web/deployments)

### Branch flow

GitLab Flow with a long-running `release` branch:

1. **Develop on `main`** — merges auto-deploy to staging.
2. **Release to production** — merge `main` into `release` and push:

```bash
git checkout release
git merge main
git push origin release
```

3. **CI tags the release** — each production deploy creates a CalVer tag (`YYYY.MM.DD+shortsha`).

First-time setup: create `release` from current `main`:

```bash
git checkout main
git pull
git checkout -b release
git push -u origin release
```

## Versioning

Builds use **CalVer** — `YYYY.MM.DD+shortsha` (UTC date + git commit), e.g. `2026.06.08+abc1234`. No manual version bumps.

Each **production** deploy (push to `release`) creates an annotated git tag with that label. Tags: [github.com/gwenda-hackney/web/tags](https://github.com/gwenda-hackney/web/tags). Re-deploying the same commit skips tagging if the tag already exists.

Check what's live (not exposed in the UI):

```bash
curl -sI https://gwenda.co.uk | grep -i x-gwenda
```

Response headers: `X-Gwenda-Version`, `X-Gwenda-Build-Sha`. On staging, hover the corner ribbon for a quick internal check.

## Opening countdown

The hero countdown reads `PUBLIC_OPENING_DATE` (`YYYY-MM-DD`) at build time. The date is not shown in the UI — only the counter updates.

Change it via GitHub repository variable `PUBLIC_OPENING_DATE`, then redeploy. Default: `2026-07-04`. Local: set in `.env`.

## Local development

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env` for local staging behaviour (password gate, ribbon).

Simulate a CI build with version metadata:

```bash
PUBLIC_BUILD_SHA=$(git rev-parse HEAD) \
PUBLIC_BUILD_REF=$(git branch --show-current) \
PUBLIC_BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
PUBLIC_BUILD_VERSION=$(node scripts/compute-build-version.mjs --export) \
npm run build
```
