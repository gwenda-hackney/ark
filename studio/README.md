# Gwenda Sanity Studio

Content editor for menu and events. See [docs/sanity.md](../docs/sanity.md) for the full environment workflow.

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

## Schema

| Type | Fields |
|------|--------|
| `menuSection` | Title, slug, optional subtitle, sort order |
| `menuItem` | Name, description, section (reference), price, image, signature, notes |
| `event` | Title, slug, date, description |

The Astro site fetches at build time — `web/src/lib/sanity/`. Staging uses the **development** dataset; live uses **production**.
