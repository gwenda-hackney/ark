# Sanity CMS

Project `pn5yjro6` on [sanity.io/manage](https://www.sanity.io/manage).

## Environments

| | Git branch | Website | Sanity dataset | Hosted Studio |
|---|------------|---------|----------------|---------------|
| **Local dev** | — | `npm run dev` | `development` | `npm run studio` (localhost) |
| **Staging** | `main` | gwenda-staging.pages.dev | **`development`** | https://gwenda-dev.sanity.studio |
| **Production** | `release` | gwenda.co.uk | **`production`** | https://gwenda.sanity.studio |

Schema and query changes flow **main → staging (dev dataset) → release → live (prod dataset)**. Content is promoted separately when ready.

## Workflow

1. **Develop on `main`** — edit schema in `studio/`, seed/test content in the **development** dataset, push to `main`.
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

Sanity allows **one role per token**. On standard plans the built-in roles are separate — no single role both reads documents and deploys Studio:

| Built-in role | Read menu/content | Deploy Studio |
|---|---|---|
| **Viewer** | Yes | No |
| **Deploy Studio** | No | Yes |

Use **two GitHub secrets** for CI (one Sanity role per token):

| Secret | Role | Used by |
|---|---|---|
| `SANITY_API_TOKEN` | **Viewer** | Site builds (`verify`, `deploy-staging`, `deploy-production`, content deploys) |
| `SANITY_DEPLOY_TOKEN` | **Deploy Studio** | `deploy-studio.yml` only |

**Automated setup** (uses Developer token in `.env`, pushes secrets via `gh`):

```bash
npm run setup:ci-secrets
```

One-time GitHub login in the devcontainer (persisted via `.config/gh` mount on rebuild):

```bash
gh auth login -h github.com -p https -s repo,workflow
```

Manual alternative:

```bash
gh secret set SANITY_API_TOKEN      # Viewer
gh secret set SANITY_DEPLOY_TOKEN   # Deploy Studio
```

Local dev keeps a **Developer** token in repo-root `.env` — never copy it to GitHub.

### Local `.env`

```bash
SANITY_PROJECT_ID=pn5yjro6
SANITY_DATASET=development
SANITY_API_TOKEN=sk...
```

## Studio env files

Sanity inlines `SANITY_STUDIO_*` vars at build time. `sanity.config.ts` must reference them directly.

| File | Used by | Dataset | URL |
|------|---------|---------|-----|
| `studio/.env.development` | `npm run studio`, `studio:deploy:dev`, main CI | `development` | gwenda-dev.sanity.studio |
| `studio/.env.production` | `studio:deploy` | `production` | gwenda.sanity.studio |

`SANITY_ACTIVE_ENV=development` makes `sanity deploy` load `.env.development` instead of `.env.production`.

## First-time setup

```bash
npm run studio:dataset:create -- development --visibility private
npx sanity login
```

Copy env vars from `.env.example` into repo root `.env`.

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

Schema lives in git (`studio/schemaTypes/`). Queries in `web/src/lib/sanity/`. Content lives in Sanity datasets — development and production are independent until you copy or re-enter.

### Menu seed

```bash
npm run studio:seed:dev
npm run studio:seed:production   # requires Developer/Editor token in .env
```

Idempotent — updates by slug/name.

## Content vs code

| What | Promotes via |
|------|----------------|
| Schema + queries | git → main (staging/dev) → release (live/prod) |
| Dev Studio deploy | push `studio/**` to `main` |
| Prod Studio deploy | `npm run studio:deploy` when schema ready |
| Dev content | stays in `development` until copied to prod |
| Prod content | editors publish in prod Studio |
| **Site content (published)** | **Studio → Deploy site** (see below) |

## Deploy published content to the website

The static site reads **published** Sanity documents at build time. Publishing a document in Studio updates the CMS only — the live website updates when you deploy.

### Editor workflow

1. Edit documents in Studio. Use per-document **Publish** when a piece of content is ready.
2. Leave work-in-progress as **drafts** — they are held back and never included in a deploy.
3. Open **Deploy site** in the Studio toolbar.
4. Click **Deploy to staging** (dev Studio) or **Deploy to live** (prod Studio).

The site rebuilds from published content only and goes straight to the live URL — no GitHub promote step.

### Code vs content deploys

| | Code (developers) | Content (editors) |
|---|---|---|
| Trigger | Push to `main` / `release` | Studio **Deploy site** button |
| Production gate | Preview → manual promote | Straight to gwenda.co.uk |
| GitHub workflows | `deploy-staging.yml`, `deploy-production.yml` | `deploy-staging-content.yml`, `deploy-production-content.yml` |

### Infrastructure

```
Studio (browser) → gwenda-site-deploy-webhook (Worker) → GitHub Actions → Cloudflare Pages
```

Worker: `utils/site-deploy-webhook/` — validates a shared secret, dispatches the content deploy workflow.

**One-time setup** (after merging):

```bash
# GitHub secrets (repo settings)
gh secret set DEPLOY_WEBHOOK_SECRET      # shared with Studio + Worker
gh secret set GITHUB_DISPATCH_TOKEN      # PAT or fine-grained token: repo + Actions write

# Deploy Worker (CI does this on push to main, or manually):
npm run deploy -w @gwenda/site-deploy-webhook

# Add Worker URL + secret to Studio env files, then redeploy Studio:
# studio/.env.development + studio/.env.production
SANITY_STUDIO_SITE_DEPLOY_URL=https://gwenda-site-deploy-webhook.<account>.workers.dev
SANITY_STUDIO_SITE_DEPLOY_SECRET=<same as DEPLOY_WEBHOOK_SECRET>

npm run studio:deploy:dev    # staging Studio
npm run studio:deploy        # production Studio
```

