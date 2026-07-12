# Gwenda Sanity Studio

Editorial home for **website data and copy** — the content editors change, separate from site code in git. See [docs/sanity.md](../docs/sanity.md) for environments, tokens, and deploy workflow.

Migration is ongoing: only part of the site is CMS-backed today. Schema types will grow as more pages and strings move out of the repo.

## Quick start

```bash
npx sanity login                              # one-time
npm run studio:dataset:create -- development --visibility private  # one-time
npm run studio                                # http://localhost:3333
```

## Hosted Studio

| | URL | Command |
|---|-----|---------|
| **Development** (staging / schema work) | https://gwenda-dev.sanity.studio | `npm run studio:deploy:dev` (main CI) |
| **Production** (editors) | https://gwenda.sanity.studio | `npm run studio:deploy` |

## Schema today

Document types in `studio/schemaTypes/` — queries live in `web/src/lib/sanity/`.

| Type | Purpose |
|------|---------|
| `menuSection` | Menu grouping (title, slug, sort order) |
| `menuItem` | Cocktail / drink entry |
| `event` | Special events listing |

The Astro site reads **published** documents at build time. Staging uses the **development** dataset; live uses **production**.
