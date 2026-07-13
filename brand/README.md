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

Source of truth: `web/src/config/colors.json`.

## Deploy

Push to `main` (or `release`) — [deploy-brand workflow](../.github/workflows/deploy-brand.yml) runs only when `brand/` changes.

Manual deploy:

```bash
npm run sync:brand
npm run deploy -w @gwenda/brand   # uploads brand/src/ (not the repo folder root)
```
