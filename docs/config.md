# Configuration layers

Gwenda separates **secrets**, **deploy-time vars**, and **runtime config**.

| Layer | Store | Examples |
|-------|--------|----------|
| Secrets | Bitwarden Secrets Manager → `.env.secrets` / Cloudflare Pages secrets | API tokens, passwords, signing keys |
| Deploy-time plain config | `wrangler.toml` `[vars]` | `SITE_ENV`, SMTP host |
| Runtime non-secret config | Baserow **Gwenda Config** database (one table, profiled by Env + Service) | Pour targets, Sanity project/dataset, dev notify inbox, web origin for ops |
| Marketing product flags | Sanity `siteSettings` | Booking / gallery toggles |

| File | Role |
|------|------|
| `.env` | `ARK_LOCAL_BW_TOKEN` + plain local settings (Password Manager note `ark/.env.local`) |
| `.env.secrets` | Every app secret under its SM name (`npm run env:secrets:pull`) |

Everything loads through `scripts/lib/load-env.mjs`: `.env`, then `.env.secrets`, then the app's runtime names from the rename table below. Marketing / Studio (`with-env`) get web names; ops scripts and `npm run ops:dev` (`with-ops-env`, `ops-dev`) get ops names.

## Secrets: one naming rule

Bitwarden Secrets Manager has no per-env secrets, so env is encoded in the name:

| SM name | Meaning |
|---------|---------|
| `NAME` | Shared by every env |
| `NAME__LOCAL` / `NAME__STAGING` / `NAME__PRODUCTION` | Override for that env. Wins over `NAME`. |

A pull for env `E` lists every SM project, keeps `NAME` and `NAME__E`, and lets the override win. That is the whole merge. Per-env credentials (Baserow tokens, `FORMS_ADMIN_SECRET`) have **no** shared `NAME`, so a missing override is reported as missing instead of silently using another env's value.

Which runtime keys each app gets is a manifest in `scripts/lib/bitwarden-sm.mjs` (`APP_SECRETS`). When a runtime key differs from the SM name, the manifest renames it (locally in `load-env.mjs`, in CI via `--github-env`):

| App | Runtime key | SM name |
|-----|-------------|---------|
| ops | `BASEROW_API_KEY` | `BASEROW_OPS_API_KEY__<ENV>` |
| ops | `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` | `GOOGLE_SERVICE_ACCOUNT_JSON` |
| web | `BASEROW_API_KEY` | `BASEROW_WEBSITE_API_KEY__<ENV>` |
| web | `GMAIL_SERVICE_ACCOUNT_JSON` | `GOOGLE_SERVICE_ACCOUNT_JSON` |

Everything else uses the same name at runtime and in SM. The same manifest drives local pulls (`env:<app>:pull`), CI pulls (`--github-env`) and the Cloudflare Pages sync (`setup:ops`, `sync-pages-secrets.mjs`), so there is one list to edit.

Projects only record ownership (`SECRET_OWNERS`). A key must live in exactly one project; the pull fails if the same name appears in two.

| Project | Id | Owns |
|---------|----|------|
| **Ark** | `b9de9355-0a8f-45e7-b5fe-b4ca00eff281` | Cloudflare tokens, `BASEROW_CONFIG_API_KEY` |
| **Ark/Ops** | `ea9095b4-8226-4dec-96c3-b4c8008b0b6b` | `BASEROW_OPS_API_KEY__*`, Google service account + OAuth secret, ops session/bypass, Lightspeed |
| **Ark/Web** | `d7881774-3a4c-4603-97e3-b4c8010fd860` | `BASEROW_WEBSITE_API_KEY__*`, `FORMS_ADMIN_SECRET__*`, Sanity, deploy webhook, subscribe, SMTP, site gate, Instagram |

Override project ids with `BWS_ARK_PROJECT_ID` / `BWS_OPS_PROJECT_ID` / `BWS_WEB_PROJECT_ID` if needed.

```bash
npm run env:secrets:pull                      # env=local → .env.secrets
npm run env:secrets:pull -- --env staging --dry-run
npm run env:web:push -- FORMS_ADMIN_SECRET    # .env.secrets → SM (shared name unless --profile)
npm run env:web:push -- --profile local FORMS_ADMIN_SECRET   # → FORMS_ADMIN_SECRET__LOCAL
```

Machine accounts: `ark-local` (read/write), `ark-ci` (read), both with access to all three projects. Local bootstrap is `ARK_LOCAL_BW_TOKEN` in shared `.env`; CI uses repo secret `BWS_ACCESS_TOKEN`. Do not mirror app secrets into GitHub.

Sync to Cloudflare Pages (manual, after rotation):

```bash
gh workflow run ops-secrets.yml                     # production ops
gh workflow run web-secrets.yml -f profile=staging
gh workflow run web-secrets.yml -f profile=production
```

Deploy workflows (`web.yml`, `web-promote.yml`) ship code only. They do not push Pages secrets.

## Runtime config: Gwenda Config database

Non-secret settings live in one Baserow database, **Gwenda Config** (`569392`, table `Config`, workspace `Gwenda`). It sits outside the Ops and Website databases, so cloning or promoting data between envs (for example prod Ops → dev Ops) never copies config.

| Column | Values |
|--------|--------|
| Name | Dotted key, e.g. `forms.notify_email` |
| Value | String |
| Env | `all`, `dev`, `staging` (prod's preview), `production` |
| Service | `all`, `ops`, `web` |

### The config service

All code reads settings through **`shared/config.js`**, never the database directly (`shared/config.test.js` fails the build otherwise). It decides where each value comes from, in order:

1. **Worked out.** Some settings are never stored: `web.origin` comes from the environment's website (`shared/site-urls.js`: prod → gwenda.co.uk, dev → gwenda-web-dev, a developer's machine → localhost:4321). Safe: it's a fixed list in code, never taken from a request.
2. **A developer's own value.** On a developer's machine (`SITE_ENV=local`, set by `npm run ops:dev` / `web:dev`), settings marked `local` read that developer's `.env`. `npm run env:pull` writes a `SET-ME` placeholder for any that are missing, and `ops:dev` / `web:dev` refuse to start until it's replaced. These are never pushed to the shared Bitwarden note.
3. **The Config database.** This environment's row, else the `all` row. A developer's machine reads the **dev** rows: dev settings are its defaults.

The environment comes from `SITE_ENV` (or `PUBLIC_IS_STAGING`): `dev` (hosted dev), `local` (a developer's machine, which is dev), `staging`, `production`. A runtime writes only its own Env row (e.g. ops `/config` pour targets). Values are cached for 60 seconds per isolate. Every env reads with the same token, SM `BASEROW_CONFIG_API_KEY` (Ark, shared), which only sees this database.

Ops **Developer tools → Settings** lists every setting for each environment and where its value comes from.

| Key | Env / Service | Meaning | On a developer's machine |
|-----|---------------|---------|--------------------------|
| `pour_target.*` | all, then per env / ops | House pour-cost % by drink type. Saving at ops `/config` writes that env's row. | dev rows |
| `sanity.project_id` | all, dev / all | Sanity project (dev: Gwenda Dev) | dev row |
| `site_deploy.webhook_url` | all / ops | Deploy webhook Worker | |
| `google.oauth_client_id` | all / ops | Google OAuth client id (secret stays in SM) | |
| `google.drive_events_folder_id` | dev, production / ops | Drive folder for event galleries (`Events-dev/` vs `Events/`) | dev row |
| `google.calendar_id` | dev, production / ops | Calendar that receives ops nights | dev row |
| `lightspeed.archive_skus` | per env / ops | Lightspeed SKUs archived from the ops stock view | |
| `ops.admin_emails` | all / ops | Who sees Developer tools (everyone in dev) | |
| `web.origin` | worked out | Website ops calls for form resends | `http://localhost:4321` |
| `forms.notify_email` | dev, staging / web | Form notifications outside production: `alerts@gwenda.co.uk`. Required outside production (none means no email). Production has no row: each form's own address. | **`FORMS_NOTIFY_EMAIL`** in `.env` (your email) |

Do **not** put credentials here.

```bash
npm run setup:baserow-config            # create/repair DB, table, fields, seed rows (JWT). Additive only.
npm run setup:baserow-config -- --token # also mint the read/write token into SM
```

**Breaking config changes happen after the deploy.** The code still running may read a row until the new code is live. So: add what both versions need first (`setup:baserow-config` only adds), deploy, then remove the old. Retired settings are listed in `RETIRED_SETTINGS` (`shared/config.js`); `scripts/config-post-deploy.mjs` removes their rows, and CI runs it after the prod ops deploy (`apps.yml`).

### Machine state in Gwenda Config

A few rows are written by code, not people. Leave them alone:

| Key | Service | Env | Written by | Holds |
|---|---|---|---|---|
| `site.build_snapshot` (`.dev` for the dev website) | web | the site: staging (preview) / production (live) | deploy job (`site-build-snapshot.mjs`) | What the last build was made from |
| `site.auto_update` (`.dev` for dev ops) | ops | the site: staging / production | ops scheduler tick | Quiet timer, running build, failures |
| `site.prep_failures` | ops | environment | ops website jobs | Events that couldn't be got ready for the website |
| `web.pages_secrets_fingerprint` | web | staging / production / dev | `sync-pages-secrets.mjs` | Hash of the last Pages secret sync; deploys skip the sync when unchanged |


## Ops Baserow workspaces

Ops uses **two Baserow workspaces** so a local token cannot see production data:

| Env | Workspace | Database id | Token (SM) |
|-----|-----------|-------------|------------|
| production | `Gwenda` (`208709`) | Ops DB `556507` | `BASEROW_OPS_API_KEY__PRODUCTION` |
| local | `Gwenda Dev` (Free) | Ops clone (see `.baserow-ops-dev.json`) | `BASEROW_OPS_API_KEY__LOCAL` |

Staging web reads the production Ops DB for artists, so `BASEROW_OPS_API_KEY__STAGING` holds the production Ops token.

```bash
npm run dev:refresh:baserow-ops          # or --force to wipe+recopy
npm run dev:refresh:baserow-web          # staging website DB into the same workspace
```

Then mint/refresh scoped database tokens (script prints next steps). Local `ops-dev` **refuses** to start if `BASEROW_OPS_DATABASE_ID` is still the production id. Clone and promote scripts do not touch config (it is in its own database).

**Not hand-edited for production:**

| Value | Where |
|-------|--------|
| Prod `BASEROW_OPS_DATABASE_ID` | `ops/site/wrangler.toml` `[vars]` = `556507` |
| Prod secrets | SM → Pages via `ops-secrets.yml` (then redeploy) |
| `SITE_ENV` | `local` via ops-dev; `production` in wrangler `[vars]` |

**Ops table ids are not configured.** Names are resolved from the Baserow catalog.

Gallery uploads and ops nights on Google Calendar use SM `GOOGLE_SERVICE_ACCOUNT_JSON` (runtime `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON`, account `gwenda-ops-drive@gwenda-ops.iam.gserviceaccount.com`). Each event folder holds a `gallery/` child, the only place event images are written in Drive; the What's on hero stays on the event in Baserow. The service account must be a Content manager on the Shared Drive and have **Make changes to events** on the calendar. Local ops can still override the calendar with `GOOGLE_CALENDAR_ID_LOCAL` in `.env`.

## Marketing Baserow workspaces

Marketing uses the same two workspaces so a local/staging token cannot see live subscribers:

| Env | Workspace | Database id | Token (SM) |
|-----|-----------|-------------|------------|
| production | `Gwenda` (`208709`) | Website DB `461843` | `BASEROW_WEBSITE_API_KEY__PRODUCTION` |
| staging | `Gwenda` (`208709`) | Website Staging `564496` | `BASEROW_WEBSITE_API_KEY__STAGING` |
| local | `Gwenda Dev` (Free) | Website clone (see `.baserow-web-dev.json`) | `BASEROW_WEBSITE_API_KEY__LOCAL` |

Subscribe, RSVP, and form submission tables are resolved **by name** (`Subscribers`, `Event Invites`, `Form Submissions`). The token is scoped to that env's Website database, so runtime does not need a numeric database id. Do not copy subscriber or RSVP rows from staging to production.

Ops `/forms` reads the same Form Submissions table with runtime `BASEROW_WEBSITE_API_KEY` (same SM key, same env).

```bash
npm run dev:refresh:baserow-web                    # once: copy website DB into Gwenda Dev
npm run preview:refresh:baserow-web                # once: Website Staging in the paid Gwenda workspace
npm run setup:baserow-form-submissions           # create/repair Form Submissions table (JWT)
```

## Form mail

Mail goes out through the Gmail API as `GMAIL_SERVICE_ACCOUNT_JSON` (domain-wide delegation). SMTP host/port/user stay in wrangler `[vars]`. Form From / Reply-To / notify addresses live on the Sanity `form` document; `forms.notify_email` in config overrides the notify address per env (dev inbox locally and on staging).

Each submission sends two emails: a **notification** to the team and a **receipt** to the applicant. After each one actually goes out (not a local dry run) the row is stamped in `Notify Sent` / `Receipt Sent`.

Ops `/forms` shows both stamps and can send or resend either email. Ops calls `POST {web.origin}/api/forms/admin/resend` with `{ rowId, kind: "notify" | "receipt" }` and `Authorization: Bearer FORMS_ADMIN_SECRET`. The site re-renders the email from the stored row and the Sanity form, sends it, and stamps the row. `FORMS_ADMIN_SECRET` is per env (`__LOCAL`, `__STAGING`, `__PRODUCTION`), and ops and web read the same one for their env.
