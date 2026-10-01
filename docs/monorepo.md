# Monorepo layout

```
ark/
├── marketing/
│   ├── web/            ← marketing site
│   ├── brand/          ← brand guidelines HTML
│   ├── studio/         ← Sanity Studio (website CMS)
│   └── … Workers       ← site-deploy, Mailchimp sync, site health, Wi‑Fi portal
├── ops/
│   ├── site/           ← ops Pages app (HTML tools)
│   └── recipe-cost-webhook/
├── shared/             ← code two or more apps use (see below)
├── docs/
└── scripts/
```

npm workspaces (not pnpm). Root `package.json` lists each package path explicitly under `marketing/` and `ops/`.

## Shared code

An app never imports another app's files. Code that two apps (or an app and `scripts/`) need lives in `shared/`, imported by relative path:

| Module | What | Used by |
|---|---|---|
| `baserow.js` | Baserow client (rate-limited, retrying), Gwenda Ops table names and lookup | ops, website, scripts |
| `artists.js` | Reading wall artists from Gwenda Ops (`listArtists`) | ops, website, scripts |
| `web-address.js` | Web addresses typed by editors (`parseProductUrl`, `normalizeWebsite`) | ops, scripts |
| `sanity-projects.js` | The real and Gwenda Dev Sanity project IDs | ops, Studio, scripts |
| `env-file.js` | `.env`-style parsing (`parseDotEnv`) and PEM values | website config, scripts |
| `config*.js`, `site-*.js`, `forms/`, `gmail-send.js`, `log.js`, `mail-from.js`, `email-image.js` | Config database, site snapshot, form emails, logging | ops, website, Workers |

Tests sit next to each module and run as the `shared` Vitest project.

Scripts that only work on one app's data live in that app (`ops/site/scripts/`: Baserow setup, the LWC price list, supplier enrichment); `scripts/` holds repo-wide tooling (env loading, deploys, setup of shared services). Root `npm run` names stay the same.

## Brand colour sync

`npm run sync:brand` (`.github/scripts/sync-brand-tokens.mjs`):

Reads `marketing/web/src/config/colors.json`, updates `marketing/brand/src/index.html` `:root` CSS variables. CI enforces sync on every pull request and web deploy.

## Deploy workflows

The main deploy workflows under `.github/workflows/`:

| Workflow | Role |
|----------|------|
| `web.yml` | Dev website (`main`), prod's preview (`release`, and ops content rebuilds), branch previews on the dev website |
| `web-promote.yml` | Live site from `release` and published documents |
| `studio.yml` | Hosted Studio by hand from `release` (Web promote also redeploys it) |
| `workers.yml` | site-deploy-webhook, Mailchimp sync, site-health, recipe-cost |
| `apps.yml` | Brand guidelines + ops Pages |
| `pr.yml` | Pull request checks: website lint and tests, ops tests, type check and build |

Root `package.json` alone should not trigger Worker deploys.

Colour changes in `marketing/web/src/config/colors.json` are included in the brand app filter. Prefer `npm run sync:brand`, commit `marketing/brand/`, then push. CI (PR checks and web deploys) still enforces sync via `sync:brand --check`.

## Migration map (old → new)

| Old | New |
|-----|-----|
| `web/` | `marketing/web/` |
| `brand/` | `marketing/brand/` |
| `studio/` | `marketing/studio/` |
| `utils/site-deploy-webhook/` | `marketing/site-deploy-webhook/` |
| `utils/subscribe-mailchimp-sync/` | `marketing/subscribe-mailchimp-sync/` |
| `utils/wifi-captive-portal/` | `marketing/wifi-captive-portal/` |
| `utils/recipe-cost-webhook/` | `ops/recipe-cost-webhook/` |
| `ops/` (Pages app at root) | `ops/site/` |
| `deploy-staging.yml` etc. | `web.yml` / `web-promote.yml` / `studio.yml` / `workers.yml` / `apps.yml` |
