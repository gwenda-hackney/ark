# Configuration layers

Gwenda separates **secrets**, **deploy-time vars**, and **runtime config**.

| Layer | Store | Examples |
|-------|--------|----------|
| Secrets | Bitwarden Secrets Manager → `.env.ark` / `.env.ops` / `.env.web` / Cloudflare Pages secrets | API tokens, passwords, signing keys |
| Deploy-time plain config | `wrangler.toml` `[vars]` | `SITE_ENV`, SMTP host |
| Runtime non-secret config | Baserow **Gwenda Config** database (one table, profiled by Env + Service) | Pour targets, Sanity project/dataset, dev notify inbox, web origin for ops |
| Marketing product flags | Sanity `siteSettings` | Booking / gallery toggles |

| File | Role |
|------|------|
| `.env` | Shared bootstrap + Password Manager leftovers + `ARK_LOCAL_BW_TOKEN` |
| `.env.ark` | Org Cloudflare tokens (`npm run env:ark:pull`) |
| `.env.ops` | Ops runtime secrets (`npm run env:ops:pull`) |
| `.env.web` | Marketing runtime secrets (`npm run env:web:pull`) |

Ops scripts and `npm run dev -w @gwenda/ops` load `.env` then `.env.ark` then `.env.ops` (ops wins).
Marketing / Studio via `with-env` load `.env` then `.env.ark` then `.env.web` (web wins).

## Secrets: one naming rule

Bitwarden Secrets Manager has no per-env secrets, so env is encoded in the name:

| SM name | Meaning |
|---------|---------|
| `NAME` | Shared by every env |
| `NAME__LOCAL` / `NAME__STAGING` / `NAME__PRODUCTION` | Override for that env. Wins over `NAME`. |

A pull for env `E` lists every SM project, keeps `NAME` and `NAME__E`, and lets the override win. That is the whole merge. Per-env credentials (Baserow tokens, `FORMS_ADMIN_SECRET`) have **no** shared `NAME`, so a missing override is reported as missing instead of silently using another env's value.

Which runtime keys each app gets is a manifest in `scripts/lib/bitwarden-sm.mjs` (`APP_SECRETS`). When a runtime key differs from the SM name, the manifest renames it:

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
npm run env:ops:pull                          # env=local → .env.ops
npm run env:web:pull -- --env staging --dry-run
npm run env:web:push -- FORMS_ADMIN_SECRET    # .env.web → SM (shared name unless --profile)
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
| Env | `all`, `local`, `staging`, `production` |
| Service | `all`, `ops`, `web` |

For a given env and service the most specific row wins: a matching Env beats a matching Service, which beats `all`. Resolution lives in `shared/config-db.js` and is used by ops (`Service=ops`) and marketing Pages Functions (`Service=web`). Values are cached for 60 seconds per isolate.

A runtime's env comes from `SITE_ENV` (or `PUBLIC_IS_STAGING`). Local ops (`ops-dev`) and local Astro forms set `SITE_ENV=local`; hosted sites set it in wrangler `[vars]`. When a runtime writes (e.g. ops `/config` pour targets) it only creates or updates **its own Env** row, never `all` or another env.

Every env reads with the same token, SM `BASEROW_CONFIG_API_KEY` (Ark, shared). It can only see this database. If it is missing, readers fall back to code defaults and env vars.

| Key | Env / Service | Meaning |
|-----|---------------|---------|
| `pour_target.*` | all, then per env / ops | House pour-cost % by drink type. Seeded as `all`; saving at ops `/config` writes that env's row. |
| `sanity.project_id` | all / all | Sanity project |
| `sanity.dataset` | per env / ops | Default dataset. Editorial writes always go to `staging`. |
| `site_deploy.webhook_url` | all / ops | Studio → site rebuild webhook base URL |
| `google.oauth_client_id` | all / ops | Google OAuth client id (secret stays in SM) |
| `google.drive_events_folder_id` | local, production / ops | Shared Drive folder for event galleries (`Events-dev/` vs `Events/`) |
| `google.calendar_id` | local, production / ops | Calendar that receives ops nights (dev vs live) |
| `lightspeed.archive_skus` | per env / ops | Lightspeed SKUs archived from the ops stock view |
| `web.origin` | local, production / ops | Marketing site ops calls for form resends |
| `forms.notify_email` | local, staging / web | Sends every form notification here instead of the Sanity form's address. Production has no row, so it uses the form's own notify address. |

Do **not** put credentials here.

```bash
npm run setup:baserow-config            # create/repair DB, table, fields, seed rows (JWT)
npm run setup:baserow-config -- --token # also mint the read/write token into SM
```

## Ops Baserow workspaces

Ops uses **two Baserow workspaces** so a local token cannot see production data:

| Env | Workspace | Database id | Token (SM) |
|-----|-----------|-------------|------------|
| production | `Gwenda` (`208709`) | Ops DB `556507` | `BASEROW_OPS_API_KEY__PRODUCTION` |
| local | `Gwenda Dev` (Free) | Ops clone (see `.baserow-ops-dev.json`) | `BASEROW_OPS_API_KEY__LOCAL` |

Staging web reads the production Ops DB for artists, so `BASEROW_OPS_API_KEY__STAGING` holds the production Ops token.

```bash
npm run clone:baserow-ops-dev          # or --force to wipe+recopy
npm run clone:baserow-web-dev          # staging website DB into the same workspace
```

Then mint/refresh scoped database tokens (script prints next steps). Local `ops-dev` **refuses** to start if `BASEROW_OPS_DATABASE_ID` is still the production id. Clone and promote scripts do not touch config (it is in its own database).

**Not hand-edited for production:**

| Value | Where |
|-------|--------|
| Prod `BASEROW_OPS_DATABASE_ID` | `ops/site/wrangler.toml` `[vars]` = `556507` |
| Prod secrets | SM → Pages via `ops-secrets.yml` (then redeploy) |
| `SITE_ENV` | `local` via ops-dev; `production` in wrangler `[vars]` |

**Ops table ids are not configured.** Names are resolved from the Baserow catalog.

Gallery uploads and ops nights on Google Calendar use SM `GOOGLE_SERVICE_ACCOUNT_JSON` (runtime `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON`, account `gwenda-ops-drive@gwenda-ops.iam.gserviceaccount.com`). Each event folder holds a `gallery/` child, the only place event images are written in Drive; the What's on hero stays on the event in Baserow. The service account must be a Content manager on the Shared Drive and have **Make changes to events** on the calendar. Local ops can still override the calendar with `GOOGLE_CALENDAR_ID_LOCAL` in `.env.ops`.

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
npm run clone:baserow-web-dev                    # once: copy website DB into Gwenda Dev
npm run clone:baserow-web-staging                # once: Website Staging in the paid Gwenda workspace
npm run setup:baserow-form-submissions           # create/repair Form Submissions table (JWT)
```

## Form mail

Mail goes out through the Gmail API as `GMAIL_SERVICE_ACCOUNT_JSON` (domain-wide delegation). SMTP host/port/user stay in wrangler `[vars]`. Form From / Reply-To / notify addresses live on the Sanity `form` document; `forms.notify_email` in config overrides the notify address per env (dev inbox locally and on staging).

Each submission sends two emails: a **notification** to the team and a **receipt** to the applicant. After each one actually goes out (not a local dry run) the row is stamped in `Notify Sent` / `Receipt Sent`.

Ops `/forms` shows both stamps and can send or resend either email. Ops calls `POST {web.origin}/api/forms/admin/resend` with `{ rowId, kind: "notify" | "receipt" }` and `Authorization: Bearer FORMS_ADMIN_SECRET`. The site re-renders the email from the stored row and the Sanity form, sends it, and stamps the row. `FORMS_ADMIN_SECRET` is per env (`__LOCAL`, `__STAGING`, `__PRODUCTION`), and ops and web read the same one for their env.
