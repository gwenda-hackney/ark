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

Staging is password-gated (`SITE_PASSWORD`). Staging and production use the same Cloudflare Pages deploy model: preview on `ci-{sha}`, smoke test, production cutover, live smoke test, rollback on failure, prune old previews.

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

| Trigger           | Workflow                                                     | Deploy target                  |
| ----------------- | ------------------------------------------------------------ | ------------------------------ |
| Push to `main`    | [Deploy staging](.github/workflows/deploy-staging.yml)       | `gwenda-staging`               |
| Push to `release` | [Deploy production](.github/workflows/deploy-production.yml) | `gwenda` → `gwenda.co.uk` |

**Toolchain:** Node 24, `npm ci` via Corepack (`packageManager` in `package.json`). Local devcontainer matches CI.

### Deploy pipeline (staging and production)

Both environments use the shared [pages-preview-production](.github/workflows/pages-preview-production.yml) workflow:

1. Verify (lint, build, test)
2. Record the current production deployment (for rollback)
3. Build and deploy a **preview** (`ci-{sha}` branch — custom domains unchanged)
4. Smoke test the preview `.pages.dev` URL
5. Deploy the same build to **production** (`main` for staging, `release` for production — atomic cutover)
6. Smoke test the live URL(s); rollback if any check fails
7. Prune older `ci-*` preview deployments (keep the current preview)

Production also tags the CalVer release on success. Staging runs `ensure-pages-domain` for `staging.gwenda.co.uk` (idempotent).

|                   | Staging                | Production                         |
| ----------------- | ---------------------- | ---------------------------------- |
| Project           | `gwenda-staging`       | `gwenda`                           |
| Production branch | `main`                 | `release`                          |
| Live smoke        | `staging.gwenda.co.uk` | `gwenda.co.uk`, `www.gwenda.co.uk` |

Custom domains stay permanently attached. There is no domain detach/attach per deploy.

**Rollback:** if the post-cutover smoke test fails, CI calls the [Cloudflare Pages rollback API](https://developers.cloudflare.com/pages/configuration/rollbacks/) to restore the previous production deployment.

Shared deploy logic: [.github/actions/deploy-pages](.github/actions/deploy-pages/action.yml) and [scripts/ci/](scripts/ci/).

### Smoke tests

[`scripts/ci/smoke-test.mjs`](scripts/ci/smoke-test.mjs) runs after deploy:

- `GET /` — expects HTTP 200 and `X-Gwenda-Version` matching the build
- `GET /robots.txt` — expects HTTP 200

**Staging and production (same pipeline):**

1. **Preview** — hash `.pages.dev` URL (`ci-{sha}` branch). Live custom domains are unchanged.
2. **Live** — custom domain(s) after the production-branch deploy.

Preview checks retry for up to ~90s while Cloudflare propagates the deployment. Live checks use shorter retries — cutover is atomic.

### Local checks

```bash
npm run lint        # ESLint + Prettier
npm test            # Vitest unit tests
npm run test:watch  # Vitest watch mode
```

## Production Pages project

Production runs on a single Cloudflare Pages project: **`gwenda`** (production branch: `release`). Custom domains `gwenda.co.uk` and `www.gwenda.co.uk` are attached once and never moved per deploy.

Staging uses a separate project (`gwenda-staging` on `main`).

Delete the unused **`gwenda-green`** Pages project in Cloudflare when convenient.

The `gwenda.co.uk` zone must be on the Gwenda Cloudflare account for CI to manage DNS (staging custom domain).

### Rollback

**Failed post-cutover smoke test:** CI rolls back to the production deployment recorded before the release.

**Bad release after a successful deploy:** use the Cloudflare dashboard (Deployments → Rollback) or:

```bash
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... \
node scripts/ci/rollback-pages-production.mjs \
  --project gwenda \
  --deployment-id <previous-deployment-id>
```

Find deployment IDs in the Cloudflare Pages dashboard or via the [Deployments API](https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/deployments/).

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

**Variables:** `PUBLIC_OPENING_DATE`, `BASEROW_TABLE_ID` (production subscribe list), `BASEROW_STAGING_TABLE_ID` (staging list, default `1024006`), `PUBLIC_CF_BEACON_TOKEN` (optional fallback)

Staging signups go to a [separate Baserow table](https://baserow.io/database/465058/table/1024006/2009979) so test data does not mix with production.

See [.env.example](.env.example) for local equivalents.
