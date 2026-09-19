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
│   ├── event-invites/
│   └── recipe-cost-webhook/
├── docs/
└── scripts/
```

npm workspaces (not pnpm). Root `package.json` lists each package path explicitly under `marketing/` and `ops/`.

## Brand colour sync

`npm run sync:brand` (`.github/scripts/sync-brand-tokens.mjs`):

Reads `marketing/web/src/config/colors.json`, updates `marketing/brand/src/index.html` `:root` CSS variables. CI enforces sync on every verify run.

## Deploy workflows

Seven workflow files under `.github/workflows/`:

| Workflow | Role |
|----------|------|
| `web.yml` | Staging (`main`), production preview (`release`), branch previews, Studio content deploys |
| `web-promote.yml` | Promote production preview to live (`kind=code` or `content`) |
| `studio.yml` | Hosted Sanity Studio (dev on `main`, prod on `release`) |
| `workers.yml` | site-deploy-webhook, Mailchimp sync, site-health, recipe-cost |
| `apps.yml` | Brand guidelines + ops Pages |
| `sanity.yml` | Mirror development ↔ production datasets |
| `verify.yml` | Reusable build/test (called by `web.yml`) |

Root `package.json` alone should not trigger Worker deploys.

Colour changes in `marketing/web/src/config/colors.json` are included in the brand app filter. Prefer `npm run sync:brand`, commit `marketing/brand/`, then push. CI `verify` still enforces sync via `sync:brand --check`.

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
| `ops/` (Pages app at root) | `ops/site/` |
| `deploy-staging.yml` etc. | `web.yml` / `web-promote.yml` / `studio.yml` / `workers.yml` / `apps.yml` / `sanity.yml` |
