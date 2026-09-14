# Monorepo layout

```
ark/
├── marketing/
│   ├── web/            ← marketing site
│   ├── brand/          ← brand guidelines HTML
│   ├── studio/         ← Sanity Studio (website CMS)
│   └── … Workers       ← site-deploy, Mailchimp sync, Wi‑Fi portal
├── ops/                ← ops Pages app + recipe-cost / event-invites
├── docs/
└── scripts/
```

npm workspaces (not pnpm). Root `package.json` lists each package path explicitly under `marketing/` and `ops/`.

## Brand colour sync

`npm run sync:brand` (`.github/scripts/sync-brand-tokens.mjs`):

Reads `marketing/web/src/config/colors.json`, updates `marketing/brand/src/index.html` `:root` CSS variables. CI enforces sync on every verify run.

## Deploy triggers (path filters)

| Workflow | Paths | Notes |
|----------|-------|-------|
| `deploy-staging.yml` | `marketing/web/**` or `package-lock.json` on `main` | Updates [gwenda-staging.pages.dev](https://gwenda-staging.pages.dev) |
| `deploy-web-preview.yml` | `marketing/web/**` or `package-lock.json` on branches except `main` / `release` | `https://<branch>.gwenda-staging.pages.dev` |
| `deploy-production.yml` | `marketing/web/**` or `package-lock.json` on `release` | [release-preview.gwenda-blue.pages.dev](https://release-preview.gwenda-blue.pages.dev) |
| `deploy-studio.yml` | `marketing/studio/**` on `main` | — |
| `deploy-brand.yml` | `marketing/brand/**` on any branch | Production on `main`/`release`; else `https://<branch>.gwenda-brand.pages.dev` |
| `deploy-ops.yml` | `ops/**` (Pages app) | — |
| `deploy-recipe-cost-webhook.yml` | `ops/recipe-cost-webhook/**` on `main` | — |
| `deploy-site-deploy-webhook.yml` | `marketing/site-deploy-webhook/**` on `main` | — |
| `deploy-subscribe-mailchimp-sync.yml` | `marketing/subscribe-mailchimp-sync/**` on `main` | — |

Root `package.json` alone should not trigger Worker deploys (path filters omit it).

Colour changes in `marketing/web/src/config/colors.json` do not auto-deploy brand unless that file is also in the brand workflow filter (it is). Prefer `npm run sync:brand`, commit `marketing/brand/`, then push. CI `verify` still enforces sync via `sync:brand --check`.

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
| `utils/event-invites/` | `ops/event-invites/` |
