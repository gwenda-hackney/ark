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
│   ├── bottle-original.png        ← the full logo's drawing: only ever traced
│   └── bottle-record-redraw.png   ← the bottle and record's own drawing: only ever traced
└── src/
    ├── index.html        ← published at brand.gwenda.co.uk
    ├── logo.png          ← primary gold wordmark (dark backgrounds)
    ├── logo-black.png    ← black-only wordmark (light backgrounds)
    ├── favicon.ico       ← same as gwenda.co.uk
    ├── favicon.png
    └── hero.webp         ← hero photograph (guidelines demo only)
```

## Bottle logo

The SVG masters in `logos/` are the logo, for everywhere it shows. `scripts/trace-logo.mjs` traces each from a drawing of its own in `source/` (the clean-up rules, inks and specks, are in that script): the full logo from `bottle-original.png`, the bottle and record alone from `bottle-record-redraw.png`, which is cut to its art. Both come out in the logo's three inks. The script draws every other file from the masters:

- the 1080×1080 posts beside them;
- from the full logo, the website's `marketing/web/src/assets/images/logos/bottle.png` (menu panel, bar) and `bottle-hero-<width>.webp` (home's hero);
- from the full logo, the emails' `marketing/web/public/brand/logo-email-social.png`, with SOCIAL under it.

Run `npm run brand:logo` from the repo root when a drawing changes, and commit what it writes: the files are assets like any other, and nothing is traced or drawn when the site is built or deployed. `scripts/trace-logo.test.mjs` fails while a committed file is not its master's drawing.

The drawing's black is see-through, as in the original: the logo takes whatever it lies on, so put it on black (the `-1080-black` posts are on the site's `#0b0a08`) or a dark photo. Each SVG has three named layers, bottom to top: `cream`, `mustard`, `red`.

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
