# Configuration layers

Gwenda separates **secrets**, **deploy-time vars**, and **runtime config**.

| Layer | Store | Examples |
|-------|--------|----------|
| Secrets | Bitwarden Secrets Manager → `.env` / `.env.ops` / CF secrets | API tokens, passwords, signing keys |
| Deploy-time plain config | `wrangler.toml` `[vars]` | `SITE_ENV`, marketing `BASEROW_DATABASE_ID`, SMTP host |
| Runtime non-secret config | Baserow **App Config** (ops first) | Pour targets, Sanity project/dataset, deploy webhook URL, Google OAuth **client id** |
| Marketing product flags | Sanity `siteSettings` | Booking / gallery toggles |

| File | Role |
|------|------|
| `.env` | Shared bootstrap + Password Manager leftovers + `ARK_LOCAL_BW_TOKEN` |
| `.env.ops` | Ops runtime secrets from Secrets Manager (`npm run env:ops:pull`) |
| `.env.web` | Marketing runtime secrets from Secrets Manager (`npm run env:web:pull`) |

Ops scripts and `npm run dev -w @gwenda/ops` load `.env` then `.env.ops` (ops wins).
Marketing / Studio via `with-env` load `.env` then `.env.web` (web wins).

## Ops Baserow workspaces

Ops uses **two Baserow workspaces** so a local token cannot see production data:

| Env | Workspace | Database id | Token (SM) |
|-----|-----------|-------------|------------|
| production | `Gwenda` (`208709`) | Ops DB `556507` | `BASEROW_API_KEY_PRODUCTION` |
| local | `Gwenda Dev` (Free) | Ops clone (see `.baserow-ops-dev.json`) | `BASEROW_API_KEY` |

Each workspace holds the **Gwenda Ops** database (and can later hold other domain DBs).

Second workspace is Free ($0; 3k rows). Clone once:

```bash
npm run clone:baserow-ops-dev          # or --force to wipe+recopy
```

Then mint/refresh scoped database tokens (script prints next steps). Local `ops-dev` **refuses** to start if `BASEROW_OPS_DATABASE_ID` is still the production id.

## Ops bootstrap

**Shared `.env`:**

- `ARK_LOCAL_BW_TOKEN` — ark-local machine-account access token (only local SM bootstrap)

**`.env.ops` (from SM + clone metadata):**

```bash
npm run env:ops:pull
```

Writes local `BASEROW_API_KEY`, OAuth/session secrets, `SANITY_API_TOKEN`, optional `OPS_LOCAL_ADMIN_PW` / `DEPLOY_WEBHOOK_SECRET`, and keeps `BASEROW_OPS_DATABASE_ID` for the dev clone.

**Not hand-edited for production:**

| Value | Where |
|-------|--------|
| Prod `BASEROW_OPS_DATABASE_ID` | `ops/site/wrangler.toml` `[vars]` = `556507` |
| Prod Baserow token | SM `BASEROW_API_KEY_PRODUCTION` → Pages via `ops-secrets` |
| `CLOUDFLARE_ACCOUNT_ID` / CF tokens | Shared `.env` (deploy tooling) |
| `SITE_ENV` | `local` via ops-dev; `production` in wrangler `[vars]` |

**Ops table ids are not configured.** Names are resolved from the Baserow catalog.

**Ops plain settings** (not secrets) come from App Config:

| Key | Meaning |
|-----|---------|
| `pour_target.*` | House pour-cost % by drink type |
| `sanity.project_id` | Sanity project |
| `sanity.dataset` | Per-env dataset (`local`/`staging` → development, `production` → production) |
| `site_deploy.webhook_url` | Studio → site rebuild webhook base URL |
| `google.oauth_client_id` | Google OAuth client id (public-ish; secret stays in SM) |

Do **not** put credentials in App Config.

```bash
npm run clone:baserow-ops-dev                    # once: Free workspace + data copy
npm run env:ops:pull                             # SM → .env.ops (local key)
npm run setup:baserow-ops                        # seed/repair App Config (JWT)
gh workflow run ops-secrets.yml                  # SM prod key → Pages
```

## Marketing

Subscribe, RSVP, and form submission tables are resolved **by name** (`Subscribers`, `Event Invites`, `Form Submissions`). Wrangler `[vars]` only carries `BASEROW_DATABASE_ID` (prod `461843`, staging/dev `465058`) to disambiguate when the token sees both databases.

```bash
npm run env:web:push                             # seed SM from filled .env keys (once)
npm run env:web:pull                             # SM → .env.web (local key)
npm run setup:baserow-form-submissions           # create/repair Form Submissions table (JWT)
gh workflow run web-secrets.yml -f profile=staging
gh workflow run web-secrets.yml -f profile=production
```

SM stores the marketing Baserow token as `BASEROW_API_KEY_MARKETING` (ops Free-workspace `BASEROW_API_KEY` cannot see Subscribers). Apple Wallet PEMs stay on GitHub for now.

SMTP host/port/user remain in marketing wrangler `[vars]`. Form From / Reply-To / notify addresses live on the Sanity `form` document. Only `SMTP_PASSWORD` is a Secrets Manager / Pages secret.

## Bitwarden Secrets Manager

| Project | Id | Used by |
|---------|----|---------|
| **Ark/Ops** | `ea9095b4-8226-4dec-96c3-b4c8008b0b6b` | `npm run env:ops:pull` · `ops-secrets.yml` |
| **Ark/Web** | `d7881774-3a4c-4603-97e3-b4c8010fd860` | `npm run env:web:pull` / `env:web:push` · `web-secrets.yml` |

Override with `BWS_OPS_PROJECT_ID` / `BWS_WEB_PROJECT_ID` if needed.

1. Machine accounts: `ark-local` (read/write), `ark-ci` (read). Grant each account access to both projects.
2. Access tokens: `ark-local-devcontainer`, `ark-ci-github-actions`.
3. Local: `ARK_LOCAL_BW_TOKEN` in shared `.env`, then `npm run env:ops:pull` / `npm run env:web:pull`.
4. CI: store `BWS_ACCESS_TOKEN` as a **repo** GitHub secret (prefer ark-ci; must reach Ark/Ops and Ark/Web). Also keep `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` for deploy and secret sync. Do **not** mirror app secrets (`SMTP_PASSWORD`, `SITE_PASSWORD`, …) into GitHub.
5. Sync to Cloudflare Pages (manual / after rotation):

```bash
gh workflow run ops-secrets.yml
gh workflow run web-secrets.yml -f profile=production
```

Deploy workflows (`web.yml`, `web-promote.yml`) ship code only. They do not push Pages secrets.
