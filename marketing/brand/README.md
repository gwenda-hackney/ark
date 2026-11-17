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
├── source/               ← what the masters are drawn from
│   └── bottle-record-front.svg    ← the record's front without GWENDA, drawn by hand
└── src/
    ├── index.html        ← published at brand.gwenda.co.uk
    ├── logo.png          ← primary gold wordmark (dark backgrounds)
    ├── logo-black.png    ← black-only wordmark (light backgrounds)
    ├── favicon.ico       ← same as gwenda.co.uk
    ├── favicon.png
    └── hero.webp         ← hero photograph (guidelines demo only)
```

## Bottle logo

`logos/` is traced from the site's `marketing/web/src/assets/images/logos/bottle.png` by `scripts/trace-logo.mjs`, with the clean-up rules (inks, specks) in that script. Run `npm run brand:logo` from the repo root when the PNG changes. The website keeps its own PNG and WebP files.

In the full logo the pour runs down into GWENDA. Where it ends without the letters is drawn by hand in `source/bottle-record-front.svg`: the streams reach the record's front rim, pool along it and drip over the edge. Open that file in a browser to see it over the original; change its paths in a drawing tool (units are the original's pixels), then run `npm run brand:logo`.

The masters are filled artwork, so they stand on any background: the drawing's black is drawn (the site's `#0b0a08`), under the cream, mustard and red, and nothing is drawn outside the drawing. Each SVG has four named layers, bottom to top: `black`, `cream`, `mustard`, `red`.

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
