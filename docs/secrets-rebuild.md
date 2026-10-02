# Rebuilding the secrets

What to do if Bitwarden Secrets Manager (SM) loses its secrets, or if every secret has to be replaced at once. On 2026-10-01 switching the Bitwarden account to a Teams plan emptied SM. These steps rebuilt everything in an afternoon without any user-facing outage, apart from one ops log-out.

How secrets normally work is in [env.md](env.md) and [config.md](config.md). This page covers getting them back.

## Rules

- **Name every token after the key that holds it.** The Baserow token `BASEROW_OPS_API_KEY__DEV` is stored under SM key `BASEROW_OPS_API_KEY__DEV`, and the SM access token for `ark-local` is named `ARK_LOCAL_BW_TOKEN`. Then it's always obvious which token is which, and which one to revoke.
- **Create new credentials, don't revoke old ones.** The live sites keep working on their old values (Cloudflare holds a copy of each) until they are redeployed. Revoke the old credentials only after the deploys are green ([Cleanup](#cleanup)).
- **Use repo-root `.env` as a working document.** Paste new values into it, one `NAME=value` per line. Move each value to its destination and delete the line once it's stored. `.env` is gitignored. `.env.example` is **not**: never paste anything there.
- **Check each value before storing it.** Make one cheap API call with it (examples below). A value pasted with a stray character fails silently later.
- **Read a value from `.env` with Node, not the shell.** Passwords can contain `$`, which `sh` expands. On 2026-10-01 this stored a mangled Baserow password.

## 0. Secrets Manager itself (Bitwarden web app, EU: vault.bitwarden.eu)

1. Projects `ark`, `ark/ops`, `ark/web` (production) and `ark-dev`, `ark/ops-dev`, `ark/web-dev` (dev and shared values) (#61). The scripts find them by name, ignoring case, so new IDs need no code change.
2. Machine account `ark-local`: **read/write** on all six. Create an access token named `ARK_LOCAL_BW_TOKEN` with no expiry, and put it in the vault note `ark/.env.local` as `ARK_LOCAL_BW_TOKEN=…`.
3. Machine account `ark-ci`: **read** on all six. Its token, named `ARK_CI_TOKEN`, goes in the GitHub **environment** `production` as secret `BWS_ACCESS_TOKEN`.
4. Machine account `ark-ci-dev`: **read** on the three `-dev` projects only. Its token, named `ARK_CI_DEV_TOKEN`, goes in the GitHub environments `dev` and `preview` as `BWS_ACCESS_TOKEN`. These are the **only** GitHub secrets; workflows read everything else from SM ([config.md](./config.md#who-reads-what-61)).
5. Check with `npm run env:secrets:refresh`. It lists what's missing. Without a project or with a wrong token it fails with `invalid_client`. If you test `bws` by hand, pass `--server-url https://vault.bitwarden.eu`. Without it, `bws` talks to the US server and every token looks invalid.

Store a single value by hand with `npm run secret:set` (asks for the name, then the value, hidden). In code, use `upsertSmSecret` from `scripts/lib/bitwarden-sm.mjs` (with the `ark-local` token from `vaultSmAccessToken()`), or `env:<app>:push`. A key must be in `SECRET_OWNERS` before it can be stored.

## 1. Secrets from outside services

| SM key | Where it comes from | Check |
|---|---|---|
| `BASEROW_OPS_API_KEY__DEV` / `__PRODUCTION`, `BASEROW_WEBSITE_API_KEY__DEV` / `__PRODUCTION`, `BASEROW_CONFIG_API_KEY__DEV` / `__PRODUCTION` | **Recover, don't create.** Log in to Baserow as automation@. `GET /api/database/tokens/` returns each token **with its key** to its owner, and the token names match the SM keys. | `GET /api/database/tokens/check/` with `Authorization: Token …` |
| `BASEROW_JWT_EMAIL` / `BASEROW_JWT_PASSWORD` (`ark/ops`) | The automation@gwenda.co.uk Baserow login, never notifications@. If the password is lost, reset it on Baserow. The reset email arrives in the notifications@ inbox, because automation@ is an alias of it. | `POST /api/user/token-auth/` returns 200 |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (`ark`) | One account token, named `CLOUDFLARE_API_TOKEN`, used locally and by CI. Permissions are listed in [env.md](env.md#cloudflare-tokens). `cfat_` tokens are account tokens. The account ID comes from `GET /accounts` with the token. | `GET /accounts/<id>/tokens/verify` returns `active` |
| `SANITY_API_TOKEN__DEV` (project `gwscpagy`, Editor), `SANITY_API_TOKEN__PRODUCTION` (`pn5yjro6`, Editor), `SANITY_DEPLOY_TOKEN__PRODUCTION` (`pn5yjro6`, Deploy Studio) | `npm run setup:sanity-tokens` (after `npx sanity login`): creates all three, labelled with their SM key, and stores them in SM. It revokes nothing unless you pass `--revoke-old`, and then only older tokens with the same label. Try `-- --dry-run` first. | `GET /users/me` with the new token |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | [Service accounts in gwenda-ops](https://console.cloud.google.com/iam-admin/serviceaccounts?project=gwenda-ops) → `gwenda-ops-drive` → Keys → Add key → JSON. A new key on the same account keeps its Gmail domain-wide delegation (sending as notifications@). Store the JSON on one line and delete the file. | JWT grant for the Drive scope, and for `gmail.send` with `sub: notifications@gwenda.co.uk`, both return a token |
| `GOOGLE_OAUTH_CLIENT_SECRET` | [The ops OAuth client](https://console.cloud.google.com/apis/credentials/oauthclient/682046070260-n9jpt18kt29vufljre5dkfqupq7rrdlt.apps.googleusercontent.com?project=682046070260) → Add secret | Token endpoint with a dummy code returns `invalid_grant` (right secret), not `invalid_client` |
| `UNIFI_SITE_MANAGER_API_KEY` | [unifi.ui.com/api](https://unifi.ui.com/api) → Create API key | `GET https://api.ui.com/v1/hosts` with `X-API-KEY` lists the console |
| `MAILCHIMP_API_KEY__PRODUCTION` | [Mailchimp API keys](https://admin.mailchimp.com/account/api/) | `GET https://<dc>.api.mailchimp.com/3.0/ping` |
| `DISPATCH_TOKEN__PRODUCTION` | [New **fine-grained** GitHub token](https://github.com/settings/personal-access-tokens/new): owner `gwenda-hackney`, repo `ark` only, **Actions: Read and write** and **Contents: Read-only**. Not "Workflows", which lets the token edit workflow files. | `GET /repos/gwenda-hackney/ark/actions/workflows/web.yml` returns 200, and the org repo list shows only `ark` |

## 2. Generated secrets

Make random values (`crypto.randomBytes(32).toString("base64url")`) for each env, as `NAME__DEV` and `NAME__PRODUCTION`:
`OPS_SESSION_SECRET`, `FORMS_ADMIN_SECRET`, `SUBSCRIBE_SECRET`, `GATE_BYPASS_KEY`, `OPS_LOCAL_ADMIN_PW`, `SITE_PASSWORD`, `DEPLOY_WEBHOOK_SECRET` (`setup:site-deploy` makes both of its values if missing).

One exception:
- `SUBSCRIBE_MAILCHIMP_SYNC_SECRET__PRODUCTION` is created by `npm run setup:subscribe-mailchimp-sync` if missing.

Pushing a new `OPS_SESSION_SECRET` logs everyone out of ops once, and a new `SITE_PASSWORD` changes the site-gate password. Pick a time when nobody is editing in ops.

## 3. Roll out, in this order

1. **`release` must have the current SM code.** Ops production and the live website deploy only from `release`. If an SM change (for example the lookup by project name) is only on main, cherry-pick that commit onto `release`. Don't merge all of main into it.
2. **Site-deploy Worker:** `npm run setup:site-deploy`. It gives the Worker both `DEPLOY_WEBHOOK_SECRET` values and `DISPATCH_TOKEN__PRODUCTION` from SM, and stops if `DISPATCH_TOKEN` is missing.
3. **Mailchimp sync Worker:** `npm run setup:subscribe-mailchimp-sync`
4. **Ops production:** `gh workflow run ops-secrets.yml --ref release`. This pushes secrets and redeploys, and is the moment of the log-out. The workflow ends with the ops smoke test.
5. **Website secrets:** `gh workflow run web-secrets.yml --ref main -f profile=production`, then the same with `profile=dev`. Pages only uses new secrets after a deploy.
6. **Live website:** `gh workflow run web-promote.yml --ref release`
7. **Dev:** `gh workflow run apps.yml --ref main -f app=ops -f deploy_target=dev` and `gh workflow run web.yml --ref main -f action=dev-live`

Claude Code's auto mode blocks production deploys and secret deletion unless you allow them (`/permissions`, e.g. `Bash(gh workflow run:*)`), or you run those commands yourself.

## 4. Check

- `npm run env:secrets:refresh`: nothing missing for dev. For production, compare `SECRET_OWNERS` against `resolveSecretsForEnv(raw, "production")`.
- Live form and email, end to end. Web promote runs this every time. To run it by hand:
  `node scripts/with-env.mjs sh -c 'cd marketing/web && node scripts/ci/smoke-test.mjs --url https://gwenda.co.uk --deep --send-email --form-test'`
  It sends three emails to alerts@, all with subjects starting "Smoke test:".
- Dev website deep health returns 200 (a 401 means it hasn't been redeployed since its secrets changed).

## Cleanup

Once every deploy above is green:

- **GitHub:** no repo secrets; only the environment secrets `BWS_ACCESS_TOKEN` in `production`, `dev` and `preview`. No workflow reads any other.
- **Sanity:** revoke tokens whose label isn't an SM key.
- **Cloudflare, Google, Mailchimp:** delete the old token, the old service-account key (keep the newest), the old OAuth client secret and the old API key.
- **SM:** delete any leftover copies, such as a `__DEV` override of a shared secret.
- **`.env`:** should be empty again.
