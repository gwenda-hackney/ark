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
| `/menu` | Menu items (Stock) |
| `/menu/new` | New recipe |
| `/menu/:name` | Recipe detail (`/menu/negroni`) |
| `/inventory` | Inventory (Stock) |
| `/inventory/new` | New inventory item |
| `/inventory/:name` | Inventory item detail |
| `/lightspeed` | Lightspeed POS reconcile (Stock) |
| `/lightspeed/export` | Lightspeed POS export (Stock) |
| `/lightspeed/menus` | Lightspeed POS menus (Stock) |
| `/suppliers` | Wholesaler catalog (Stock) |
| `/sections` | Guest menu sections |
| `/web` | Website staging vs production, health, promote |
| `/forms` | People who submitted a site form |
| `/users` | Who may sign in |
| `/config` | House pour-cost targets (Baserow config database) |
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

Local: `npm run ops:dev` → http://localhost:5174/ → Continue with Google. Optional `OPS_LOCAL_ADMIN_PW` remains a local bypass only. Leave `OPS_LOCAL_ADMIN_PW` unset on Pages.

Logout clears the session cookie and returns to `/gate/`.

If Cloudflare Access still intercepts production after cutover, run `npm run teardown:ops-access` (or delete the Gwenda ops Access apps in Zero Trust).
## Where data lives

| Data | Store |
|------|--------|
| Recipes, ingredients, method, glass, garnish, ops photos | **Baserow** `Menu Items` + `Ingredients` |
| Where a drink appears (print / digital / POS) | **Baserow** `Menu placements` (channel + section or POS menu/screen). Legacy Section / On print / On digital / POS menus fields are mirrored for compatibility. |
| Lightspeed menus catalog (Fall 2026, Gwenda, …) | **Baserow** `POS Menus`. Manage at `/lightspeed/menus`. |
| Lightspeed till screen path | **Baserow** `Menu placements` POS screen (also mirrored on Menu Items `Lightspeed menu/screen`). |
| Menu chapters and groups (Our Formulas, Spritz, Draught Beer…) | **Baserow** `Menu Sections` (parent + order). Nested tree on `GET /api/menu`. Edit in the menu **Sections** panel. |
| Bar stock / ABV catalog | **Baserow** `Inventory` |
| Wholesalers, product pages, and pack prices | **Baserow** `Suppliers` plus junction `Inventory suppliers` (SKU, pack, trade price, product URL) |
| Who may sign in to ops | **Baserow** `Users` (Email, Active). Manage in the app at `/users`, or in Baserow. |
| House pour-cost targets and other non-secret knobs | **Baserow** `Gwenda Config` database (Name, Value, Env, Service), shared with the website and never copied with Ops data. Edit pour targets at `/config`. |
| Guest digital menu (names, prices, short lines, gallery) | **Sanity** (marketing site only) |
| Stock / POS HTML | Drive → `ops/site/src/stock` |

Ops does **not** store recipes in Sanity. **Publish to digital menu** copies guest-facing fields (name, prices, menu line, section, photo) from Baserow into the **staging** dataset. It matches by stored Sanity ID or name, creates missing sections/items, and gwenda-staging rebuilds once edits go quiet. Production gets these documents from ops Website → Staging → live. In local ops this writes the Gwenda Dev copy instead. Do not edit production in Studio.

## Local

```bash
npm run ops:dev
```

- Vite SPA with HMR: [http://127.0.0.1:5174/](http://127.0.0.1:5174/)
- Pages + auth Functions: [http://127.0.0.1:8788/](http://127.0.0.1:8788/)

TODO: `:8788` still serves the built SPA, so both ports show a UI. Prefer Wrangler proxying the shell back to Vite so local UI is only the live HMR app.

Secrets come from **`.env.secrets`** (`npm run env:secrets:pull`, env `local`), mapped to ops runtime names by `ops-dev` / `with-ops-env`. Plain settings (Sanity project/dataset, deploy webhook URL, OAuth client id, pour targets, the web origin for form resends) load from the Baserow **Gwenda Config** database with `BASEROW_CONFIG_API_KEY`. See [docs/config.md](../../docs/config.md).

```bash
npm run env:secrets:pull
npm run ops:dev
```

Local ops works exactly like hosted ops, against copies: the dev Ops DB and the **Gwenda Dev** Sanity project. Save writes its staging dataset; Update website writes its production dataset. See the result with `npm run web:dev` (preview) or `npm run web:dev:live` (website, port 4322). Nothing reaches gwenda.co.uk, and site builds only run hosted. Refresh the copy with `npm run dev:refresh:sanity`. See [docs/sanity.md](../../docs/sanity.md).

### Debugging production locally (`ops:prod`)

```bash
npm run ops:prod
```

The same local app (HMR, stack traces in your terminal) with **production powers**: production Ops DB (556507), production secrets straight from Secrets Manager, `SITE_ENV=production`. Saves, **Update website** and **Update website now** change the real Ops DB and gwenda.co.uk, exactly like hosted ops. The app shows a red **LOCAL COPY ON LIVE DATA** banner. Stop it and run plain `npm run web:dev` to go back to the dev copy (it rewrites `.dev.vars`). Don't run both at once: they share `.dev.vars`.

Resending form emails from `/forms` locally calls the marketing dev server (`web.origin` = `http://localhost:4321`), so run `npm run web:dev` too.

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

## Lightspeed item list

Ops matches a **Lightspeed formatted** CSV exported by hand from Back Office (`Menu` → `Item list` → `Export`) and uploaded at `/lightspeed`. Downloading it with a headless browser does not work: the Back Office login is behind Cloudflare Turnstile. That spike lives on the `archive/lightspeed-headless-export` branch. The durable route is the K-Series Items API.
