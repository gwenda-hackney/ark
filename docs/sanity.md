# Sanity CMS

Sanity is Gwenda's **editorial layer**: website data and copy that editors own, distinct from site code in git.

One project (`pn5yjro6`) on [sanity.io/manage](https://www.sanity.io/manage). Two hosted Studios. Two datasets (`staging` and `production`). The project is on the **Free** plan, which allows two datasets and no more, so there is no development dataset: local work uses drafts in `staging`.

## Environments

| | Git branch | Website | Sanity dataset | Perspective | Studio |
|---|------------|---------|----------------|-------------|--------|
| **Local** | `develop` (WIP) | `npm run dev` | **`staging`** | drafts overlay | localhost Studio |
| **Staging** | `main` | gwenda-staging.pages.dev | **`staging`** | published only | [gwenda-dev.sanity.studio](https://gwenda-dev.sanity.studio) (edit here; review the site) |
| **Production** | promote only (`release` pointer) | gwenda.co.uk | **`production`** (copied from staging by ops Release) | published only | [gwenda.sanity.studio](https://gwenda.sanity.studio) (schema; do not edit live content) |

Local Studio and `npm run dev` work against the staging dataset with drafts visible. The hosted staging **site** ignores drafts. Production gets the published staging documents you choose in ops **Website → Staging → live**, then a production build.

## Workflow

1. **Local** — `npm run studio` and `npm run dev` on `develop`. Leave WIP as drafts. CI verifies. There is no hosted development site.
2. **Publish**, then **promote to staging** — rebuilds gwenda-staging from published staging documents (and deploys `main` site code).
3. **Review** https://gwenda-staging.pages.dev.
4. **Publish live** — ops **Website → Staging → live** diffs published staging against production, copies what you pick (or everything), then rebuilds gwenda.co.uk.

### Ops Website page (Staging → live)

One page compares staging with live in three sections:

- **Content**: published Sanity documents that differ, with a field-level diff. **Publish to live** copies staging → production (then rebuilds live); **Reset staging from live** copies production → staging (then rebuilds staging). Both work on all documents or the ones you tick.
- **Code**: the commit each site runs, and the commits on staging that live lacks (via the site-deploy webhook's `/compare`). Code ships when `release` moves, not from this page.
- **Databases**: Baserow production vs its copies, table by table (production Ops DB 556507 vs the Gwenda Dev copy 560292; production Website DB 461843 vs Website Staging 564496). Rows are compared by value, so ids and empty-vs-null differences don't count. **Copy production over it** runs `.github/workflows/baserow-copy.yml` through the webhook's `/baserow-copy`; production is only read.

### Ops events and local ops

- **Hosted ops:** saving an event stages it (writes its series and nights to `staging`, published). What's on on gwenda-staging reads that live; staging rebuilds itself when new series or night pages appear. The live site changes only from ops Website → Staging → live.
- **Local ops** (`SITE_ENV=local`): saving writes **drafts** in `staging`, which only the local site shows (`previewDrafts`). Local ops cannot write published staging documents, production, or trigger any deploy (the server returns 403). Studio cannot publish or delete `event` / `eventSeries` documents, so a local draft can never be pushed to staging from Studio; use Discard to clear one.
- A removal cannot be previewed locally: deleting a night in local ops only drops its draft.

Local `.env` uses `SANITY_DATASET=staging`. Do not edit the production dataset in Studio.

## Tokens

Sanity **robot / API tokens** on this plan are **Viewer**, **Editor**, and **Deploy Studio**. There is no **Developer** robot role in the manage UI (Developer is a human user role on Growth+).

**Keep-set:**

| Label | Role | Where | Used for |
|-------|------|-------|----------|
| `ark-local-editor` | **Editor** | Bitwarden `ark/.env.local` + repo `.env` as `SANITY_API_TOKEN` | Local Studio, seeds. **Never** GitHub. |
| `ark-ci-viewer` | **Viewer** | GitHub `SANITY_API_TOKEN` | Site builds / content deploys |
| `ark-ci-deploy-studio` | **Deploy Studio** | GitHub + SM `SANITY_DEPLOY_TOKEN` (`.env.secrets`) | Hosted Studio deploys |
| `ark-ci-dataset-sync` | **Editor** | GitHub `SANITY_DATASET_SYNC_TOKEN` | Manual dataset mirror (`sanity.yml`) |

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

Schema lives in git (`marketing/studio/schemaTypes/`). Queries in `marketing/web/src/lib/sanity/`. Content lives in two datasets: **staging** (local Studio, Dev Studio, ops writes, staging site) and **production** (published staging documents copied from ops Website → Staging → live, live site). Do not edit production in Studio.

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
| Production content | ops Website → Staging → live (document copy), then production build |
| Dataset mirror | GitHub **Sanity** workflow (`sanity.yml`) |
| **Site rebuild** | Staging: automatic after event saves that add pages, or ops Website → Rebuild staging. Live: automatic after publishing from Staging → live |

## Deploy published content to the website

The static site reads **published** Sanity documents at build time. `npm run dev` overlays drafts so you can preview WIP without publishing. Publishing a document does not update gwenda-staging until the next staging rebuild.

### Editor workflow

1. Edit in **Dev Studio** or local Studio. Leave WIP as drafts. `npm run dev` shows those drafts.
2. Publish when the copy is ready for the review site.
3. Rebuild staging (ops Web / Dev Studio promote, or merge to `main`). Staging ignores drafts.
4. Review https://gwenda-staging.pages.dev.
5. Ops **Website → Staging → live**: review the diff, then publish all or selected changes.

Do not edit the production dataset directly.

### Code vs content deploys

| | Code | Content |
|---|---|---|
| Trigger | Staging: merge to `main`. Live: manual workflow from `release` | Publish (or save in ops), then Website → Staging → live |
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

