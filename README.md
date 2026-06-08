# Gwenda web

Marketing site for [Gwenda](https://gwenda.co.uk) — Astro on Cloudflare Pages.

## Deployments

| Environment | Site | Trigger | GitHub |
|---|---|---|---|
| **Staging** | [gwenda-staging.pages.dev](https://gwenda-staging.pages.dev) | Push to `main` | [Deployments](https://github.com/gwenda-hackney/web/deployments/activity_log?environment=staging) |
| **Production** | [gwenda.co.uk](https://gwenda.co.uk) | Manual workflow | [Deployments](https://github.com/gwenda-hackney/web/deployments/activity_log?environment=production) |

![Staging deployment](https://img.shields.io/github/deployments/gwenda-hackney/web/staging?label=staging)
![Production deployment](https://img.shields.io/github/deployments/gwenda-hackney/web/production?label=production)

All deployment history: [github.com/gwenda-hackney/web/deployments](https://github.com/gwenda-hackney/web/deployments)

### Deploy production

Actions → **Deploy production** → Run workflow (uses the current branch/ref).

## Versioning

Builds use **CalVer** — `YYYY.MM.DD+shortsha` (UTC date + git commit), e.g. `2026.06.08+abc1234`. No manual version bumps.

Check what's live (not exposed in the UI):

```bash
curl -sI https://gwenda.co.uk | grep -i x-gwenda
```

Response headers: `X-Gwenda-Version`, `X-Gwenda-Build-Sha`. On staging, hover the corner ribbon for a quick internal check.

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
