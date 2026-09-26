# Gwenda Sanity Studio

Editorial home for **website data and copy** — the content editors change, separate from site code in git. See [docs/sanity.md](../../docs/sanity.md) for environments, tokens, and deploy workflow.

Migration is ongoing: only part of the site is CMS-backed today. Schema types will grow as more pages and strings move out of the repo.

## Quick start

```bash
npx sanity login                              # one-time
npm run studio:dev                            # http://localhost:3333 → the project in .env (Gwenda Dev)
npm run web:dev                               # site shows that Studio's drafts
```

Each project has one dataset, `production`. Do not create another.

## Drafts only

Studio saves drafts. Publish, unpublish, delete and duplicate are removed (`sanity.config.ts`): ops publishes, so the editor sees what goes live in one place. The preview sites show drafts; the live sites show published documents.

## Hosted Studio

| | URL | Command |
|---|-----|---------|
| **Gwenda** | https://gwenda.sanity.studio | Web promote (when Studio changed), or `studio.yml` from `release` / `npm run studio:deploy` |

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

The live site reads **published** documents at build time; the preview reads drafts over them. Edit in Studio, check the preview, then publish from ops.
