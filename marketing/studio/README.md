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

Document types in `schemaTypes/` — queries live in `marketing/web/src/lib/sanity/`.

| Type | Purpose |
|------|---------|
| `menuSection` | Menu grouping (title, slug, parent chapter, sort order) |
| `menuItem` | Cocktail / drink entry |
| `event` | Special events listing |
| `form` | Configurable public forms (fields, copy, notify / From / Reply-To) |

Seed Play + Collaborate forms into the development dataset:

```bash
npm run studio:seed:forms:dev
```

Public URL: `/contact/<slug>` (e.g. `/contact/play`). Contact hub: `/contact`.

Form mail identity (`notifyEmail`, `fromEmail`, `replyToEmail`) is edited in Studio (default `play@gwenda.co.uk`). Only `SMTP_PASSWORD` is a secret.

The Astro site reads **published** documents at build time. Staging uses the **development** dataset; live uses **production**.
