# Gwenda Sanity Studio

Content editor for menu and events. Project `pn5yjro6`, dataset `production`.

## First-time setup

Log in to Sanity (one-time, opens a browser):

```bash
npx sanity login
```

## Local dev

From repo root:

```bash
npm run studio
```

Opens at http://localhost:3333

## Deploy hosted Studio

After `sanity login`:

```bash
npm run studio:deploy
```

Editors can use the hosted URL (e.g. `https://gwenda.sanity.studio`) without running locally.

## Schema

| Type | Purpose |
|------|---------|
| `menuSection` | Cocktails, small plates, etc. |
| `menuItem` | Individual dishes/drinks |
| `event` | Events page entries |

The Astro site fetches these at build time — see `web/src/lib/sanity/` (coming next).
