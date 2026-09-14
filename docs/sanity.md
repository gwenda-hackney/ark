# Sanity CMS

Sanity is Gwenda's **editorial layer** — website data and copy that editors own, distinct from site code in git. The static site reads published documents at build time; **Deploy site** in Studio triggers a rebuild.

Only part of gwenda.co.uk is CMS-backed today. Schema and queries grow as more content moves out of the repo (`marketing/studio/schemaTypes/`, `marketing/web/src/lib/sanity/`).

Project `pn5yjro6` on [sanity.io/manage](https://www.sanity.io/manage).

## Environments

| | Git branch | Website | Sanity dataset | Hosted Studio |
|---|------------|---------|----------------|---------------|
| **Local dev** | — | `npm run dev` | `development` | `npm run studio` (localhost) |
| **Staging** | `main` | gwenda-staging.pages.dev | **`development`** | https://gwenda-dev.sanity.studio |
| **Production** | `release` | gwenda.co.uk | **`production`** | https://gwenda.sanity.studio |

Schema and query changes flow **main → staging (dev dataset) → release → live (prod dataset)**. Content is promoted separately when ready.

## Workflow

1. **Develop on `main`** — edit schema in `marketing/studio/`, seed/test content in the **development** dataset, push to `main`.
2. **CI on `main`** deploys:
   - **Staging site** — builds against **development** dataset (preview structural + content changes)
   - **Development Studio** — https://gwenda-dev.sanity.studio (edit dev content/schema in hosted UI)
3. **Promote to production** — merge `main` → `release`, push:
   - **Live site** builds against **production** dataset
   - **Production Studio** — run manually when schema is ready:
     ```bash
     npm run studio:deploy
     ```
   - **Production content** — edit in prod Studio or `npm run studio:seed:production` (one-off)

Local `.env` always uses `SANITY_DATASET=development` — same sandbox as staging.

## Tokens

Sanity **robot / API tokens** on this plan are **Viewer**, **Editor**, and **Deploy Studio**. There is no **Developer** robot role in the manage UI (Developer is a human user role on Growth+).

**Keep-set (exactly three robots):**

| Label | Role | Where | Used for |
|-------|------|-------|----------|
| `ark-local-editor` | **Editor** | Bitwarden `ark/.env.local` + repo `.env` as `SANITY_API_TOKEN` | Local Studio, seeds. **Never** GitHub. |
| `ark-ci-viewer` | **Viewer** | GitHub `SANITY_API_TOKEN` | Site builds / content deploys |
| `ark-ci-deploy-studio` | **Deploy Studio** | GitHub `SANITY_DEPLOY_TOKEN` | Hosted Studio deploys |

Mint, rotate, and revoke extras with a **personal** admin session (`npx sanity login`), not the local Editor robot:

```bash
npx sanity login
gh auth login -h github.com -p https -s repo,workflow
export BW_SESSION=$(bw unlock --raw)   # optional vault sync
npm run setup:sanity-tokens
```

`setup:ci-secrets` is a deprecated alias that only refreshes CI tokens + GitHub secrets.

### Local `.env`

```bash
SANITY_PROJECT_ID=pn5yjro6
SANITY_DATASET=development
SANITY_API_TOKEN=sk...   # ark-local-editor (Editor robot)
```

## Studio env files

All local configuration lives in **repo-root `.env`**. `scripts/with-env.mjs` loads it for Studio, web dev, and CLI, and maps shared names to `SANITY_STUDIO_*` build-time aliases:

| Root `.env` | Studio alias |
|-------------|--------------|
| `SANITY_PROJECT_ID` | `SANITY_STUDIO_PROJECT_ID` |
| `SANITY_DATASET` | `SANITY_STUDIO_DATASET` |
| `EVENT_ADMIN_SECRET` | `SANITY_STUDIO_EVENT_ADMIN_SECRET` |
| `EVENT_ADMIN_URL` | `SANITY_STUDIO_EVENT_ADMIN_URL` |
| `BASEROW_RSVP_GRID_URL` | `SANITY_STUDIO_BASEROW_RSVP_URL` |
| `DEPLOY_WEBHOOK_SECRET` | `SANITY_STUDIO_SITE_DEPLOY_SECRET` |

`marketing/studio/.env.development` and `marketing/studio/.env.production` are stubs only — do not put secrets there.

| Command | Dataset / hostname |
|---------|-------------------|
| `npm run studio` | from root `SANITY_DATASET` (default `development`) |
| `npm run studio:deploy:dev` | `development` → gwenda-dev.sanity.studio |
| `npm run studio:deploy` | `production` → gwenda.sanity.studio |

Hosted Studio deploys get extra vars from GitHub Actions secrets (see `studio.yml`).

## First-time setup

```bash
npm run studio:dataset:create -- development --visibility private
npx sanity login
```

Pull secrets with `npm run env:pull` (Bitwarden note `ark/.env.local`), or copy `.env.example` → `.env` and fill by hand. See [docs/env.md](env.md).

## Local commands

```bash
npm run studio              # localhost Studio → development
npm run dev                 # site → development dataset
npm run studio:deploy:dev   # hosted dev Studio (same as main CI)
npm run studio:deploy       # hosted prod Studio (editors)
npm run studio:seed:dev     # seed development menu
npm run studio:seed:production   # seed production menu (one-off, CONFIRM built in)
```

## Schema + content

Schema lives in git (`marketing/studio/schemaTypes/`). Queries in `marketing/web/src/lib/sanity/`. Content lives in Sanity datasets — development and production are independent until you copy or re-enter.

### Menu seed

```bash
npm run studio:seed:dev
npm run studio:seed:production   # requires Editor token in .env
```

Idempotent — updates by slug/name.

## Mirror datasets (staging ↔ production)

Sanity **development** and **production** datasets stay independent until you mirror them.

GitHub → Actions → **Sanity** (`sanity.yml`, workflow_dispatch):

| Direction | Overwrites |
|-----------|------------|
| `staging-to-production` | `production` |
| `production-to-staging` | `development` |

You must type the target dataset name in `confirm_target`. Uses secret `SANITY_DATASET_SYNC_TOKEN` (Editor robot from `npm run setup:sanity-tokens`).

This only updates the CMS. Rebuild the site afterwards (Studio **Deploy site**, or `deploy-*-content` workflows).

Locally:

```bash
npm run sync:sanity-datasets -- --direction staging-to-production --confirm production
npm run sync:sanity-datasets -- --direction production-to-staging --confirm development
```

## Content vs code

| What | Promotes via |
|------|----------------|
| Schema + queries | git → main (staging/dev) → release (live/prod) |
| Dev Studio deploy | push `marketing/studio/**` to `main` |
| Prod Studio deploy | `npm run studio:deploy` when schema ready |
| Dev content | stays in `development` until copied to prod |
| Prod content | editors publish in prod Studio |
| Dataset mirror | GitHub **Sanity** workflow (`sanity.yml`) |
| **Site content (published)** | **Studio → Deploy site** (see below) |

## Deploy published content to the website

The static site reads **published** Sanity documents at build time. Publishing a document in Studio updates the CMS only — the live website updates when you deploy.

### Editor workflow

1. Edit documents in Studio. Use per-document **Publish** when a piece of content is ready.
2. Leave work-in-progress as **drafts** — they are held back and never included in a deploy.
3. Open **Deploy site** in the Studio toolbar.
4. **Development Studio:** click **Deploy to staging** (straight to staging).
5. **Production Studio:**
   1. Click **Deploy preview** (builds published production content to the production preview URL).
   2. Review the preview link in Studio.
   3. Click **Promote to live** (ships that exact build to gwenda.co.uk).

Staging is one step. Production content uses the same preview → promote gate as code deploys, so live only updates after review.

### Code vs content deploys

| | Code (developers) | Content (editors) |
|---|---|---|
| Trigger | Push to `main` / `release` | Studio **Deploy site** button |
| Staging | Push to `main` | Dev Studio → Deploy to staging |
| Production gate | Preview → manual promote | Prod Studio → Deploy preview → Promote to live |
| GitHub workflows | `web.yml` + `web-promote.yml` (`kind=code`) | `web.yml` (content actions) + `web-promote.yml` (`kind=content`) |

### Infrastructure

```
Studio (browser) → gwenda-site-deploy-webhook (Worker) → GitHub Actions → Cloudflare Pages
```

Worker: `marketing/site-deploy-webhook/` validates a shared secret, then dispatches content deploy (and production promote) workflows.

| Endpoint | Role |
|---|---|
| `POST /deploy` | Staging deploy, or production **preview** |
| `POST /promote` | Production **promote** (body: `{ previewRunId }`) |
| `GET /status?run_id=` | Poll run; production preview success includes `previewUrl` |

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
npm run studio:deploy   # uses SANITY_DEPLOY_TOKEN (CI secret or local)
```

