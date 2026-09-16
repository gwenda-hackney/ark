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
```

In the devcontainer, `bw-unlock` writes the session key to `/commandhistory/.bw-session` (a Docker volume). New shells and env scripts reuse it, so you should not need to unlock again until `bw-lock`, `bw logout`, or a new login. Treat that file like a decrypted vault key. Override the path with `BW_SESSION_FILE`.

Fill secrets one at a time:

```bash
npm run env:set -- SANITY_API_TOKEN 'sk...'
# later:
npm run env:set -- CLOUDFLARE_DEV_API_TOKEN '...'
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
| `CLOUDFLARE_DEV_API_TOKEN` | local `.env` | Local DEV: Pages, Wrangler, Access setup. Legacy alias: `CLOUDFLARE_API_TOKEN`. |
| `CLOUDFLARE_API_TOKEN` | GitHub Actions secret | CI deploys. Same name Wrangler expects in CI. |

Local DEV token permissions (custom token, this account):

- Account · Cloudflare Pages · Edit
- Account · Access: Apps and Policies · Edit
- Account · Access: Organizations, Identity Providers, and Groups · Edit

Create a **Editor** robot (`ark-local-editor`) via `npm run setup:sanity-tokens` after `npx sanity login`. Never put that token in GitHub; CI uses Viewer / Deploy Studio robots.

## Fresh machine / nest

```bash
bw-unlock                 # skip if already unlocked in this container
npm run env:pull
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
| `ark/.env` (file) ← item `ark/.env.local` | Site, Studio, Workers, ops |
| Nest `.env` (`~/dev/gwenda/.env`) | Workspace tools (e.g. ClickUp). Separate. |
