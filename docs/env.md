# Local env

Local secrets are never written into the repo. **`bw-unlock` is the login**: after it, every npm script (`with-env`, `with-ops-env`, `ops:dev`, setup scripts) loads secrets from Bitwarden Secrets Manager straight into its own process env. Do **not** mint new Cloudflare / Sanity / Baserow tokens on a fresh clone.

## How it works

| Piece | Where | Lifetime |
|-------|-------|----------|
| Bitwarden session key (`BW_SESSION`) | `/dev/shm/ark-secrets-<uid>/bw-session` (RAM, mode 600), written by `bw-unlock` | Until `bw-lock`, `bw logout`, a new unlock or the container stopping. Run `bw-unlock` after each container start. |
| SM machine token `ARK_LOCAL_BW_TOKEN` | Only in the vault note `ark/.env.local` (folder `ark`) | Read from the unlocked vault when needed, held in memory, never written to disk. |
| App secrets (SM names) | Look-aside cache `/dev/shm/ark-secrets-<uid>/dev.json` (RAM, mode 600) | 12 hours, tied to the current session. Gone when the container stops. |
| Local settings | Defaults in `scripts/lib/load-env.mjs` (`LOCAL_DEFAULTS`: the dev Sanity project, localhost links) | Committed. A machine works on the dev copies, like the hosted dev site. |
| Where your local form emails go | `FORMS_NOTIFY_EMAIL`, defaulting to your git email (`git config user.email`) | Set git's email once per checkout, as you would anyway. |
| Personal overrides | Optional repo-root `.env` (see `.env.example`) | Usually doesn't exist. |

`scripts/lib/load-env.mjs` does this: `.env`, then `LOCAL_DEFAULTS` for anything still unset, then the cache (on a miss: token from the vault, then `bws` lists Ark, Ark/Ops and Ark/Web, env `dev`), then that app's runtime names (`APP_SECRETS` rename). The cache entry holds a hash of the session key, so after `bw-lock` or a new unlock it no longer matches. Scripts that write to SM (`env:*:push`, `setup:*`) clear it. A cold load takes about 4 seconds; a cached one about 60 ms.

Scripts read the session from the file, not only from the shell variable, so a shell that did not source `~/.bashrc` (an editor task, an agent) still works while the vault is unlocked. Check with `npm run env:status`. Plain `bw status` in such a shell says `locked` even when the vault is unlocked, because it only looks at `BW_SESSION`. If a script prints `Secrets not loaded: vault locked`, run `bw-unlock` and rerun. Nothing else is needed.

Wrangler's bindings go in a per-run file in the same RAM directory (mode 600, deleted on exit). `wrangler pages dev` only reads `.dev.vars` (it ignores `--env-file`), so for `ops:dev` `ops/site/.dev.vars` is a gitignored symlink to that file while it runs; `wifi-portal` passes `--env-file`. Wrangler's own process env keeps `CLOUDFLARE_API_TOKEN`, which the remote `AI` binding needs; without it Wrangler falls back to a browser OAuth login and hangs. A leftover `.dev.vars` is deleted on start, because Wrangler would prefer it.

In CI (`CI` set) the loader does not touch the vault or apply `LOCAL_DEFAULTS`. Jobs export secrets with `npm run env:<app>:pull -- --github-env`.

## First time on a machine

```bash
bw config server https://vault.bitwarden.eu   # once
bw login                                      # once
bw-unlock                                     # the login; persists for this container

git config user.email you@gwenda.co.uk   # also where your local form emails go
```

That's it. `npm run web:dev`, `npm run ops:dev` and the rest now load secrets themselves.

## Everyday

```bash
npm run env:status            # vault unlocked? secrets cached?
bw-unlock                     # when a script says the vault is locked
bw-lock                       # locks, deletes the session file and the secrets cache
npm run env:secrets:refresh   # refetch now (after editing a secret in the Bitwarden web app)
ARK_SECRETS_REFRESH=1 npm run ops:dev   # same, for one run
```

Overrides: `BW_SESSION_FILE` (session file path), `ARK_SECRETS_CACHE_DIR` (cache directory).

Production worker setup (`setup:wifi-portal`, `setup:subscribe-mailchimp-sync`) reads the production Website Baserow token straight from Secrets Manager.

## Cloudflare tokens

One Cloudflare account serves every env, so there is one token, shared (no suffix):

| Key | Where | Role |
|-----|--------|------|
| `CLOUDFLARE_API_TOKEN` | SM `ark` | Pages, Workers, Wrangler, locally and in CI (CI pulls it from SM). The Cloudflare token has the same name. |
| `CLOUDFLARE_ACCOUNT_ID` | SM `ark` | Same account as wrangler `account_id`. |

It needs Pages · Edit, Workers Scripts · Edit, Workers KV Storage · Edit, Workers Routes · Edit (zone), Account Settings · Read and Workers AI · Read (local `ops:dev`). `npm run teardown:ops-access` also needs Access: Apps and Policies · Edit; use a short-lived token for that.

## Secrets Manager pulls

Naming rule, manifests and project ownership: see [config.md](./config.md#secrets-one-naming-rule). In short, SM holds `NAME` (every env) and `NAME__DEV` / `NAME__PRODUCTION` (that env), and a pull for one env merges them with the env value winning. A developer's machine is dev.

```bash
npm run env:secrets:refresh                              # refetch dev into the cache, list missing names
npm run env:secrets:refresh -- --env production --dry-run   # names only, nothing cached
```

A load lists **Ark + Ark/Ops + Ark/Web** and keeps every secret any app uses once, under its SM name (for example `BASEROW_OPS_API_KEY` and `BASEROW_WEBSITE_API_KEY`, never a bare `BASEROW_API_KEY`). The app wrappers map SM names to runtime names from the `APP_SECRETS` rename table, so web sees `BASEROW_API_KEY` as the website token and ops sees it as the ops token.

`env:ark:pull` / `env:ops:pull` / `env:web:pull` exist for CI (`--github-env` exports one app's runtime names). Run locally without that flag, they refresh the same cache.

No Baserow database or workspace ids are configured anywhere. A database token opens one workspace and the apps find their database by its tables; scripts log in and find databases by name. See [config.md](./config.md#baserow-no-ids).

Push a value (to the owning project, under its SM name). Name the keys; each value comes from the shell:

```bash
SUBSCRIBE_SECRET=... npm run env:web:push -- SUBSCRIBE_SECRET                  # shared NAME
BASEROW_API_KEY=... npm run env:ops:push -- --profile dev BASEROW_API_KEY      # BASEROW_OPS_API_KEY__DEV
```

Keys that already have env values in SM are skipped unless `--profile` is given, so a dev token never becomes the shared value.

CI (Pages secrets): set repo secret `BWS_ACCESS_TOKEN` (ark-ci), then:

```bash
gh workflow run ops-secrets.yml                      # production ops, then redeploy
gh workflow run web-secrets.yml -f profile=production  # gwenda (live + preview)
gh workflow run web-secrets.yml -f profile=dev         # gwenda-web-dev
```

Pages snapshots secrets per deployment, so a secret-only change needs a redeploy. The ops deploys (`apps.yml`, production and dev) sync ops Pages secrets before deploying, adding and updating only. The website deploys do not push Pages secrets; `web-secrets.yml` does. `web.yml` may pull Ark/Web into the job env for the build (`SANITY_API_TOKEN`, `BASEROW_OPS_API_KEY` for artists, `GATE_BYPASS_KEY` smoke test) but never writes them to Cloudflare.

GitHub holds only `BWS_ACCESS_TOKEN`. Every workflow reads everything else from Secrets Manager: app secrets with `env:<app>:pull -- --github-env`, script credentials with `sm-export.mjs`. Do not add GitHub secrets.

Baserow workspaces and tokens per env: see [config.md](./config.md#ops-baserow-workspaces).

### Script-only credentials

Some secrets are for scripts, not app runtimes, so they are not in `APP_SECRETS`. CI exports them with `node scripts/sm-export.mjs NAME ...` (masked).

- `DISPATCH_TOKEN` (Ark): GitHub token the site-deploy Worker starts workflows with (`workers.yml` puts it on the Worker as `GITHUB_TOKEN`).
- `MAILCHIMP_API_KEY`, `SUBSCRIBE_MAILCHIMP_SYNC_SECRET` (Ark/Web): the Mailchimp sync Worker (`workers.yml`, `setup:subscribe-mailchimp-sync`).
- `BASEROW_JWT_EMAIL` / `BASEROW_JWT_PASSWORD` (Ark/Ops): Baserow login for the clone scripts, which create tables and columns. **Required by `baserow-copy.yml`** (ops Website → Databases → Copy production over it). Prefer a dedicated Baserow user that can see production and the copies.

## Email

All mail goes through the Gmail API over HTTPS (`shared/gmail-send.js`), sent as `notifications@gwenda.co.uk` by the Google service account `GMAIL_SERVICE_ACCOUNT_JSON` (SM `GOOGLE_SERVICE_ACCOUNT_JSON`, domain-wide delegation for `gmail.send`). The addresses are constants in `shared/mail-from.js`, not config. There is no SMTP anywhere: Workers can't hold SMTP connections well. See [email.md](./email.md).

## Workers Logs (Pages Functions)

Pages Functions do **not** persist logs. `[observability]` is rejected in Pages wrangler.toml. Live tail still works (`wrangler pages deployment tail`, or a deployment's Functions tab). Form infrastructure failures emit one JSON line with `service: "gwenda"` and an `event` field:

- `form_store_failed`
- `form_notify_email_failed` / `form_notify_failed_after_store`
- `form_receipt_email_failed` / `form_receipt_failed_after_store`
- `form_verify_email_failed` / `form_verify_resend_failed` / `form_verify_token_failed`

On production (`SITE_ENV=production`) those events also email `ALERT_EMAIL` (`alerts@gwenda.co.uk`). Client 400s and honeypots are not alerted. Missing notify address on a form is logged, not emailed. Email not configured in production is alerted.

Standalone Workers can persist logs with `[observability] enabled = true`. `gwenda-site-health` does this.

## Site health

`GET /health` on the marketing site returns `{ ok: true, service: "gwenda", env, dataset, commit }` (liveness plus build metadata). The preview's password gate allows it without a password.

`gwenda-site-health` (cron every 5 minutes) probes the live site and prod's preview. The live site emails `alerts@gwenda.co.uk` after two consecutive failures. Preview failures show in ops Web. Authenticated `GET https://health.gwenda.co.uk/status` returns the last probe for both sites (Bearer `HEALTH_STATUS_TOKEN` when that Worker secret is set). First-time wiring:

```
npm run setup:site-health
```

That creates the KV namespace, puts `GMAIL_SERVICE_ACCOUNT_JSON` and deploys the Worker on `health.gwenda.co.uk`. CI redeploys from `.github/workflows/workers.yml`: it puts the secret before the deploy, checks `GET /health` reports `emailConfigured: true`, then deletes the retired `SMTP_PASSWORD`.

## Secrets vs config

Bitwarden is for **credentials** only. Plain settings for ops and web belong in the Baserow **Gwenda Config** database (profiled by Env and Service, never copied with Ops or Website data). Marketing tables (`Subscribers`, `Event Invites`, `Form Submissions`) are resolved by name. See [config.md](./config.md#runtime-config-gwenda-config-database).
