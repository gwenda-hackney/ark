# Monorepo layout

Three sibling projects under one git repository (`gwenda-hackney/ark` on GitHub):

```
ark/
├── web/src/            ← marketing site
├── brand/src/          ← brand guidelines HTML
├── ops/src/            ← internal ops HTML (password-gated)
└── utils/              ← operational tools
```

## Brand colour sync

```bash
npm run sync:brand
```

Reads `web/src/config/colors.json`, updates `brand/src/index.html` `:root` CSS variables. CI enforces sync on every verify run.

## GitHub

Rename the remote repository from `web` to `ark`, then:

```bash
cd ark
git remote set-url origin https://github.com/gwenda-hackney/ark.git
```

Cloudflare Pages Git integration may need reconnecting after the rename.

## CI path filters

Each deploy workflow only runs when files in that project change:

| Workflow | Triggers on | Preview URL |
|----------|-------------|-------------|
| `deploy-staging.yml` | `web/**` on `main` | — (updates [gwenda-staging.pages.dev](https://gwenda-staging.pages.dev)) |
| `deploy-web-preview.yml` | `web/**` on branches except `main` / `release` | `https://<branch>.gwenda-staging.pages.dev` |
| `deploy-production.yml` | `web/**` on `release` | [release-preview.gwenda-blue.pages.dev](https://release-preview.gwenda-blue.pages.dev) |
| `deploy-studio.yml` | `studio/**` on `main` | — |
| `deploy-brand.yml` | `brand/**` on any branch | Production on `main`/`release`; else `https://<branch>.gwenda-brand.pages.dev` |
| `deploy-ops.yml` | `ops/**` on any branch | Production on `main`/`release`; else `https://<branch>.gwenda-ops.pages.dev` |
| `deploy-recipe-cost-webhook.yml` | `utils/recipe-cost-webhook/**` on `main` | — |
| `deploy-site-deploy-webhook.yml` | `utils/site-deploy-webhook/**` on `main` | — |

Branch preview names are sanitized by `.github/scripts/cloudflare-pages-branch.mjs` (slashes → dashes, lowercase).

Colour changes in `web/src/config/colors.json` do not auto-deploy brand — run `npm run sync:brand`, commit `brand/`, then push. CI `verify` still enforces sync via `sync:brand --check`.

Cross-project scripts (e.g. `sync-brand-tokens.mjs`) live in `.github/scripts/`.

## Moved paths (from pre-monorepo layout)

| Was | Now |
|-----|-----|
| Standalone `web/` repo root | `ark/web/` |
| Standalone `brand/` repo | `ark/brand/src/` |
| `utils/workers/…` | `ark/utils/…` |
