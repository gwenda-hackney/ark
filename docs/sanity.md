# Sanity CMS

Project `pn5yjro6` on [sanity.io/manage](https://www.sanity.io/manage).

## Datasets

| Dataset | Used by | Purpose |
|---------|---------|---------|
| **`development`** | Local `npm run studio` + `npm run dev` | Safe sandbox for schema and content experiments |
| **`production`** | CI (staging + live builds), hosted Studio deploy | Real content editors publish |

Set in repo root `.env`:

```bash
SANITY_DATASET=development
SANITY_API_TOKEN=sk...
```

CI and deploy workflows set `SANITY_DATASET=production` — do not change that for local `.env`.

## First-time setup

1. Create the dev dataset (one-time):

   ```bash
   npm run studio:dataset:create -- development --visibility private
   ```

   Or in Sanity manage → Datasets → Add dataset → `development`.

2. Log in to Sanity CLI (one-time):

   ```bash
   npx sanity login
   ```

3. Copy env vars from `.env.example` into repo root `.env`.

## Local workflow

```bash
npm run studio    # edit content in development dataset
npm run dev       # site fetches from development dataset
```

Schema changes live in `studio/schemaTypes/` — commit with matching query updates in `web/src/lib/sanity/`.

## Hosted Studio (editors)

Deploy against **production** only:

```bash
npm run studio:deploy
```

## Content vs code

| What | Where it promotes |
|------|-------------------|
| Schema + queries | Git → `main` → staging → `release` → live |
| Published content | Sanity publish → webhook rebuilds staging (planned) |
| Local dev content | Stays in `development` until you copy or re-enter in production |

To preview production content locally, temporarily set `SANITY_DATASET=production` in `.env` (Viewer token is read-only).
