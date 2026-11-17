# Gwenda Brand Guidelines

Static HTML brand guidelines at [brand.gwenda.co.uk](https://brand.gwenda.co.uk).

## Layout

```
brand/
├── brand-guidelines.md   ← full guidelines (Markdown reference)
├── logos/                ← the bottle logo's masters (npm run brand:logo)
│   ├── gwenda-bottle.svg          ← full logo: bottle, record, GWENDA
│   ├── gwenda-bottle-record.svg   ← bottle and record only (Instagram)
│   └── <name>-1080-black.png / -transparent.png  ← 1080×1080 posts
└── src/
    ├── index.html        ← published at brand.gwenda.co.uk
    ├── logo.png          ← primary gold wordmark (dark backgrounds)
    ├── logo-black.png    ← black-only wordmark (light backgrounds)
    ├── favicon.ico       ← same as gwenda.co.uk
    ├── favicon.png
    └── hero.webp         ← hero photograph (guidelines demo only)
```

## Bottle logo

`logos/` is traced from the site's `marketing/web/src/assets/images/logos/bottle.png` by `scripts/trace-logo.mjs`, with the clean-up rules (inks, specks, where GWENDA is cut off and the drips end) in that script. Run `npm run brand:logo` from the repo root when the PNG changes. The website keeps its own PNG and WebP files.

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
