# Sanity CMS

Sanity is Gwenda's **editorial layer**: website data and copy that editors own, distinct from site code in git.

One project (`pn5yjro6`) on [sanity.io/manage](https://www.sanity.io/manage). Two hosted Studios. Two datasets (`staging` and `production`). Growth includes two datasets per project.

## Environments

| | Git branch | Website | Sanity dataset | Perspective | Studio |
|---|------------|---------|----------------|-------------|--------|
| **Local** | `develop` (WIP) | `npm run dev` | **`staging`** | drafts overlay | localhost Studio |
| **Staging** | `main` | gwenda-staging.pages.dev | **`staging`** | published only | [gwenda-dev.sanity.studio](https://gwenda-dev.sanity.studio) (edit here; review the site) |
| **Production** | promote only (`release` pointer) | gwenda.co.uk | **`production`** (clone of staging) | published only | [gwenda.sanity.studio](https://gwenda.sanity.studio) (schema; do not edit live content) |

Local Studio and `npm run dev` work against the staging dataset with drafts visible. The hosted staging **site** ignores drafts. Production is a clean copy of staging, then a production build.

## Workflow

1. **Local** — `npm run studio` and `npm run dev` on `develop`. Leave WIP as drafts. CI verifies. There is no hosted development site.
2. **Publish**, then **promote to staging** — rebuilds gwenda-staging from published staging documents (and deploys `main` site code).
3. **Review** https://gwenda-staging.pages.dev.
4. **Promote to production** — clone **staging** onto **production**, then build and deploy gwenda.co.uk.

Local `.env` uses `SANITY_DATASET=staging`. Do not edit the production dataset in Studio.

## Tokens

Sanity **robot / API tokens** on this plan are **Viewer**, **Editor**, and **Deploy Studio**. There is no **Developer** robot role in the manage UI (Developer is a human user role on Growth+).

**Keep-set:**

| Label | Role | Where | Used for |
|-------|------|-------|----------|
| `ark-local-editor` | **Editor** | Bitwarden `ark/.env.local` + repo `.env` as `SANITY_API_TOKEN` | Local Studio, seeds. **Never** GitHub. |
| `ark-ci-viewer` | **Viewer** | GitHub `SANITY_API_TOKEN` | Site builds / content deploys |
| `ark-ci-deploy-studio` | **Deploy Studio** | GitHub + SM `SANITY_DEPLOY_TOKEN` (`.env.secrets`) | Hosted Studio deploys |
| `ark-ci-dataset-sync` | **Editor** | GitHub `SANITY_DATASET_SYNC_TOKEN` | Clone staging → production |

Mint, rotate, and revoke extras with a **personal** admin session (`npx sanity login`), not the local Editor robot:

```bash
npx sanity login
gh auth login -h github.com -p https -s repo,workflow
bw-unlock   # optional vault sync
npm run setup:sanity-tokens
```

`setup:ci-secrets` is a deprecated alias that only refreshes CI tokens + GitHub secrets.

### Local `.env`

```bash
SANITY_PROJECT_ID=pn5yjro6
SANITY_DATASET=staging
SANITY_API_TOKEN=sk...   # ark-local-editor (Editor robot)
```

## Studio env files

All local configuration lives in **repo-root `.env`**. `scripts/with-env.mjs` loads it for Studio, web dev, and CLI, and maps shared names to `SANITY_STUDIO_*` build-time aliases:

| Root `.env` | Studio alias |
|-------------|--------------|
| `SANITY_PROJECT_ID` | `SANITY_STUDIO_PROJECT_ID` |
| `SANITY_DATASET` | `SANITY_STUDIO_DATASET` |
| `DEPLOY_WEBHOOK_SECRET` | `SANITY_STUDIO_SITE_DEPLOY_SECRET` |

`marketing/studio/.env.development` and `marketing/studio/.env.production` are stubs only — do not put secrets there.

| Command | Dataset / hostname |
|---------|-------------------|
| `npm run studio` | `staging` → localhost:3333 (drafts in `npm run dev`) |
| `npm run studio:deploy:dev` | `staging` → gwenda-dev.sanity.studio (main CI) |
| `npm run studio:deploy:staging` | alias of `studio:deploy:dev` |
| `npm run studio:deploy` | `production` → gwenda.sanity.studio |

Hosted Studio deploys get extra vars from GitHub Actions secrets (see `studio.yml`).

## First-time setup

The project already has `staging` and `production`. Growth allows two datasets. Do not create a third.

Pull secrets with `npm run env:pull` (Bitwarden note `ark/.env.local`), then `npm run env:secrets:pull`. See [docs/env.md](env.md).

## Local commands

```bash
npm run studio              # localhost Studio → staging dataset
npm run dev                 # site → staging dataset, drafts overlay
npm run studio:deploy:dev   # hosted Dev Studio (main CI)
npm run studio:seed:dev     # seed staging menu
npm run studio:seed:production   # seed production menu (one-off, CONFIRM built in)
```

## Schema + content

Schema lives in git (`marketing/studio/schemaTypes/`). Queries in `marketing/web/src/lib/sanity/`. Content lives in two datasets: **staging** (local Studio, Dev Studio, ops writes, staging site) and **production** (clone of staging, live site). Do not edit production in Studio.

### Menu seed

```bash
npm run studio:seed:dev
npm run studio:seed:production   # requires Editor token in .env
```

Idempotent — updates by slug/name.

## Mirror datasets

`npm run sync:sanity-datasets` prefers **Cloud Clone** when the plan allows it. On this project it usually falls back to **export → import `--replace` → delete orphans**.

GitHub → Actions → **Sanity** (`sanity.yml`, workflow_dispatch):

| Direction | Overwrites |
|-----------|------------|
| `staging-to-production` | `production` (from `staging`) |
| `production-to-staging` | `staging` (from `production`) |

You must type the target dataset name in `confirm_target`. Uses secret `SANITY_DATASET_SYNC_TOKEN` when Cloud Clone works; export/import needs a token that can write the target.

This only updates the CMS. Promote from ops or Dev Studio to rebuild the matching site.

Locally:

```bash
npm run sync:sanity-datasets -- --direction staging-to-production --confirm production
npm run sync:sanity-datasets -- --direction production-to-staging --confirm staging
```

## Content vs code

| What | Promotes via |
|------|----------------|
| Schema + queries | git `develop` → `main` (staging) → ops promote (live) |
| Dev Studio | push `marketing/studio/**` to `main` |
| Prod Studio | ops promote (or `npm run studio:deploy`) |
| Staging content | publish in Studio, then rebuild gwenda-staging |
| Production content | clone only (`staging` → `production`), then production build |
| Dataset mirror | GitHub **Sanity** workflow (`sanity.yml`) |
| **Site rebuild** | Promote to staging (published content), or ops Web promote to production |

## Deploy published content to the website

The static site reads **published** Sanity documents at build time. `npm run dev` overlays drafts so you can preview WIP without publishing. Publishing a document does not update gwenda-staging until the next staging rebuild.

### Editor workflow

1. Edit in **Dev Studio** or local Studio. Leave WIP as drafts. `npm run dev` shows those drafts.
2. Publish when the copy is ready for the review site.
3. Rebuild staging (ops Web / Dev Studio promote, or merge to `main`). Staging ignores drafts.
4. Review https://gwenda-staging.pages.dev.
5. Ops **Web** → **Promote to production**.

Do not edit the production dataset directly.

### Code vs content deploys

| | Code | Content |
|---|---|---|
| Trigger | Staging: merge to `main`. Live: manual workflow from `release` | Publish, then rebuild staging, then Web promote from `release` |
| Staging | Push to `main` | Rebuild from published `staging` documents (drafts ignored) |
| Production | Manual [Web promote](../.github/workflows/web-promote.yml) from `release` | That same run copies `staging` → `production`, then builds |

### Infrastructure

```
Ops Web or Studio → gwenda-site-deploy-webhook (Worker) → GitHub Actions → Cloudflare Pages
```

Worker: `marketing/site-deploy-webhook/` validates a shared secret, then dispatches staging rebuild (`web.yml`) and staging-to-production (`web-promote.yml`).

| Endpoint | Role |
|---|---|
| `POST /deploy` | Staging site rebuild from published staging documents (`target: staging`) |
| `POST /promote` | Dispatch [Web promote](../.github/workflows/web-promote.yml) on `release` (clone then live build). Fails if that branch is not the one selected. Legacy `development-to-staging` still rebuilds staging. |
| `GET /status?run_id=` | Poll a run |

**Automated setup** (agents and developers — uses `.env` + `gh`):

```bash
npm run setup:site-deploy
```

This generates `DEPLOY_WEBHOOK_SECRET`, pushes GitHub secrets, deploys the Worker, writes `SANITY_STUDIO_SITE_DEPLOY_*` into repo-root `.env`, and dispatches `studio.yml` for hosted dev Studio.

Prerequisites: `CLOUDFLARE_API_TOKEN` in `.env`, `gh auth login` with `repo,workflow` scopes.

| Secret / var | Role |
|---|---|
| `DEPLOY_WEBHOOK_SECRET` | Shared password — GitHub secret, Worker secret, `SANITY_STUDIO_SITE_DEPLOY_SECRET` |
| `DISPATCH_TOKEN` | GitHub PAT with Actions write — Worker uses it to trigger content deploy workflows (setup uses `gh auth token`) |
| `SANITY_STUDIO_SITE_DEPLOY_URL` | Public Worker URL — GitHub secret + `.env` |

Local Studio reads deploy vars from `.env` via `scripts/with-env.mjs`. Hosted Studio gets them from GitHub secrets in `studio.yml` at deploy time.

Production hosted Studio after setup:

```bash
npm run studio:deploy   # uses SANITY_DEPLOY_TOKEN (CI secret, or .env.secrets locally)
```

