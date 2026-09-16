# Gwenda ops site

Internal ops tools on Cloudflare Pages with a shared Svelte shell (collapsible rail).
Production uses Cloudflare Access with Google. Local wrangler uses the password gate.

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
│   ├── gate/          ← local password UI (Access never reaches this in production)
│   ├── styles/
│   └── robots.txt
├── functions/         ← Access / password gate + Baserow menu API
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
| `/stock` | Prices & stock (iframe → `/stock/index.html`) |
| `/breakeven` | Breakeven (iframe) |
| `/cashflow` | Cashflow (iframe) |

Old hash URLs (`/#/menu`) still resolve to the path routes. Drink and inventory URLs use the unique name (`/menu/negroni`). Direct `/stock/`, `/breakeven/`, and `/cashflow/` URLs still open those HTML tools on their own.

Theme/UI primitives mirror trading’s `shell.web` (Gwenda colours + Ysabeau/Roboto).

## Auth (Cloudflare Access + Google)

Production (`gwenda-ops.pages.dev` and `*.gwenda-ops.pages.dev`) is locked at the edge by Cloudflare Access. Google is the identity provider. Who may use ops lives in the Baserow **Users** table (Email + Active), not in env.

If Zero Trust has never been used on this account, enable it once at [one.dash.cloudflare.com](https://one.dash.cloudflare.com/) (or Pages → gwenda-ops → Settings → General → Access policy). Local setup uses `CLOUDFLARE_DEV_API_TOKEN` (Pages, Wrangler, and Access). GitHub CI keeps `CLOUDFLARE_API_TOKEN`.

```bash
# .env
CF_ACCESS_GOOGLE_CLIENT_ID=…
CF_ACCESS_GOOGLE_CLIENT_SECRET=…

npm run setup:baserow-ops   # creates Users (and other Ops tables)
npm run setup:ops-access
npm run setup:ops
```

`setup:ops-access` upserts the Google IdP and two Access apps (production + preview wildcard). Access allows anyone who signs in with that Google client. Middleware then checks Baserow Users. It prints the Google Cloud redirect URI (`https://<team>.cloudflareaccess.com/cdn-cgi/access/callback`) if the client is missing.

Create a Google Cloud **Web application** OAuth client:

1. Authorized JavaScript origins: `https://<team>.cloudflareaccess.com`
2. Authorized redirect URI: `https://<team>.cloudflareaccess.com/cdn-cgi/access/callback`

Do not put the Google client secret on Pages. Access holds it.

Local password (default): `OPS_PASSWORD` in repo-root `.env`. Wrangler never sees Cloudflare Access.

Local Access sim (Users table, no Google):

```bash
# .env
OPS_AUTH_MODE=access
OPS_PASSWORD=…                 # still used to sign the local session cookie
# optional: OPS_DEV_ACCESS_EMAIL=you@gwenda.co.uk  # skip the gate and auto-use this email
```

Then `npm run dev -w @gwenda/ops`, open http://localhost:5174/, enter a Baserow Users email at `/gate/`. Allowed emails get in; others get the same forbidden message as production. Real Google login only happens on `gwenda-ops.pages.dev`.

`OPS_BYPASS_KEY` is password-mode only (`?access=`). Leave `OPS_PASSWORD` unset on Pages once Access works. Never set `OPS_AUTH_MODE` or `OPS_DEV_ACCESS_EMAIL` on Pages.

Logout in production is `/cdn-cgi/access/logout`. Local Access sim logs out to `/gate/`.

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

Requires `BASEROW_API_KEY` plus either `OPS_PASSWORD` or `OPS_AUTH_MODE=access` in repo-root `.env`. Ops table ids come from `wrangler.toml` `[vars]` (and name lookup as a fallback). Local seed scripts still read ids from `.env`.

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
