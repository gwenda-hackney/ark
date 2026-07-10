# Gwenda Sanity Studio

Content editor for menu and events. See [docs/sanity.md](../docs/sanity.md) for datasets and workflow.

## Quick start

```bash
npx sanity login                              # one-time
npm run studio:dataset:create -- development --visibility private  # one-time
npm run studio                                # http://localhost:3333 — development dataset
```

## Deploy hosted Studio (production dataset, for editors)

```bash
npm run studio:deploy
```

## Schema

| Type | Purpose |
|------|---------|
| `menuSection` | Cocktails, small plates, etc. |
| `menuItem` | Individual dishes/drinks |
| `event` | Events page entries |

The Astro site fetches at build time — `web/src/lib/sanity/`.
