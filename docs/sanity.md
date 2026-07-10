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

## Tokens — `SANITY_API_TOKEN`

| | Where | Sanity permission |
|---|--------|-------------------|
| **Local dev** | repo root `.env` | **Developer** |
| **CI** | GitHub secret `SANITY_API_TOKEN` | **Deploy** (read both datasets + deploy Studio) |

```bash
gh secret set SANITY_API_TOKEN
```

Never copy your local `.env` token into GitHub.

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
