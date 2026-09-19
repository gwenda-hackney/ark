# Local env from Bitwarden

Local secrets live in Bitwarden (`bitwarden.eu`), not in git. Do **not** mint new Cloudflare / Sanity / Baserow tokens on every fresh clone.

Vault notes live in the Bitwarden folder **`ark`**, named `ark/.env.local`, `ark/.env.staging`, and `ark/.env.production`.

## Vault item names

Notes live in the Bitwarden folder **`ark`**:

| Bitwarden item | Folder | Seed template | Role |
|----------------|--------|---------------|------|
| `ark/.env.local` | `ark` | `scripts/env-templates/local.env` | Laptop / nest (default `env:pull`) |
| `ark/.env.staging` | `ark` | `scripts/env-templates/staging.env` | Staging secrets backup |
| `ark/.env.production` | `ark` | `scripts/env-templates/production.env` | Production secrets backup |

`npm run env:seed` creates missing notes and moves existing ones into the `ark` folder.

## First-time seed

```bash
bw config server https://vault.bitwarden.eu   # once
bw login                                      # once
bw-unlock                                     # or: export BW_SESSION=$(bw unlock --raw)

npm run env:seed          # create the three notes from templates (skip if exist)
npm run env:pull          # write repo-root .env from ark/.env.local
npm run env:ark:pull      # SM Ark → .env.ark (needs ARK_LOCAL_BW_TOKEN in .env)
```

In the devcontainer, `bw-unlock` writes the session key to `/commandhistory/.bw-session` (a Docker volume). New shells and env scripts reuse it, so you should not need to unlock again until `bw-lock`, `bw logout`, or a new login. Treat that file like a decrypted vault key. Override the path with `BW_SESSION_FILE`.

Fill secrets one at a time:

```bash
npm run env:set -- SANITY_API_TOKEN 'sk...'
# Cloudflare org tokens: put them in SM Ark (not only the Password Manager note):
npm run env:ark:push
```

Or push every non-empty key from local `.env` into the vault note:

```bash
bw-unlock                 # skip if already unlocked in this container
npm run env:push
```

`env:set` updates the vault note and merges into local `.env` (for `--env local`, the default).
`env:push` only writes vault ← local (skips `BITWARDEN_EMAIL` / `BITWARDEN_PASSWORD`).

## Cloudflare tokens

| Key | Where | Role |
|-----|--------|------|
| `CLOUDFLARE_DEV_API_TOKEN` | SM Ark → `.env.ark` | Local DEV: Pages, Wrangler, Access teardown. |
| `CLOUDFLARE_API_TOKEN` | SM Ark → `.env.ark`; GitHub Actions secret | CI / Wrangler name. Deploy jobs still use the GitHub copy. |
| `CLOUDFLARE_ACCOUNT_ID` | SM Ark → `.env.ark`; GitHub Actions secret | Same account as wrangler `account_id`. |

Local DEV token permissions (custom token, this account):

- Account · Cloudflare Pages · Edit
- Account · Access: Apps and Policies · Edit (only needed for `npm run teardown:ops-access`)
- Account · Access: Organizations, Identity Providers, and Groups · Edit (teardown IdP)

Create a **Editor** robot (`ark-local-editor`) via `npm run setup:sanity-tokens` after `npx sanity login`. Never put that token in GitHub; CI uses Viewer / Deploy Studio robots.

## Fresh machine / nest

```bash
bw-unlock                 # skip if already unlocked in this container
npm run env:pull          # Password Manager → .env (ARK_LOCAL_BW_TOKEN)
npm run env:ark:pull      # SM Ark → .env.ark
npm run env:web:pull      # SM → .env.web
npm run env:ops:pull      # SM → .env.ops
```

Useful flags:

```bash
npm run env:pull -- --dry-run
npm run env:pull -- --replace
npm run env:seed -- --force          # reset notes from templates (destructive)
npm run env:set -- --env staging KEY value
```

## What not to re-run

If staging/production already work, skip `setup:ci-secrets` / `setup:site-deploy` on clone. Those create or rotate CI/Worker secrets. Use them only for first-time wiring or repair.

## Nest vs ark

| File | Purpose |
|------|---------|
| `ark/.env` (file) ← item `ark/.env.local` | Shared local + `ARK_LOCAL_BW_TOKEN` (SM bootstrap) |
| `.env.ark` | Org Cloudflare from Secrets Manager (`npm run env:ark:pull`) |
| `.env.ops` | Ops secrets from Secrets Manager (`npm run env:ops:pull`; also reads web-owned Sanity / deploy webhook) |
| `.env.web` | Marketing secrets from Secrets Manager (`npm run env:web:pull`) |
| Nest `.env` (`~/dev/gwenda/.env`) | Workspace tools (e.g. ClickUp). Separate. |

## Org Cloudflare (Ark)

```bash
# Requires ARK_LOCAL_BW_TOKEN in .env
npm run env:ark:push          # once: copy filled Cloudflare keys from .env → Ark
npm run env:ark:pull          # Ark → .env.ark
npm run env:ark:pull -- --dry-run
```

Ops and web pulls also refresh `.env.ark`. GitHub still holds `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` for deploy workflows that never talk to Secrets Manager.

## Ops Secrets Manager pull

```bash
# Requires ARK_LOCAL_BW_TOKEN in .env
npm run env:ops:pull
npm run env:ops:pull -- --dry-run
```

CI (production Pages secrets): set repo secret `BWS_ACCESS_TOKEN` (ark-ci), then:

```bash
gh workflow run ops-secrets.yml
```

That syncs SM → Cloudflare Pages secrets (including `BASEROW_API_KEY_PRODUCTION` as Pages `BASEROW_API_KEY`). **Deploy workflows do not push Pages secrets** — only `ops-secrets.yml` / `web-secrets.yml` (or a local `sync-pages-secrets` run) do.

Ops pull lists **Ark + Ark/Web + Ark/Ops**, then writes only ops keys to `.env.ops`. It reads marketing-owned `SANITY_API_TOKEN` and `DEPLOY_WEBHOOK_SECRET` from Ark/Web instead of duplicating them.

GitHub should hold only `BWS_ACCESS_TOKEN` (machine account with access to **Ark**, **Ark/Ops**, and **Ark/Web**). Cloudflare deploy credentials (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_DEV_API_TOKEN`) live in SM project **Ark** and are pulled into CI via `env:ark:pull` / `env:web:pull` / `env:ops:pull`. App secrets (`SMTP_PASSWORD`, `SITE_PASSWORD`, …) live in Ark/Web or Ark/Ops, not as duplicated GitHub secrets.

Ops local vs prod Baserow workspaces: see [config.md](./config.md#ops-baserow-workspaces).

## Marketing Secrets Manager pull

Uses **Ark/Web** (plus org **Ark** for Cloudflare). Sanity and the deploy webhook are marketing-owned; ops pull reads those two keys.

```bash
npm run env:web:push          # once: copy filled marketing keys from .env → Ark/Web
npm run env:web:pull          # Ark + Ark/Web → .env.web (and .env.ark)
npm run env:web:pull -- --dry-run
```

CI:

```bash
gh workflow run web-secrets.yml -f profile=staging
gh workflow run web-secrets.yml -f profile=production
```

`web.yml` deploys code only. It may pull Ark/Web into the job env for build-time `SANITY_API_TOKEN` and smoke-test `GATE_BYPASS_KEY`, but it does **not** write those values to Cloudflare Pages. Rotate runtime secrets with `web-secrets.yml` (or local sync).

Uses SM `BASEROW_API_KEY_MARKETING` for staging Pages (Gwenda Dev website) and `BASEROW_API_KEY_MARKETING_PRODUCTION` for production Pages (not the ops Free-workspace token).

## SMTP (form + invite mail)

`SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` are plain Pages project vars (wrangler `[vars]` and `sync-pages-secrets.mjs`). Only `SMTP_PASSWORD` is a Pages secret (Ark/Web SM).

Gmail accounts with 2FA need a [Google app password](https://support.google.com/accounts/answer/185833) for `notifications@gwenda.co.uk`. Paste with or without spaces; sync strips spaces. A normal account password fails with `534 Application-specific password required`, and form verify returns 502 after the Baserow row is already saved.

After rotating the app password: put it in `.env.web` / Ark/Web (`SMTP_PASSWORD`), then:

```bash
npm run env:web:push
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

`GET /health` on the marketing site returns `{ ok: true, service: "gwenda" }` (liveness only). Staging gate allows it without a password.

`gwenda-site-health` (cron every 5 minutes) probes `https://gwenda.co.uk/health` and the homepage title. After two consecutive failures it emails `alerts@gwenda.co.uk`, reminds at most every 30 minutes while down, and sends one recovery mail. A `/health` 404 is ignored until that endpoint has returned `{ ok: true }` once, so the Worker can ship before production is promoted. First-time wiring:

```
npm run setup:site-health
```

That creates the KV namespace, deploys the Worker on `health.gwenda.co.uk`, and puts `SMTP_PASSWORD`. CI redeploys from `.github/workflows/workers.yml`.

## Secrets vs config

Bitwarden is for **credentials** only. Ops plain config belongs in Baserow **App Config**. Marketing tables (`Subscribers`, `Event Invites`, `Form Submissions`) are resolved by name; database id stays in wrangler `[vars]`. See [config.md](./config.md).
