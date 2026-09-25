# Gwenda Sanity Studio

Editorial home for **website data and copy** — the content editors change, separate from site code in git. See [docs/sanity.md](../../docs/sanity.md) for environments, tokens, and deploy workflow.

Migration is ongoing: only part of the site is CMS-backed today. Schema types will grow as more pages and strings move out of the repo.

## Quick start

```bash
npx sanity login                              # one-time
npm run studio:dev                                # http://localhost:3333 → staging dataset
npm run web:dev                                   # site overlays drafts from that Studio
```

The project already has `staging` and `production`. Growth allows two datasets. Do not create a third.

## Hosted Studio

| | URL | Command |
|---|-----|---------|
| **Dev Studio** | https://gwenda-dev.sanity.studio | `npm run studio:deploy:preview` (main CI) |
| **Prod Studio** (schema only) | https://gwenda.sanity.studio | ops promote / `npm run studio:deploy:prod` |

Local Studio and Dev Studio both use the **staging** dataset. `npm run web:dev` shows drafts. Hosted staging and production ignore drafts. Do not edit production in Studio.

## Schema today

Document types in `schemaTypes/` — queries live in `marketing/web/src/lib/sanity/`.

| Type | Purpose |
|------|---------|
| `menuSection` | Menu grouping (title, slug, parent chapter, sort order) |
| `menuItem` | Cocktail / drink entry |
| `event` | Special events listing |
| `form` | Configurable public forms (fields, copy, notify / From / Reply-To) |

Public URL: `/contact/<slug>` (e.g. `/contact/play`). Contact hub: `/contact`.

Form mail identity (`notifyEmail`, `fromEmail`, `replyToEmail`) is edited in Studio (default `play@gwenda.co.uk`). Only `SMTP_PASSWORD` is a secret.

The Astro site reads **published** documents at build time. Publish in Studio, rebuild gwenda-staging, review, then promote staging onto production.
