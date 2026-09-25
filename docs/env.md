# Local env from Bitwarden

Local secrets live in Bitwarden (`bitwarden.eu`), not in git. Do **not** mint new Cloudflare / Sanity / Baserow tokens on every fresh clone.

The Password Manager holds one note, `ark/.env.local`, in the Bitwarden folder **`ark`**. Staging and production secrets live only in Secrets Manager.

## Vault item names

Notes live in the Bitwarden folder **`ark`**:

| Bitwarden item | Folder | Seed template | Role |
|----------------|--------|---------------|------|
| `ark/.env.local` | `ark` | `scripts/env-templates/local.env` | Laptop / nest (default `env:pull`) |

The local note holds only the SM bootstrap token (`ARK_LOCAL_BW_TOKEN`) and plain local settings (Sanity project and dataset, site flags, SMTP host and user, UniFi console id, Studio deploy URL). Every credential comes from Secrets Manager into `.env.secrets`. Do not copy those back into `.env`.

`npm run env:seed` creates missing notes and moves existing ones into the `ark` folder.

## First-time seed

```bash
bw config server https://vault.bitwarden.eu   # once
bw login                                      # once
bw-unlock                                     # or: export BW_SESSION=$(bw unlock --raw)

npm run env:seed          # create ark/.env.local from the template (skip if it exists)
npm run env:pull          # write repo-root .env from ark/.env.local
npm run env:secrets:pull  # SM → .env.secrets (needs ARK_LOCAL_BW_TOKEN in .env)
```

In the devcontainer, `bw-unlock` writes the session key to `/commandhistory/.bw-session` (a Docker volume). New shells and env scripts reuse it, so you should not need to unlock again until `bw-lock`, `bw logout`, or a new login. Treat that file like a decrypted vault key. Override the path with `BW_SESSION_FILE`.

Set a local setting one at a time:

```bash
npm run env:set -- PUBLIC_OPENING_DATE 2026-08-01
# App and Cloudflare secrets belong in Secrets Manager, not the note:
npm run env:ark:push
npm run env:web:push -- KEY
```

Or push every non-empty key from local `.env` into the vault note:

```bash
bw-unlock                 # skip if already unlocked in this container
npm run env:push                 # upsert keys into the note
npm run env:push -- --replace    # overwrite the note with .env (drops removed keys)
```

`env:set` updates the vault note and merges into local `.env` (for `--env local`, the default).
`env:push` only writes vault ← local (skips `BITWARDEN_EMAIL` / `BITWARDEN_PASSWORD`).

Every script loads env through `scripts/lib/load-env.mjs`: `.env`, then `.env.secrets`, then (for an app) that app's runtime names. `with-env.mjs` uses the web names and `with-ops-env.mjs` / `ops-dev` the ops names. Production worker setup (`setup:wifi-portal`, `setup:subscribe-mailchimp-sync`, `migrate:subscribe-sync-runs`) reads the production Website Baserow token straight from Secrets Manager.

## Cloudflare tokens

| Key | Where | Role |
|-----|--------|------|
| `CLOUDFLARE_DEV_API_TOKEN` | SM Ark → `.env.secrets` | Local DEV: Pages, Wrangler, Access teardown. |
| `CLOUDFLARE_API_TOKEN` | SM Ark → `.env.secrets`; GitHub Actions secret | CI / Wrangler name. Deploy jobs still use the GitHub copy. |
| `CLOUDFLARE_ACCOUNT_ID` | SM Ark → `.env.secrets`; GitHub Actions secret | Same account as wrangler `account_id`. |

Local DEV token permissions (custom token, this account):

- Account · Cloudflare Pages · Edit
- Account · Access: Apps and Policies · Edit (only needed for `npm run teardown:ops-access`)
- Account · Access: Organizations, Identity Providers, and Groups · Edit (teardown IdP)

Create a **Editor** robot (`ark-local-editor`) via `npm run setup:sanity-tokens` after `npx sanity login`. Never put that token in GitHub; CI uses Viewer / Deploy Studio robots.

## Fresh machine / nest

```bash
bw-unlock                 # skip if already unlocked in this container
npm run env:pull          # Password Manager → .env (ARK_LOCAL_BW_TOKEN)
npm run env:secrets:pull  # Secrets Manager → .env.secrets
```

Useful flags:

```bash
npm run env:pull -- --dry-run
npm run env:pull -- --replace
npm run env:seed -- --force          # reset notes from templates (destructive)
```

## What not to re-run

If staging/production already work, skip `setup:ci-secrets` / `setup:site-deploy` on clone. Those create or rotate CI/Worker secrets. Use them only for first-time wiring or repair.

## Nest vs ark

| File | Purpose |
|------|---------|
| `ark/.env` (file) ← item `ark/.env.local` | Shared local + `ARK_LOCAL_BW_TOKEN` (SM bootstrap) |
| `.env.secrets` | Every app secret from Secrets Manager, under SM names (`npm run env:secrets:pull`) |
| Nest `.env` (`~/dev/gwenda/.env`) | Workspace tools (e.g. ClickUp). Separate. |

## Org Cloudflare (Ark)

```bash
# Requires ARK_LOCAL_BW_TOKEN in .env
CLOUDFLARE_DEV_API_TOKEN=... npm run env:ark:push -- CLOUDFLARE_DEV_API_TOKEN
npm run env:secrets:pull
```

GitHub still holds `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` for deploy workflows that never talk to Secrets Manager.

## Secrets Manager pulls

Naming rule, manifests and project ownership: see [config.md](./config.md#secrets-one-naming-rule). In short, SM holds `NAME` (shared) and `NAME__LOCAL` / `__STAGING` / `__PRODUCTION` (override), and a pull for one env merges them with the override winning.

```bash
# Requires ARK_LOCAL_BW_TOKEN in .env
npm run env:secrets:pull                          # env=local → .env.secrets
npm run env:secrets:pull -- --env staging --dry-run
```

The pull lists **Ark + Ark/Ops + Ark/Web** and writes every secret any app uses once, under its SM name (for example `BASEROW_OPS_API_KEY` and `BASEROW_WEBSITE_API_KEY`, never a bare `BASEROW_API_KEY`). Missing keys are written as comments naming the SM keys it looked for. The app wrappers map SM names to runtime names from the `APP_SECRETS` rename table, so web sees `BASEROW_API_KEY` as the website token and ops sees it as the ops token.

`env:ark:pull` / `env:ops:pull` / `env:web:pull` exist for CI (`--github-env` exports one app's runtime names). Run locally without that flag, they write the same `.env.secrets`.

The local Ops dev database id (`BASEROW_OPS_DATABASE_ID`, `BASEROW_OPS_DEV_WORKSPACE_ID`) is a plain setting in `.env`, written by `npm run clone:baserow-ops-dev`.

Push a value (to the owning project, under its SM name). Values come from `.env.secrets`, or from the shell for keys named on the command line:

```bash
npm run env:web:push -- SUBSCRIBE_SECRET                     # shared NAME
NEW_SECRET=... npm run env:web:push -- NEW_SECRET            # value from the shell
npm run env:ops:push -- --profile local BASEROW_API_KEY      # BASEROW_OPS_API_KEY__LOCAL
```

Keys that already have env overrides in SM are skipped unless `--profile` is given, so a local token never becomes the shared value.

CI (Pages secrets): set repo secret `BWS_ACCESS_TOKEN` (ark-ci), then:

```bash
gh workflow run ops-secrets.yml                      # production ops, then redeploy
gh workflow run web-secrets.yml -f profile=staging
gh workflow run web-secrets.yml -f profile=production
```

Pages snapshots secrets per deployment, so a secret-only change needs a redeploy. **Deploy workflows do not push Pages secrets**; only `ops-secrets.yml` / `web-secrets.yml` (or a local `npm run setup:ops` + redeploy) do. `web.yml` may pull Ark/Web into the job env for the build (`SANITY_API_TOKEN`, `BASEROW_OPS_API_KEY` for artists, `GATE_BYPASS_KEY` smoke test) but never writes them to Cloudflare.

GitHub holds only `BWS_ACCESS_TOKEN` plus the Cloudflare deploy copies (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) for jobs that never talk to Secrets Manager.

Baserow workspaces and tokens per env: see [config.md](./config.md#ops-baserow-workspaces).

### Script-only credentials

Some secrets are for scripts, not app runtimes, so they are not in `APP_SECRETS`. CI exports them with `node scripts/sm-export.mjs NAME ...` (masked).

- `BASEROW_JWT_EMAIL` / `BASEROW_JWT_PASSWORD` (Ark/Ops): Baserow login for the clone scripts, which create tables and columns. **Required by `baserow-copy.yml`** (ops Website → Databases → Copy production over it). Prefer a dedicated Baserow user that can see production and the copies.
- `BASEROW_OPS_DEV_API_KEY` (Ark/Ops, also an ops runtime key): token for the Gwenda Dev copy of the Ops DB, so hosted ops can compare it with production. Same value as `BASEROW_OPS_API_KEY__LOCAL`.

## SMTP (form + invite mail)

`SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` are plain Pages project vars (wrangler `[vars]` and `sync-pages-secrets.mjs`). Only `SMTP_PASSWORD` is a Pages secret (Ark/Web SM).

Gmail accounts with 2FA need a [Google app password](https://support.google.com/accounts/answer/185833) for `notifications@gwenda.co.uk`. Paste with or without spaces; sync strips spaces. A normal account password fails with `534 Application-specific password required`, and form verify returns 502 after the Baserow row is already saved.

After rotating the app password, store it in Ark/Web (`SMTP_PASSWORD`), then sync Pages:

```bash
SMTP_PASSWORD='...' npm run env:web:push -- SMTP_PASSWORD
node marketing/web/scripts/ci/sync-pages-secrets.mjs --project gwenda-staging --profile staging
# or: gh workflow run web-secrets.yml -f profile=staging
```

Redeploy if form mail still 502s after a secret-only change that also touched host/user vars.

## Workers Logs (Pages Functions)

Pages Functions do **not** persist logs. `[observability]` is rejected in Pages wrangler.toml. Live tail still works (`wrangler pages deployment tail`, or a deployment's Functions tab). Form infrastructure failures emit one JSON line with `service: "gwenda"` and an `event` field:

- `form_store_failed`
- `form_notify_email_failed` / `form_notify_failed_after_store`
- `form_receipt_email_failed` / `form_receipt_failed_after_store`
- `form_verify_email_failed` / `form_verify_resend_failed` / `form_verify_token_failed`

On production (`SITE_ENV=production`) those events also email `ALERT_EMAIL` (`alerts@gwenda.co.uk`) via SMTP. Client 400s and honeypots are not alerted. Missing notify address on a form is logged, not emailed. Missing SMTP in production is emailed.

Standalone Workers can persist logs with `[observability] enabled = true`. `gwenda-site-health` does this.

## Site health

`GET /health` on the marketing site returns `{ ok: true, service: "gwenda", env, dataset, commit }` (liveness plus build metadata). Staging gate allows it without a password.

`gwenda-site-health` (cron every 5 minutes) probes production and staging. Production still emails `alerts@gwenda.co.uk` after two consecutive failures. Staging failures show in ops Web. Authenticated `GET https://health.gwenda.co.uk/status` returns the last probe for both sites (Bearer `HEALTH_STATUS_TOKEN` when that Worker secret is set). First-time wiring:

```
npm run setup:site-health
```

That creates the KV namespace, deploys the Worker on `health.gwenda.co.uk`, and puts `SMTP_PASSWORD`. CI redeploys from `.github/workflows/workers.yml`.

## Secrets vs config

Bitwarden is for **credentials** only. Plain settings for ops and web belong in the Baserow **Gwenda Config** database (profiled by Env and Service, never copied with Ops or Website data). Marketing tables (`Subscribers`, `Event Invites`, `Form Submissions`) are resolved by name. See [config.md](./config.md#runtime-config-gwenda-config-database).
