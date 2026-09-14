# Local env from Bitwarden

Local secrets live in Bitwarden (`bitwarden.eu`), not in git. Do **not** mint new Cloudflare / Sanity / Baserow tokens on every fresh clone.

## Vault item names

| Bitwarden item | Seed template | Role |
|----------------|---------------|------|
| `ark/.env.local` | `scripts/env-templates/local.env` | Laptop / nest (default `env:pull`) |
| `ark/.env.staging` | `scripts/env-templates/staging.env` | Staging secrets backup |
| `ark/.env.production` | `scripts/env-templates/production.env` | Production secrets backup |

## First-time seed

```bash
bw config server https://vault.bitwarden.eu   # once
bw login                                      # once
export BW_SESSION=$(bw unlock --raw)

npm run env:seed          # create the three notes from templates (skip if exist)
npm run env:pull          # write repo-root .env from ark/.env.local
```

Fill secrets one at a time:

```bash
npm run env:set -- SANITY_API_TOKEN 'sk...'
# later:
npm run env:set -- CLOUDFLARE_API_TOKEN '...'
```

`env:set` updates the vault note and merges into local `.env` (for `--env local`, the default).

Create a **Editor** robot (`ark-local-editor`) via `npm run setup:sanity-tokens` after `npx sanity login`. Never put that token in GitHub; CI uses Viewer / Deploy Studio robots.

## Fresh machine / nest

```bash
export BW_SESSION=$(bw unlock --raw)
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
