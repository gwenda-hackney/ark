# Configuration layers

Gwenda separates **secrets**, **deploy-time vars**, and **runtime config**.

| Layer | Store | Examples |
|-------|--------|----------|
| Secrets | Bitwarden Secrets Manager → `.env` / `.env.ops` / CF secrets | API tokens, passwords, signing keys |
| Deploy-time plain config | `wrangler.toml` `[vars]` | `SITE_ENV`, marketing `BASEROW_TABLE_ID`, SMTP host |
| Runtime non-secret config | Baserow **App Config** (ops first) | Pour targets, Sanity project/dataset, deploy webhook URL, Google OAuth **client id** |
| Marketing product flags | Sanity `siteSettings` | Booking / gallery toggles |

## Interim: two env files

While marketing is still on the old pattern:

| File | Role |
|------|------|
| `.env` | Marketing / shared + `ARK_LOCAL_BW_TOKEN` (SM bootstrap) |
| `.env.ops` | Ops runtime secrets from Secrets Manager (`npm run env:ops:pull`) |

Ops scripts and `npm run dev -w @gwenda/ops` load `.env` then `.env.ops` (ops wins). Marketing keeps using `.env` alone.

## Ops bootstrap

**Shared `.env`:**

- `ARK_LOCAL_BW_TOKEN` — ark-local machine-account access token (only local SM bootstrap)

**`.env.ops` (from SM, not hand-edited):**

```bash
npm run env:ops:pull
```

Writes `BASEROW_API_KEY`, OAuth/session secrets, `SANITY_API_TOKEN`, optional `OPS_LOCAL_ADMIN_PW` / `DEPLOY_WEBHOOK_SECRET`, etc.

**Not in `.env.ops`:**

| Value | Where |
|-------|--------|
| `BASEROW_OPS_DATABASE_ID` | `ops/site/wrangler.toml` `[vars]` |
| `BASEROW_WORKSPACE_ID` | Shared `.env` (schema setup only) |
| `CLOUDFLARE_ACCOUNT_ID` / CF tokens | Shared `.env` (deploy tooling; CF token may also live in SM for other uses) |
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
npm run env:ops:pull                             # SM → .env.ops
npm run setup:baserow-ops                        # seed/repair App Config
npm run setup:ops                                # push ops secrets to Pages
```

## Marketing (unchanged for now)

Subscribe table id, SMTP host/port, invite URLs stay in marketing wrangler `[vars]` + `.env`. Migrate marketing to App Config in a later pass.

## Bitwarden Secrets Manager

1. Project with credential secrets only (keys named like env vars: `BASEROW_API_KEY`, …).
2. Machine accounts: `ark-local` (read/write), `ark-ci` (read).
3. Access tokens: `ark-local-devcontainer`, `ark-ci-github-actions`.
4. Local: `ARK_LOCAL_BW_TOKEN` in shared `.env`, then `npm run env:ops:pull`.
5. CI: store `ARK_CI_BW_TOKEN` (or `BWS_ACCESS_TOKEN`) as a GitHub secret; job runs `npm run env:ops:pull -- --env-only` (or injects into the job env) before `npm run setup:ops`.
