# Monorepo layout

Three sibling projects under one git repository (`gwenda-hackney/ark` on GitHub):

```
ark/
├── web/src/            ← marketing site
├── brand/src/          ← brand guidelines HTML
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

Each deploy workflow only runs when its project (or shared CI config) changes:

| Workflow | Triggers on |
|----------|-------------|
| `deploy-staging.yml` | `web/**` |
| `deploy-production.yml` | `web/**` (on `release`) |
| `deploy-studio.yml` | `studio/**` |
| `deploy-brand.yml` | `brand/**`, `web/src/config/colors.json` |
| `deploy-recipe-cost-webhook.yml` | `utils/recipe-cost-webhook/**` |

Cross-project scripts (e.g. `sync-brand-tokens.mjs`) live in `.github/scripts/`.

## Moved paths (from pre-monorepo layout)

| Was | Now |
|-----|-----|
| Standalone `web/` repo root | `ark/web/` |
| Standalone `brand/` repo | `ark/brand/src/` |
| `utils/workers/…` | `ark/utils/…` |
