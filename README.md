# Gwenda web

Marketing site for [Gwenda](https://gwenda.co.uk) — Astro on Cloudflare Pages with Pages Functions for the password gate and subscribe API.

## Sites

| Environment    | URL                                                                                                  | Branch    | Trigger           |
| -------------- | ---------------------------------------------------------------------------------------------------- | --------- | ----------------- |
| **Staging**    | [staging.gwenda.co.uk](https://staging.gwenda.co.uk) ([pages.dev](https://gwenda-staging.pages.dev)) | `main`    | Push to `main`    |
| **Production** | [gwenda.co.uk](https://gwenda.co.uk)                                                                 | `release` | Push to `release` |

![Staging deployment](https://img.shields.io/github/deployments/gwenda-hackney/web/staging?label=staging)
![Production deployment](https://img.shields.io/github/deployments/gwenda-hackney/web/production?label=production)

Deployment history: [github.com/gwenda-hackney/web/deployments](https://github.com/gwenda-hackney/web/deployments)

Staging is password-gated (`SITE_PASSWORD`). Production uses blue/green Pages projects with a smoke test before the domain swap.

## Branch flow

GitLab Flow with a long-running `release` branch:

1. **Develop on `main`** — every push runs lint, build, and tests, then deploys to staging.
2. **Release to production** — when ready, merge `main` into `release` and push. No separate CI runs on the PR; `main` was already verified on each push.

```bash
git checkout release
git merge main
git push origin release
```

3. **Production tag** — each production deploy creates a CalVer git tag (`YYYY.MM.DD+shortsha`).

First-time setup for `release`:

```bash
git checkout main && git pull
git checkout -b release
git push -u origin release
```

## CI/CD

There is one workflow per deploy target. Both call the reusable [verify](.github/workflows/verify.yml) job (lint → build → unit tests) before deploying.

| Trigger           | Workflow                                                     | Deploy target                            |
| ----------------- | ------------------------------------------------------------ | ---------------------------------------- |
| Push to `main`    | [Deploy staging](.github/workflows/deploy-staging.yml)       | `gwenda-staging`                         |
| Push to `release` | [Deploy production](.github/workflows/deploy-production.yml) | Standby blue/green slot → `gwenda.co.uk` |

**Toolchain:** Node 24, `npm ci` via Corepack (`packageManager` in `package.json`). Local devcontainer matches CI.

### Staging pipeline (`main`)

1. Verify (lint, build, test)
2. Build and deploy to `gwenda-staging`
3. Attach `staging.gwenda.co.uk` (Pages custom domain + zone DNS) — rehearses the production domain path without touching the apex
4. Smoke test `https://staging.gwenda.co.uk` — checks `/` and `/robots.txt`, asserts `X-Gwenda-Version` matches the build, retries while DNS/SSL propagate

### Production pipeline (`release`)

1. Verify (lint, build, test)
2. Resolve active slot from `PRODUCTION_ACTIVE_SLOT` (`blue` or `green`, default `blue`)
3. Deploy to the **standby** slot (`gwenda-{inactive}`)
4. Smoke test the standby `.pages.dev` URL with the same version header check (retries while Pages propagates the new deployment)
5. Swap `gwenda.co.uk` to the standby slot
6. Tag the CalVer release

Live traffic stays on the current slot until the standby smoke test passes and the domain swap completes.

**Swap safety:** apex DNS is updated in place (PATCH, not delete-then-create). If attach to the standby slot fails, CI re-attaches `gwenda.co.uk` to the live slot and aborts.

Shared deploy logic: [.github/actions/deploy-pages](.github/actions/deploy-pages/action.yml) and [scripts/ci/](scripts/ci/).

### Smoke tests

[`scripts/ci/smoke-test.mjs`](scripts/ci/smoke-test.mjs) runs after deploy:

- `GET /` (follows staging gate redirect) — expects `X-Gwenda-Version` to match the CalVer label for that build
- `GET /robots.txt` — expects HTTP 200

Staging and production standby checks retry for up to ~90s while Cloudflare propagates the deployment (and staging DNS/SSL).

### Local checks

```bash
npm run lint        # ESLint + Prettier
npm test            # Vitest unit tests
npm run test:watch  # Vitest watch mode
```

## Production blue/green

Two Cloudflare Pages projects alternate as live and standby:

| Slot  | Project        |
| ----- | -------------- |
| Blue  | `gwenda-blue`  |
| Green | `gwenda-green` |

GitHub repository variable **`PRODUCTION_ACTIVE_SLOT`**: `blue` or `green`.

### First-time setup

1. Rename (or recreate) the existing `gwenda` Pages project as **`gwenda-blue`** when convenient (optional — CI detects the legacy `gwenda` project during the first swap).
2. **`gwenda-green`** is created automatically on first deploy if missing.
3. Set **`PRODUCTION_ACTIVE_SLOT`** = `blue` if `gwenda-blue` (or legacy `gwenda`) currently serves production.
4. Push to `release` to run the first blue/green deploy.

The `gwenda.co.uk` zone must be on the Gwenda Cloudflare account for CI to manage DNS.

### Rollback

**Failed swap:** CI attempts to re-attach the live slot automatically. Check the workflow log; if that fails too, fix the domain binding in the Cloudflare dashboard.

**Bad release after a successful swap:** the previous slot is still running on its `.pages.dev` URL. Swap the domain back manually:

```bash
# Example: green is live, revert to blue
PRODUCTION_ACTIVE_SLOT=green \
LIVE_PROJECT=gwenda-green \
STANDBY_PROJECT=gwenda-blue \
NEW_ACTIVE_SLOT=blue \
CUSTOM_DOMAIN=gwenda.co.uk \
ZONE_NAME=gwenda.co.uk \
node scripts/ci/swap-production-domain.mjs
```

Set `PRODUCTION_ACTIVE_SLOT` manually if the GitHub API update fails.

## Versioning

Builds use **CalVer** — `YYYY.MM.DD+shortsha` (UTC date + git commit), e.g. `2026.06.11+e6ccf5a`. No manual version bumps.

Each production deploy tags the commit. Tags: [github.com/gwenda-hackney/web/tags](https://github.com/gwenda-hackney/web/tags). Re-deploying the same commit skips tagging if the tag already exists.

Check what's live:

```bash
curl -sI https://gwenda.co.uk | grep -i x-gwenda
curl -sI https://staging.gwenda.co.uk | grep -i x-gwenda
```

Response headers: `X-Gwenda-Version`, `X-Gwenda-Build-Sha`. On staging, the corner ribbon also shows the version.

## Opening countdown

The hero countdown reads `PUBLIC_OPENING_DATE` (`YYYY-MM-DD`) at build time. The date is not shown in the UI — only the counter updates.

Change it via GitHub repository variable `PUBLIC_OPENING_DATE`, then redeploy. Default: `2026-07-04`. Local: set in `.env`.

## Local development

```bash
npm install   # uses packageManager version via Corepack when enabled
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

## GitHub configuration

**Secrets:** `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SITE_PASSWORD`, `GATE_BYPASS_KEY`, `BASEROW_API_KEY`, `SUBSCRIBE_SECRET`

**Variables:** `PRODUCTION_ACTIVE_SLOT`, `PUBLIC_OPENING_DATE`, `BASEROW_TABLE_ID` (production subscribe list), `BASEROW_STAGING_TABLE_ID` (staging list, default `1024006`), `PUBLIC_CF_BEACON_TOKEN` (optional fallback)

Staging signups go to a [separate Baserow table](https://baserow.io/database/465058/table/1024006/2009979) so test data does not mix with production.

See [.env.example](.env.example) for local equivalents.
