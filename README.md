# Gwenda web

Marketing site for [Gwenda](https://gwenda.co.uk) — Astro on Cloudflare Pages.

## Deployments

| Environment    | Site                                                                                                                     | Branch    | Trigger           | GitHub                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ | --------- | ----------------- | ---------------------------------------------------------------------------------------------------- |
| **Staging**    | [staging.gwenda.co.uk](https://staging.gwenda.co.uk) (also [gwenda-staging.pages.dev](https://gwenda-staging.pages.dev)) | `main`    | Push to `main`    | [Deployments](https://github.com/gwenda-hackney/web/deployments/activity_log?environment=staging)    |
| **Production** | [gwenda.co.uk](https://gwenda.co.uk)                                                                                     | `release` | Push to `release` | [Deployments](https://github.com/gwenda-hackney/web/deployments/activity_log?environment=production) |

![Staging deployment](https://img.shields.io/github/deployments/gwenda-hackney/web/staging?label=staging)
![Production deployment](https://img.shields.io/github/deployments/gwenda-hackney/web/production?label=production)

All deployment history: [github.com/gwenda-hackney/web/deployments](https://github.com/gwenda-hackney/web/deployments)

### Branch flow

GitLab Flow with a long-running `release` branch:

1. **Develop on `main`** — every push runs lint, build, and tests, then deploys to staging.
2. **Release to production** — open a PR from `main` into `release` (main is already verified), merge, then push:

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

## CI and tests

| Trigger           | Workflow                                                     | Checks                  | Deploy            |
| ----------------- | ------------------------------------------------------------ | ----------------------- | ----------------- |
| Push to `main`    | [Deploy staging](.github/workflows/deploy-staging.yml)       | Lint, build, unit tests | `gwenda-staging`  |
| Push to `release` | [Deploy production](.github/workflows/deploy-production.yml) | Lint, build, unit tests | Blue/green → live |

Checks run in the reusable [verify](.github/workflows/verify.yml) job before any deploy. A PR to `release` promotes code that already passed on `main` — there is no separate CI workflow on that PR.

```bash
npm run lint        # ESLint + Prettier
npm test            # Vitest unit tests
npm run test:watch  # Vitest watch mode
```

## Production blue/green deploy

Production uses two Cloudflare Pages projects — **gwenda-blue** and **gwenda-green** — with `gwenda.co.uk` attached to the active slot.

Repository variable **`PRODUCTION_ACTIVE_SLOT`**: `blue` or `green` (defaults to `blue` if unset).

On each push to `release`:

1. Deploy to the **standby** slot (`gwenda-{inactive}`)
2. Run a minimal smoke test (`/` + `/robots.txt`) against the standby `.pages.dev` URL
3. Swap `gwenda.co.uk` to the standby slot if smoke passes
4. Tag the CalVer release

Live traffic is unchanged until smoke passes and the domain swap completes.

**Swap safety:** DNS updates patch the existing apex CNAME in place (no delete-then-create gap). If attach to the standby slot fails, the workflow re-attaches `gwenda.co.uk` to the live slot and aborts.

**Staging custom domain:** Each push to `main` also attaches `staging.gwenda.co.uk` and smoke-tests it — same Pages + DNS + SSL path as production, without touching the apex domain.

### First-time blue/green setup

1. In Cloudflare, rename the existing `gwenda` Pages project to **`gwenda-blue`** (or recreate it with that name and redeploy).
2. Create **`gwenda-green`** (CI creates it automatically on first deploy if missing).
3. Set GitHub repository variable **`PRODUCTION_ACTIVE_SLOT`** = `blue` if `gwenda-blue` currently serves production.
4. Push to `release` to run the first blue/green deploy.

### Rollback

If a release misbehaves after a successful swap, swap back to the previous slot (the old deployment stays running on its `.pages.dev` URL):

If a swap **fails mid-way**, CI attempts to re-attach the live slot automatically. Check the workflow log; if rollback also fails, fix the domain binding manually in Cloudflare.

Manual rollback after a successful swap:

```bash
# If green is live and you need to revert to blue:
PRODUCTION_ACTIVE_SLOT=green \
LIVE_PROJECT=gwenda-green \
STANDBY_PROJECT=gwenda-blue \
NEW_ACTIVE_SLOT=blue \
node scripts/ci/swap-production-domain.mjs
```

Set `PRODUCTION_ACTIVE_SLOT` manually if the GitHub API update fails.
