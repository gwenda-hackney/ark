# Sanity CMS

Sanity is Gwenda's **editorial layer**: website data and copy that editors own, distinct from site code in git.

Two projects on [sanity.io/manage](https://www.sanity.io/manage), both on the **Free** plan, each with **one dataset, `production`**:

- **Gwenda Web** (`pn5yjro6`): the real website.
- **Gwenda Dev** (`gwscpagy`): a copy for dev. Dev ops, the dev website and local Studio use it, so dev runs exactly the prod flow (Save, then Put on website) and can never reach gwenda.co.uk. Refresh it from the real project with `npm run dev:refresh:sanity` (your personal `npx sanity login`; the real project is only read).

## Drafts are the preview

Nothing is copied between datasets. Every change starts as a Sanity **draft** (`drafts.<id>`); publishing turns the draft into the document the website shows.

- **Ops Save** writes drafts. **Studio** only saves drafts: its publish, unpublish, delete and duplicate buttons are removed (`marketing/studio/sanity.config.ts`).
- **The preview site** shows drafts over published documents (Sanity perspective `previewDrafts`). **The live site** shows published documents only.
- **Ops publishes.** *Put on website* publishes one event's drafts (and anything they reference that also changed); *Website → Preview → live* publishes any or all. Developer tools can also discard drafts, so the preview matches live again.
- **Removals don't wait.** Deleting in ops removes the draft and the published document together: it comes off the preview and the website at once (the delete dialog says so).

Ops reads Sanity through the same two views (`ops/site/src/platform/sanity.js`: `preview`, `production`, and `raw` for both side by side), and turns every write into a draft write (`draftMutations`). Publishing and discarding are `release.js`.

## Environments

Two environments, **dev** and **prod**, built the same way. Each has one Sanity dataset, one Ops database and one Website database, and a website with a live site and a preview:

| | Sanity | Ops DB | Website DB | Ops app | Website |
|---|---|---|---|---|---|
| **Dev** | Gwenda Dev (`gwscpagy`) | Gwenda Dev · Gwenda Ops | Gwenda Dev · Website | [gwenda-ops-dev.pages.dev](https://gwenda-ops-dev.pages.dev), or `npm run ops:dev` | [gwenda-web-dev.pages.dev](https://gwenda-web-dev.pages.dev) (live) / [preview.gwenda-web-dev.pages.dev](https://preview.gwenda-web-dev.pages.dev) (preview); locally `npm run web:dev:live` / `npm run web:dev` |
| **Prod** | Gwenda Web (`pn5yjro6`) | Gwenda · Gwenda Ops | Gwenda · Website | gwenda-ops.pages.dev | [gwenda.co.uk](https://gwenda.co.uk) (live) / [preview.gwenda-blue.pages.dev](https://preview.gwenda-blue.pages.dev) (preview) |

**The preview is not an environment.** It is the same Pages project on its `preview` branch (wrangler `[env.preview.vars]`: `SITE_PREVIEW=true`, `SANITY_PERSPECTIVE=previewDrafts`), password-gated, with the ribbon. Everything else is the environment's own: prod's preview runs as `SITE_ENV=production`, so its forms write the real Website DB and send real emails, exactly like live. It is for checking content; test forms in dev.

**Dev** runs the code on `main`: every push deploys dev ops (`apps.yml`) and both dev website sites (`web.yml`). Dev ops' builds go to the dev website only (the deploy webhook routes `env: "dev"` requests to `web.yml` `dev-preview` / `dev-live`), with their own snapshot and scheduler keys (`site.build_snapshot.dev`, `site.auto_update.dev`). Both dev sites are password-gated. Form notifications outside prod go to `alerts@gwenda.co.uk` (config `forms.notify_email`, Env `dev`); on a developer's machine they go to that developer (`FORMS_NOTIFY_EMAIL`, defaulting to their git email). Outside prod, if neither is available nothing is sent rather than falling back to the form's real address. Hosted dev sets `SITE_ENV=dev`; a developer's machine is `SITE_ENV=local` and reads the dev settings plus its own `.env` values (see docs/config.md). Dev secrets in Secrets Manager end in `__DEV`.

**Prod** runs the code on `release`: ops, the hosted Studio, the preview and the live site.

Data only moves by copying prod into dev: `npm run dev:refresh` (Sanity with its drafts, and both Baserow databases).

## Workflows

### Content (the editor, every day)

The ops editor is not technical, so ops uses plain words: *preview site* and *website*.

1. **Save** an event: it goes on the preview site as drafts. What's on on the preview reads them live; the rest of the preview updates after 10 quiet minutes.
2. **Put on website** (event header): shows what changes in plain words, then publishes that event's drafts and anything they need. Skipping the preview check is allowed.
3. **Delete** takes it off the preview and the website at once.
4. The **Website** page (menu, with a badge) shows whether gwenda.co.uk is up to date, what is waiting, and anything saved but not put on the website ("Put all on the website").

**Builds are batched.** Publishing changes the data at once (What's on reads it live), but static pages (night, series, artist pages) wait for a build. Each build records a snapshot of what it was made from (`scripts/site-build-snapshot.mjs`, config key `site.build_snapshot`, Service `web`, Env = the site: `preview` or `production`). Ops compares current data with it: that is the badge count. The site-deploy webhook's cron calls ops `/api/web/tick` every 5 minutes; a site with pending changes and **10 quiet minutes** gets one build. One automatic retry after a failure, then the page asks the editor to press *Try again*. *Update website now* skips the wait. Scheduler state: config key `site.auto_update` (Service `ops`, Env = the site).

### Code (developers)

1. Merge to `main`: CI deploys dev (ops and both dev sites) with the unit tests and smoke tests. Unreleased code is tried there, against dev data. Other branches get a branch preview on the dev website.
2. Merge `main` into `release`: CI builds prod's **preview** from the release code on drafts over published, runs pre-deploy migrations, and runs the deep smoke test with a test email and a real play-form submission (both to alerts@, test row deleted).
3. Check the preview. Publish anything waiting in ops if it should go live with the code.
4. Run **Web promote** by hand: it rebuilds the live site from `release` and published documents, runs the checks, then the post-deploy migrations (docs/migrations.md).

### Developer tools (admins)

Settings → Developer tools (`/web/dev`), for emails listed in config `ops.admin_emails` (Service `ops`; everyone in local ops):

- **Content**: drafts that differ from what is live, field by field; publish them, or discard them.
- **Code**: commits the preview runs that live lacks (webhook `/compare`). Code ships on promote.
- **Databases**: Baserow production vs its dev copies (Gwenda Ops and Website in Gwenda vs their Gwenda Dev copies), table by table; **Copy production over it** runs `baserow-copy.yml`.

### Local ops

**Local ops** (`SITE_ENV=local`) works exactly like hosted ops, in **Gwenda Dev**: Save writes drafts, Update website publishes them. It refuses to write the real project (403), and it never starts GitHub builds or database copies. `npm run ops:dev` sets the dev project and warns if `SANITY_API_TOKEN` can't open it (the token is `SANITY_API_TOKEN__DEV` in Secrets Manager). `npm run ops:prod` is the real project and production data.

## Tokens

Sanity **robot / API tokens** on this plan are **Viewer**, **Editor**, and **Deploy Studio**. There is no **Developer** robot role in the manage UI (Developer is a human user role on Growth+). Every token that builds a preview or serves its What's on must read drafts; Viewer and Editor both can.

**Keep-set:**

| Label | Role | Where | Used for |
|-------|------|-------|----------|
| `ark-local-editor` | **Editor** | Secrets Manager `SANITY_API_TOKEN__DEV` (loaded after `bw-unlock`) | Local Studio, seeds. **Never** GitHub. |
| `ark-ci-viewer` | **Viewer** | GitHub `SANITY_API_TOKEN` | Site builds / content deploys |
| `ark-ci-deploy-studio` | **Deploy Studio** | GitHub + SM `SANITY_DEPLOY_TOKEN` | Hosted Studio deploys |

Mint, rotate, and revoke extras with a **personal** admin session (`npx sanity login`), not the local Editor robot:

```bash
npx sanity login
gh auth login -h github.com -p https -s repo,workflow
bw-unlock   # so it can store SANITY_DEPLOY_TOKEN in Secrets Manager
npm run setup:sanity-tokens -- --dry-run   # always look first: it revokes robots not in the keep-set
npm run setup:sanity-tokens
```

`setup:ci-secrets` is a deprecated alias that only refreshes CI tokens + GitHub secrets.

### Local

A machine uses Gwenda Dev (`gwscpagy`, dataset `production`) by default (`LOCAL_DEFAULTS` in `scripts/lib/load-env.mjs`); nothing goes in `.env`. `SANITY_API_TOKEN` comes from Secrets Manager: `SANITY_API_TOKEN__DEV` (Gwenda Dev Editor robot).

## Studio

`scripts/with-env.mjs` loads the local env (defaults and vault secrets, see [env.md](./env.md)) for Studio, web dev, and CLI, and maps shared names to `SANITY_STUDIO_*` build-time aliases:

| Name | Studio alias |
|-------------|--------------|
| `SANITY_PROJECT_ID` | `SANITY_STUDIO_PROJECT_ID` |
| `SANITY_DATASET` | `SANITY_STUDIO_DATASET` |

The project picks the Studio: the real project is **Gwenda** at [gwenda.sanity.studio](https://gwenda.sanity.studio); Gwenda Dev is **Gwenda (dev)**. Both edit drafts only.

| Command | What |
|---------|------|
| `npm run studio:dev` | Local Studio → localhost:3333, Gwenda Dev |
| `npm run studio:deploy` | Hosted Studio for the project in the environment (CI: the real one) |

The hosted Studio deploys with the release: Web promote redeploys it when its code changed, and `studio.yml` runs it by hand from `release`.

## Local commands

```bash
npm run studio:dev              # localhost Studio → Gwenda Dev
npm run web:dev                 # site → Gwenda Dev, drafts shown (the preview)
npm run web:dev:live            # site → Gwenda Dev, published only (:4322)
npm run ops:dev                 # ops → dev Ops DB + Gwenda Dev
npm run ops:prod                # ops on your machine with REAL production data
npm run dev:refresh             # copy real data into dev (Sanity + both Baserow DBs)
```

We're live: data is never seeded, only copied between environments.

## Schema + content

Schema lives in git (`marketing/studio/schemaTypes/`). Queries in `marketing/web/src/lib/sanity/`; the site reads the one dataset with the perspective each site uses (`SANITY_PERSPECTIVE`, set by the deploy).

| What | Goes live via |
|------|----------------|
| Schema + queries | git `develop` → `main` (dev) → `release` (preview) → Web promote (live) |
| Hosted Studio | Web promote, or `studio.yml` from `release` |
| Content | Save in ops or Studio (drafts, preview) → publish in ops |
| **Site rebuild** | Preview: automatic after changes go quiet, or ops *Update website now*. Live: automatic after publishing |

## Infrastructure

```
Ops → gwenda-site-deploy-webhook (Worker) → GitHub Actions → Cloudflare Pages
```

Worker: `marketing/site-deploy-webhook/` validates a shared secret, then dispatches preview rebuilds (`web.yml` from `main`; the preview job checks out `release`) and live builds (`web-promote.yml` on `release`).

| Endpoint | Role |
|---|---|
| `POST /deploy` | Preview rebuild (`target: preview`; `env: "dev"` rebuilds the dev preview). The old `target: staging` from ops before this change builds nothing. |
| `POST /promote` | Dispatch [Web promote](../.github/workflows/web-promote.yml) on `release`; `env: "dev"` rebuilds the dev live site instead. |
| `GET /status?run_id=` | Poll a run |

**Automated setup** (uses Secrets Manager + `gh`):

```bash
npm run setup:site-deploy
```

This generates `DEPLOY_WEBHOOK_SECRET`, pushes GitHub secrets and deploys the Worker. Ops reads the Worker URL from `SANITY_STUDIO_SITE_DEPLOY_URL` in its `wrangler.toml` and the config database.

Prerequisites: `bw-unlock` (for `CLOUDFLARE_API_TOKEN`), `gh auth login` with `repo,workflow` scopes.

| Secret / var | Role |
|---|---|
| `DEPLOY_WEBHOOK_SECRET` | Shared password — GitHub secret, Worker secret, ops |
| `DISPATCH_TOKEN` | GitHub PAT with Actions write — Worker uses it to trigger deploy workflows (setup uses `gh auth token`) |
| `SANITY_STUDIO_SITE_DEPLOY_URL` | Public Worker URL — GitHub secret + ops `wrangler.toml` |
