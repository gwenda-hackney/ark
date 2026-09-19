# Gwenda Brand Guidelines

Static HTML brand guidelines at [brand.gwenda.co.uk](https://brand.gwenda.co.uk).

## Layout

```
brand/
├── brand-guidelines.md   ← full guidelines (Markdown reference)
└── src/
    ├── index.html        ← published at brand.gwenda.co.uk
    ├── logo.png          ← primary gold wordmark (dark backgrounds)
    ├── logo-black.png    ← black-only wordmark (light backgrounds)
    ├── favicon.ico       ← same as gwenda.co.uk
    ├── favicon.png
    └── hero.webp         ← hero photograph (guidelines demo only)
```

## Colour tokens

Dark-palette CSS variables are synced from the marketing site:

```bash
# From repo root
npm run sync:brand
```

Source of truth: `marketing/web/src/config/colors.json`.

## Deploy

| Trigger | Target | URL |
|---------|--------|-----|
| Push to `main` or `release` (`marketing/brand/**` changes) | Production (`--branch main`) | [brand.gwenda.co.uk](https://brand.gwenda.co.uk) |
| Push to any other branch (`marketing/brand/**` changes) | Branch preview | `https://<branch>.gwenda-brand.pages.dev` |
| Manual | [Apps](../.github/workflows/apps.yml) → **workflow_dispatch** (`app=brand`) | Choose preview or production |

Preview branch names are sanitized (`feat/brand-green-palette` → `feat-brand-green-palette`).

Manual production deploy:

```bash
npm run sync:brand
npm run deploy:production -w @gwenda/brand
```

Manual preview deploy (does not touch production):

```bash
npm run sync:brand
npm run deploy:preview -w @gwenda/brand -- --branch "$(node ../.github/scripts/cloudflare-pages-branch.mjs feat/my-branch)"
```

Or from `brand/`:

```bash
npx wrangler pages deploy src --project-name gwenda-brand --branch feat-my-branch --commit-dirty=true
```
