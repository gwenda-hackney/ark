# Gwenda ops site

Internal ops tools on Cloudflare Pages with a shared Svelte shell (collapsible rail).
Auth is Google OAuth in the app (local and production). Membership is Baserow Users.

Live: [gwenda-ops.pages.dev](https://gwenda-ops.pages.dev)

## Layout

```
ops/site/
├── menu-app/          ← Svelte 5 + Vite SPA (ops shell + menu recipes)
├── src/
│   ├── index.html     ← built shell (gitignored; `npm run build`)
│   ├── _redirects     ← SPA fallback for `/menu` and `/inventory`
│   ├── _app/          ← built SPA assets (gitignored)
│   ├── stock/         ← menu prices & stock (Drive sync)
│   ├── breakeven/
│   ├── cashflow/
│   ├── gate/          ← Google sign-in (optional password bypass)
│   ├── styles/
│   └── robots.txt
├── functions/         ← Google OAuth gate + Baserow menu API
└── scripts/sync-from-mydrive.mjs
```

## Shell

One UI for all tools. Collapsible icon rail (state in `localStorage` key `ops.rail`):

| Route | Content |
|-------|---------|
| `/` | Overview |
| `/menu` | Menu recipes |
| `/menu/new` | New recipe |
| `/menu/:name` | Recipe detail (`/menu/negroni`) |
| `/inventory` | Inventory |
| `/inventory/new` | New inventory item |
| `/inventory/:name` | Inventory item detail |
| `/users` | Who may sign in |
| `/stock` | Prices & stock (iframe → `/stock/index.html`) |
| `/breakeven` | Breakeven (iframe) |
| `/cashflow` | Cashflow (iframe) |

Old hash URLs (`/#/menu`) still resolve to the path routes. Drink and inventory URLs use the unique name (`/menu/negroni`). Direct `/stock/`, `/breakeven/`, and `/cashflow/` URLs still open those HTML tools on their own.

Theme/UI primitives mirror trading’s `shell.web` (Gwenda colours + Ysabeau/Roboto).

## Auth (Google OAuth + Baserow Users)

The same Google login works on **localhost** and **gwenda-ops.pages.dev**. Who may use ops lives in the Baserow **Users** table (Email + Active), managed at `/users`.

```bash
# .env
GOOGLE_OAUTH_CLIENT_ID=…
GOOGLE_OAUTH_CLIENT_SECRET=…
OPS_SESSION_SECRET=…          # signs the app session cookie (not from Google)

npm run setup:baserow-ops     # creates Users (and other Ops tables)
npm run setup:ops             # Pages secrets
npm run teardown:ops-access   # once: remove old Cloudflare Access apps
```

Google Cloud **Web application** OAuth client (reuse the existing client):

1. Authorized JavaScript origins: `http://localhost:5174`, `http://127.0.0.1:5174`, `https://gwenda-ops.pages.dev`
2. Authorized redirect URIs: `http://localhost:5174/api/auth/callback`, `http://127.0.0.1:5174/api/auth/callback`, `https://gwenda-ops.pages.dev/api/auth/callback`

Local: `npm run dev -w @gwenda/ops` → http://localhost:5174/ → Continue with Google. Optional `OPS_PASSWORD` remains a local bypass only. Leave `OPS_PASSWORD` unset on Pages.

Logout clears the session cookie and returns to `/gate/`.

If Cloudflare Access still intercepts production after cutover, run `npm run teardown:ops-access` (or delete the Gwenda ops Access apps in Zero Trust).
## Where data lives

| Data | Store |
|------|--------|
| Recipes, ingredients, method, glass, garnish, ops photos | **Baserow** `Menu Items` + `Ingredients` |
| Menu chapters and groups (Our Formulas, Spritz, Draught Beer…) | **Baserow** `Menu Sections` (parent + order). Nested tree on `GET /api/menu`. Edit in the menu **Sections** panel. |
| Bar stock / ABV catalog | **Baserow** `Inventory` |
| Wholesalers, product pages, and pack prices | **Baserow** `Suppliers` plus junction `Inventory suppliers` (SKU, pack, trade price, product URL) |
| Who may sign in to ops | **Baserow** `Users` (Email, Active). Manage in the app at `/users`, or in Baserow. |
| Guest digital menu (names, prices, short lines, gallery) | **Sanity** (marketing site only) |
| Stock / POS HTML | Drive → `ops/site/src/stock` |

Ops does **not** store recipes in Sanity. **Publish to digital menu** copies guest-facing fields from Baserow into matching Sanity `menuItem` documents (by name or stored Sanity ID), then triggers the site rebuild webhook.

## Local

```bash
npm run dev -w @gwenda/ops
```

- Vite SPA with HMR: [http://127.0.0.1:5174/](http://127.0.0.1:5174/)
- Pages + auth Functions: [http://127.0.0.1:8788/](http://127.0.0.1:8788/)

Requires `BASEROW_API_KEY` plus Google OAuth secrets (`GOOGLE_OAUTH_*` + `OPS_SESSION_SECRET`) or `OPS_PASSWORD` in repo-root `.env`. Ops table ids come from `wrangler.toml` `[vars]` (and name lookup as a fallback). Local seed scripts still read ids from `.env`.

Build:

```bash
npm run build -w @gwenda/ops
```

## Stock / breakeven / cashflow

Edit those HTML tools under `src/`. Stock syncs from Drive with `npm run sync -w @gwenda/ops`.
They load inside the shell via iframe; direct URLs still work.

## Deploy

```bash
npm run deploy -w @gwenda/ops
# or CI via apps.yml
```
