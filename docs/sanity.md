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

### GitHub secrets (CI)

| Secret | Token in Sanity | Used by |
|--------|---------------|---------|
| `SANITY_API_TOKEN` | Viewer (`ark-ci-read`) — read-only, production dataset | Staging + production **site builds** (fetch menu, events, etc.) |
| `SANITY_AUTH_TOKEN` | Deploy permission | **Studio deploy** workflow only |

Set the viewer token once:

```bash
gh secret set SANITY_API_TOKEN < <(grep '^SANITY_API_TOKEN=' .env | cut -d= -f2-)
```

Staging and production builds pass this into `npm run build` so Astro can query Sanity at build time.

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

### Menu items

| Field | Type | Purpose |
|-------|------|---------|
| `image` | image (+ optional alt) | Cocktail photo from Sanity CDN |
| `signature` | boolean | Include in homepage gallery (requires `image`) |
| `notes` | string | Cocktail style, e.g. Aperitif, Digestif |

Mark cocktails as **Signature cocktail** and upload a **Photo** in Studio. Only items with both appear on the homepage gallery.

### Seed development menu photos

```bash
npm run studio:seed:dev
# Optional: GWENDA_INGREDIENTS="Gin, vermouth, …" npm run studio:seed:dev
```

Uploads the six test PNGs from `web/src/assets/images/cocktails/` and seeds the **development** dataset with:

- **Signature Cocktails** — photos, `signature: true` (homepage gallery)
- **Traditional Cocktails** — classics (Old Fashioned, Negroni, Martini, etc.), menu page only

## Hosted Studio (editors)

Deploy against **production** only:

```bash
npm run studio:deploy
```

Pushes to `main` that touch `studio/**` also run [Deploy Studio](../.github/workflows/deploy-studio.yml) in CI (requires `SANITY_AUTH_TOKEN` in GitHub secrets).

## Content vs code

| What | Where it promotes |
|------|-------------------|
| Schema + queries | Git → `main` → staging → `release` → live |
| Published content | Sanity publish → webhook rebuilds staging (planned) |
| Local dev content | Stays in `development` until you copy or re-enter in production |

To preview production content locally, temporarily set `SANITY_DATASET=production` in `.env` (Viewer token is read-only).
