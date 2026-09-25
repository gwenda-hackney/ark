# Sanity CMS

Sanity is Gwenda's **editorial layer**: website data and copy that editors own, distinct from site code in git.

Two projects on [sanity.io/manage](https://www.sanity.io/manage), both on the **Free** plan (two datasets each, `staging` and `production`):

- **Gwenda Web** (`pn5yjro6`): the real website. Two hosted Studios.
- **Gwenda Dev** (`gwscpagy`): a copy for local work. Local ops, the local site and local Studio use it, so local testing runs exactly the hosted flow (Save, then Update website) and can never reach gwenda.co.uk. Refresh it from the real project with `npm run dev:refresh:sanity` (your personal `npx sanity login`; the real project is only read).

## Environments

Two environments, **dev** and **prod**, built the same way. Each has its own Sanity project with two datasets (`staging` = preview, `production` = live), its own Ops database and its own Website database:

| | Sanity | Ops DB | Website DB | Ops app | Website |
|---|---|---|---|---|---|
| **Dev** | Gwenda Dev (`gwscpagy`) | Gwenda Dev · Ops (560292) | Gwenda Dev · Website (563090) | [gwenda-ops-dev.pages.dev](https://gwenda-ops-dev.pages.dev), or `npm run ops:dev` | [gwenda-web-dev.pages.dev](https://gwenda-web-dev.pages.dev) (live) / [preview.gwenda-web-dev.pages.dev](https://preview.gwenda-web-dev.pages.dev) (preview); locally `npm run web:dev:live` / `npm run web:dev` |
| **Prod** | Gwenda Web (`pn5yjro6`) | Gwenda Ops (556507) | Website (461843) | gwenda-ops.pages.dev | gwenda-staging.pages.dev (preview) / gwenda.co.uk (live) |

**Hosted dev** runs the code on `main`: every push deploys dev ops (`apps.yml`) and both dev website sites (`web.yml`), so the whole ops → website flow can be tried in Cloudflare before `release`. Dev ops' builds go to the dev website only (the deploy webhook routes `env: "dev"` requests to `web.yml` `dev-preview` / `dev-live`), with their own snapshot and scheduler keys (`site.build_snapshot.dev`, `site.auto_update.dev`). The dev website is password-gated. Form notifications from every hosted site except prod (dev website, prod's preview) go to `alerts@gwenda.co.uk` (config `forms.notify_email`, Env `dev` and `staging`). On a developer's machine, `FORMS_NOTIFY_EMAIL` in `.env` sends them to that developer instead. Outside prod, if neither is available nothing is sent rather than falling back to the form's real address. Hosted dev sets `SITE_ENV=dev`; a developer's machine is `SITE_ENV=local` and reads the dev settings plus its own `.env` values (see docs/config.md). Secrets Manager still names dev secrets `__LOCAL`.

**gwenda-staging is prod's preview, not a third environment.** It shows prod's `staging` dataset (what ops has saved but not yet put on the website) with the code on `main`, so new code is checked against real content before release. It has its own Website DB (Website Staging, 564496) so test form submissions stay out of the real one. Its ribbon says **Preview**; a local site's says **Dev**.

| | Git branch | Sanity dataset | Perspective | Studio |
|---|------------|----------------|-------------|--------|
| **Dev** (your machine) | `develop` (WIP) | Gwenda Dev `staging` / `production` | drafts overlay / published | `npm run studio:dev` |
| **Prod preview** | `main` | prod `staging` | published only | [gwenda-dev.sanity.studio](https://gwenda-dev.sanity.studio) (the name predates Gwenda Dev) |
| **Prod** | promote only (`release` pointer) | prod `production` (copied from staging by ops Update website) | published only | [gwenda.sanity.studio](https://gwenda.sanity.studio) (schema; do not edit live content) |

Data only moves by copying between environments: `npm run dev:refresh` copies prod into dev (Sanity and both Baserow databases), `npm run preview:refresh:baserow-web` refreshes the preview's Website DB.

## Workflow

1. **Local** — `npm run studio:dev` and `npm run web:dev` on `develop`. Leave WIP as drafts. CI verifies. There is no hosted development site.
2. **Publish**, then **promote to staging** — rebuilds gwenda-staging from published staging documents (and deploys `main` site code).
3. **Review** https://gwenda-staging.pages.dev.
4. **Publish live** — ops **Website → Staging → live** diffs published staging against production, copies what you pick (or everything), then rebuilds gwenda.co.uk.

### Website code releases

1. Merge to `main`: CI deploys gwenda-staging and runs the deep smoke test (databases, config, Gmail login).
2. Merge `main` into `release`: CI builds the **production preview** (https://release-preview.gwenda-blue.pages.dev, live settings) and runs the deep smoke test, sending a test email to alerts@gwenda.co.uk.
3. Check the preview, then run **Web promote** by hand to put it live (it rebuilds from `release` and runs the same checks).

### Publishing from ops (editor flow)

The ops editor is not technical, so ops uses plain words: *preview site* (gwenda-staging) and *website* (gwenda.co.uk).

1. **Save** an event: it goes on the preview site (published in `staging`).
2. **Put on website** (event header): shows what changes in plain words, then puts that event on the preview site and copies only its documents (series, nights, removed nights, and anything they reference that changed) to `production`. Skipping the preview check is allowed.
3. **Delete** asks "Also take it off the website now?" when the event is on the website.
4. The **Website** page (menu, with a badge) shows whether gwenda.co.uk is up to date, what is waiting, and anything saved but not put on the website ("Put all on the website").

**Builds are batched.** Putting something on the website changes the data at once (What's on reads it live), but static pages (night, series, artist pages) wait for a build. Each build records a snapshot of what it was made from (`scripts/site-build-snapshot.mjs`, config key `site.build_snapshot`, Service `web`, Env = site). Ops compares current data with it: that is the badge count. The site-deploy webhook's cron calls ops `/api/web/tick` every 5 minutes; a site with pending changes and **10 quiet minutes** gets one build. One automatic retry after a failure, then the page asks the editor to press *Try again*. *Update website now* skips the wait. Scheduler state: config key `site.auto_update` (Service `ops`).

### Developer tools (admins)

Settings → Developer tools (`/web/dev`), for emails listed in config `ops.admin_emails` (Service `ops`; everyone in local ops):

- **Content**: published documents that differ, field by field; copy either way (publish to live, or reset staging from live).
- **Code**: commits on staging that live lacks (webhook `/compare`). Code ships when `release` moves.
- **Databases**: Baserow production vs its copies (Ops 556507 vs Gwenda Dev 560292; Website 461843 vs Website Staging 564496), table by table; **Copy production over it** runs `baserow-copy.yml`.

### Ops events and local ops

- **Hosted ops:** saving an event stages it (writes its series and nights to `staging`, published). What's on on gwenda-staging reads that live; the rest of the preview site updates after 10 quiet minutes. The website changes only through Put on website or the Website page.
- **Local ops** (`SITE_ENV=local`) works exactly like hosted ops, in **Gwenda Dev**: Save writes published `staging`, Update website copies to Gwenda Dev `production`. It refuses to write the real project (403), and it never starts GitHub builds or database copies. `npm run ops:dev` sets the dev project and warns if `SANITY_API_TOKEN` can't open it (the token is `SANITY_API_TOKEN__LOCAL` in Secrets Manager). `npm run ops:prod` is the real project and production data.

Local `.env` uses `SANITY_PROJECT_ID=gwscpagy` and `SANITY_DATASET=staging`. Do not edit the real production dataset in Studio.

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
SANITY_PROJECT_ID=gwscpagy   # Gwenda Dev
SANITY_DATASET=staging
# SANITY_API_TOKEN comes from .env.secrets: SANITY_API_TOKEN__LOCAL (Gwenda Dev Editor robot)
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
| `npm run studio:dev` | `staging` → localhost:3333 (drafts in `npm run web:dev`) |
| `npm run studio:deploy:preview` | `staging` → gwenda-dev.sanity.studio (main CI) |
| `npm run studio:deploy:preview` | alias of `studio:deploy:dev` |
| `npm run studio:deploy:prod` | `production` → gwenda.sanity.studio |

Hosted Studio deploys get extra vars from GitHub Actions secrets (see `studio.yml`).

## First-time setup

The project already has `staging` and `production`. Growth allows two datasets. Do not create a third.

Pull secrets with `npm run env:pull` (Bitwarden note `ark/.env.local`), then `npm run env:secrets:pull`. See [docs/env.md](env.md).

## Local commands

```bash
npm run studio:dev              # localhost Studio → Gwenda Dev staging
npm run web:dev                 # site → Gwenda Dev staging, drafts overlay
npm run web:dev:live            # site → Gwenda Dev production (:4322)
npm run ops:dev                 # ops → dev Ops DB + Gwenda Dev
npm run ops:prod                # ops on your machine with REAL production data
npm run dev:refresh             # copy real data into dev (Sanity + both Baserow DBs)
npm run studio:deploy:preview   # hosted Studio for prod's preview (main CI)
npm run studio:deploy:prod      # hosted Studio for prod
```

We're live: data is never seeded, only copied between environments.

## Schema + content

Schema lives in git (`marketing/studio/schemaTypes/`). Queries in `marketing/web/src/lib/sanity/`. Content lives in two datasets: **staging** (local Studio, Dev Studio, ops writes, staging site) and **production** (published staging documents copied from ops Website → Staging → live, live site). Do not edit production in Studio.


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
| Prod Studio | ops promote (or `npm run studio:deploy:prod`) |
| Staging content | publish in Studio, then rebuild gwenda-staging |
| Production content | ops Website → Staging → live (document copy), then production build |
| Dataset mirror | GitHub **Sanity** workflow (`sanity.yml`) |
| **Site rebuild** | Staging: automatic after event saves that add pages, or ops Website → Rebuild staging. Live: automatic after publishing from Staging → live |

## Deploy published content to the website

The static site reads **published** Sanity documents at build time. `npm run web:dev` overlays drafts so you can preview WIP without publishing. Publishing a document does not update gwenda-staging until the next staging rebuild.

### Editor workflow

1. Edit in **Dev Studio** (real staging). Leave WIP as drafts. Local Studio and `npm run web:dev` use the Gwenda Dev copy, so try changes there first.
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
npm run studio:deploy:prod   # uses SANITY_DEPLOY_TOKEN (CI secret, or .env.secrets locally)
```

