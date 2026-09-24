# Configuration layers

Gwenda separates **secrets**, **deploy-time vars**, and **runtime config**.

| Layer | Store | Examples |
|-------|--------|----------|
| Secrets | Bitwarden Secrets Manager → `.env.ark` / `.env.ops` / `.env.web` / CF secrets | API tokens, passwords, signing keys |
| Deploy-time plain config | `wrangler.toml` `[vars]` | `SITE_ENV`, SMTP host |
| Runtime non-secret config | Baserow **App Config** (ops first) | Pour targets, Sanity project/dataset, deploy webhook URL, Google OAuth **client id** |
| Marketing product flags | Sanity `siteSettings` | Booking / gallery toggles |

| File | Role |
|------|------|
| `.env` | Shared bootstrap + Password Manager leftovers + `ARK_LOCAL_BW_TOKEN` |
| `.env.ark` | Org Cloudflare tokens from Secrets Manager (`npm run env:ark:pull`) |
| `.env.ops` | Ops runtime secrets from Secrets Manager (`npm run env:ops:pull`) |
| `.env.web` | Marketing runtime secrets from Secrets Manager (`npm run env:web:pull`) |

Ops scripts and `npm run dev -w @gwenda/ops` load `.env` then `.env.ark` then `.env.ops` (ops wins).
Marketing / Studio via `with-env` load `.env` then `.env.ark` then `.env.web` (web wins).

## Ops Baserow workspaces

Ops uses **two Baserow workspaces** so a local token cannot see production data:

| Env | Workspace | Database id | Token (SM) |
|-----|-----------|-------------|------------|
| production | `Gwenda` (`208709`) | Ops DB `556507` | `BASEROW_API_KEY_PRODUCTION` |
| local | `Gwenda Dev` (Free) | Ops clone (see `.baserow-ops-dev.json`) | `BASEROW_API_KEY_LOCAL` → `.env.ops` `BASEROW_API_KEY` |

Never fall back across envs: Pages must use `_PRODUCTION`; local must use `_LOCAL`. Legacy SM key `BASEROW_API_KEY` is accepted as local-only (`npm run env:ops:pull -- --migrate-sm` copies it to `_LOCAL`).

Each workspace holds the **Gwenda Ops** database and, in Dev, the staging website database.

Second workspace is Free ($0; 3k rows). Clone once:

```bash
npm run clone:baserow-ops-dev          # or --force to wipe+recopy
npm run clone:baserow-web-dev          # staging website DB into the same workspace
```

Then mint/refresh scoped database tokens (script prints next steps). Local `ops-dev` **refuses** to start if `BASEROW_OPS_DATABASE_ID` is still the production id.

## Ops bootstrap

**Shared `.env`:**

- `ARK_LOCAL_BW_TOKEN` — ark-local machine-account access token (only local SM bootstrap)

**`.env.ops` (from SM + clone metadata):**

```bash
npm run env:ops:pull
```

Writes local `BASEROW_API_KEY` (from SM `_LOCAL`), keeps `BASEROW_API_KEY_PRODUCTION` alongside for Pages, plus OAuth/session secrets and (from Ark/Web) `SANITY_API_TOKEN` / `DEPLOY_WEBHOOK_SECRET`. Keeps `BASEROW_OPS_DATABASE_ID` for the dev clone. Also refreshes `.env.ark`.

```bash
npm run env:ops:pull                              # profile=local
npm run env:ops:pull -- --migrate-sm              # once: legacy BASEROW_API_KEY → _LOCAL
npm run env:ops:pull -- --profile production      # fail if PRODUCTION missing
```

**Not hand-edited for production:**

| Value | Where |
|-------|--------|
| Prod `BASEROW_OPS_DATABASE_ID` | `ops/site/wrangler.toml` `[vars]` = `556507` |
| Prod Baserow token | SM `BASEROW_API_KEY_PRODUCTION` → Pages `BASEROW_API_KEY` via `ops-secrets` (then redeploy) |
| `CLOUDFLARE_ACCOUNT_ID` / CF tokens | SM Ark → `.env.ark` (GitHub still has copies for deploy jobs) |
| `SITE_ENV` | `local` via ops-dev; `production` in wrangler `[vars]` |

**Ops table ids are not configured.** Names are resolved from the Baserow catalog.

**Ops plain settings** (not secrets) come from App Config:

| Key | Meaning |
|-----|---------|
| `pour_target.*` | House pour-cost % by drink type |
| `sanity.project_id` | Sanity project |
| `sanity.dataset` | Optional default. Editorial writes always go to `staging`. Production is clone-only. |
| `site_deploy.webhook_url` | Studio → site rebuild webhook base URL |
| `google.oauth_client_id` | Google OAuth client id (public-ish; secret stays in SM) |
| `google.drive_events_folder_id` | Shared Drive folder for event galleries. Hero images stay in Baserow and are not copied here. **Env-specific**: `production` → `Events/`, `local` → `Events-dev/`. Not an env var. |
| `google.calendar_id` | Google Calendar that receives ops nights. **Env-specific**: production is the live calendar, local is the dev calendar. |

Lightspeed Back Office export (`LIGHTSPEED_BO_EMAIL`, `LIGHTSPEED_BO_PASSWORD`, optional `LIGHTSPEED_BO_TOTP` / `LIGHTSPEED_OPS_EMAIL`) lives in **Ark/Ops** SM for the nest script and [Lightspeed item export](../.github/workflows/lightspeed-export.yml) Action. Do not put those on Pages or in App Config.

Gallery uploads use `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` in **Ark/Ops** (Pages + local). Each event folder holds a `gallery/` child, and that is the only place event images are written in Drive. The What's on hero stays on the event in Baserow. The service account must be a Content manager on the Shared Drive. Folder roots live only in App Config (`google.drive_events_folder_id` per Env).

Ops nights are written to Google Calendar with that same service account (`gwenda-ops-drive@gwenda-ops.iam.gserviceaccount.com`, calendar events scope only). The Calendar API must be enabled on GCP project `gwenda-ops`. The calendar is a secondary calendar, so Workspace **General** settings must allow outsiders to change secondary calendars, and the calendar is shared with that account as **Make changes to events**. Production reads `google.calendar_id` from App Config, and falls back to `GOOGLE_CALENDAR_ID` in `ops/site/wrangler.toml`. Local ops (`SITE_ENV=local`) uses the local App Config row, or `GOOGLE_CALENDAR_ID_LOCAL` in `.env.ops`. Saving or deleting a night updates that env's calendar. Website Publish stays separate.

Do **not** put credentials in App Config.

```bash
npm run clone:baserow-ops-dev                    # once: Free workspace + data copy
npm run env:ops:pull                             # SM → .env.ops (local key)
npm run setup:baserow-ops                        # seed/repair App Config (JWT)
gh workflow run ops-secrets.yml                  # SM prod key → Pages
```

## Marketing Baserow workspaces

Marketing uses the same two workspaces so a local/staging token cannot see live subscribers:

| Env | Workspace | Database id | Token (SM) |
|-----|-----------|-------------|------------|
| production | `Gwenda` (`208709`) | Website DB `461843` | `BASEROW_API_KEY_MARKETING_PRODUCTION` |
| staging | `Gwenda` (`208709`) | Website Staging `564496` | `BASEROW_API_KEY_MARKETING_STAGING` (falls back to `BASEROW_API_KEY_MARKETING` until minted) |
| local | `Gwenda Dev` (Free) | Website clone (see `.baserow-web-dev.json`) | `BASEROW_API_KEY_MARKETING` |

Subscribe, RSVP, and form submission tables are resolved **by name** (`Subscribers`, `Event Invites`, `Form Submissions`). The marketing token is scoped to that env's Website database, so runtime does not need a numeric database id. `BASEROW_DATABASE_ID` is optional (only if a token can see more than one table with the same name). Studio's RSVP grid URL still uses Baserow's numeric UI path.

```bash
npm run clone:baserow-web-dev                    # once: copy website DB into Gwenda Dev
npm run clone:baserow-web-staging                # once: Website Staging in the paid Gwenda workspace
npm run env:web:push                             # seed SM from filled .env keys (once)
npm run env:web:pull                             # SM → .env.web (Dev website key)
npm run setup:baserow-form-submissions           # create/repair Form Submissions table (JWT)
gh workflow run web-secrets.yml -f profile=staging
gh workflow run web-secrets.yml -f profile=production
```

SM `BASEROW_API_KEY_MARKETING` is the Gwenda Dev website token (local). Staging Pages uses `BASEROW_API_KEY_MARKETING_STAGING` when present. Production Pages and Mailchimp use `BASEROW_API_KEY_MARKETING_PRODUCTION`. Do not copy subscriber or RSVP rows from staging to production.

Ops `/forms` reads Form Submissions with that same token, written as `BASEROW_WEBSITE_API_KEY` by `npm run env:ops:pull` (local: `BASEROW_API_KEY_MARKETING`, Pages: `BASEROW_API_KEY_MARKETING_PRODUCTION`). It is not a separate Secrets Manager key.

SMTP host/port/user remain in marketing wrangler `[vars]`. Form From / Reply-To / notify addresses live on the Sanity `form` document. Only `SMTP_PASSWORD` is a Secrets Manager / Pages secret.

## Bitwarden Secrets Manager

Each secret lives in **one** owning project. Ops pull may **read** web-owned keys it consumes (`SANITY_API_TOKEN`, `DEPLOY_WEBHOOK_SECRET`). Do not copy those into Ark/Ops.

| Project | Id | Owns | Used by |
|---------|----|------|---------|
| **Ark** | `b9de9355-0a8f-45e7-b5fe-b4ca00eff281` | `CLOUDFLARE_DEV_API_TOKEN`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | `npm run env:ark:pull` / `env:ark:push`; also refreshed by ops/web pull |
| **Ark/Ops** | `ea9095b4-8226-4dec-96c3-b4c8008b0b6b` | Ops Baserow + OAuth/session | `npm run env:ops:pull` · `ops-secrets.yml` |
| **Ark/Web** | `d7881774-3a4c-4603-97e3-b4c8010fd860` | Marketing (Sanity, deploy webhook, SMTP, subscribe, …) | `npm run env:web:pull` / `env:web:push` · `web-secrets.yml` |

Override with `BWS_ARK_PROJECT_ID` / `BWS_OPS_PROJECT_ID` / `BWS_WEB_PROJECT_ID` if needed.

1. Machine accounts: `ark-local` (read/write), `ark-ci` (read). Grant each account access to **Ark**, **Ark/Ops**, and **Ark/Web**.
2. Access tokens: `ark-local-devcontainer`, `ark-ci-github-actions`.
3. Local: `ARK_LOCAL_BW_TOKEN` in shared `.env`, then `npm run env:ark:pull` / `env:ops:pull` / `env:web:pull`.
4. CI: store `BWS_ACCESS_TOKEN` as a **repo** GitHub secret (prefer ark-ci; must reach all three projects). Do **not** mirror Cloudflare or app secrets into GitHub; pull them from SM in the job.
5. Sync to Cloudflare Pages (manual / after rotation):

```bash
gh workflow run ops-secrets.yml
gh workflow run web-secrets.yml -f profile=production
```

Deploy workflows (`web.yml`, `web-promote.yml`) ship code only. They do not push Pages secrets.
