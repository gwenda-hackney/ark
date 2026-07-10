# Sanity CMS

Project `pn5yjro6` on [sanity.io/manage](https://www.sanity.io/manage).

## Datasets

| Dataset | Used by | Purpose |
|---------|---------|---------|
| **`development`** | Local `npm run studio` + `npm run dev` | Safe sandbox for schema and content experiments |
| **`production`** | CI (staging + live builds), hosted Studio | Real content editors publish |

## Tokens — `SANITY_API_TOKEN` everywhere

Everything uses **`SANITY_API_TOKEN`**. Local and CI use **different** Sanity tokens with **different** permissions.

| | Where | Sanity permission | Dataset |
|---|--------|-------------------|---------|
| **Local dev** | repo root `.env` | **Developer** | `development` |
| **CI** | GitHub secret `SANITY_API_TOKEN` | **Deploy** | `production` (workflows set `SANITY_DATASET=production`) |

### CI token permissions (Deploy)

CI runs two Sanity jobs with the **same** GitHub secret:

1. **Website build** — GROQ fetch of published menu/events at `npm run build`
2. **Studio deploy** — `npm run studio:deploy` when `studio/**` changes

**Deploy** is the minimum permission that covers both. Do **not** use Developer or Editor for CI — those can write content, which builds do not need.

Create at [sanity.io/manage](https://www.sanity.io/manage) → API → Tokens:

- **Name:** `ark-ci`
- **Permissions:** Deploy
- **Dataset:** production

```bash
gh secret set SANITY_API_TOKEN
```

Never copy your local `.env` token into GitHub — that is a **Developer** token on the **development** dataset.

### Local `.env`

```bash
SANITY_PROJECT_ID=pn5yjro6
SANITY_DATASET=development
SANITY_API_TOKEN=sk...   # Developer token — development dataset only
```

For local `npm run studio:deploy`, use `npx sanity login` (one-time browser auth) unless you add a separate Deploy token locally.

## First-time setup

1. Create the dev dataset (one-time):

   ```bash
   npm run studio:dataset:create -- development --visibility private
   ```

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

Uploads test cocktail PNGs and seeds the **development** dataset (signature + traditional sections).

## Hosted Studio (editors)

Deploy against **production** only:

```bash
npm run studio:deploy
```

Pushes to `main` that touch `studio/**` also run [Deploy Studio](../.github/workflows/deploy-studio.yml) (uses GitHub secret `SANITY_API_TOKEN`).

## Content vs code

| What | Where it promotes |
|------|-------------------|
| Schema + queries | Git → `main` → staging → `release` → live |
| Published content | Sanity publish → webhook rebuilds staging (planned) |
| Local dev content | Stays in `development` until you copy or re-enter in production |

To preview production content locally, temporarily set `SANITY_DATASET=production` in `.env` and use a token with read access to production (Deploy or Viewer).
