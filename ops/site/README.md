# Gwenda ops site

Password-gated internal tools on Cloudflare Pages.

Live: [gwenda-ops.pages.dev](https://gwenda-ops.pages.dev)

## Layout

```
ops/site/
├── menu-app/          ← Svelte 5 + Vite SPA (Menu recipes source)
├── src/
│   ├── index.html     ← hub
│   ├── menu/          ← built SPA output (gitignored; `npm run build`)
│   ├── stock/         ← menu prices & stock (Drive sync)
│   ├── breakeven/
│   ├── cashflow/
│   ├── gate/
│   ├── styles/        ← shared CSS for static HTML tools
│   └── robots.txt
├── functions/         ← password gate + Baserow menu API
└── scripts/sync-from-mydrive.mjs
```

## Where data lives

| Data | Store |
|------|--------|
| Recipes, ingredients, method, glass, garnish, ops photos | **Baserow** database `Gwenda Ops` |
| Guest digital menu (names, prices, short lines, gallery) | **Sanity** (marketing site only) |
| Stock / POS HTML | Drive → `ops/site/src/stock` |

Ops does **not** store recipes in Sanity. **Publish to digital menu** copies guest-facing fields from Baserow into matching Sanity `menuItem` documents (by name or stored Sanity ID), then triggers the site rebuild webhook.

## Menu recipes (Svelte SPA)

Source: [`menu-app/`](menu-app/). Theme/UI primitives mirror trading’s `shell.web` (Gwenda colours + Cormorant/Lora).

1. Create tables: `npm run setup:baserow-ops`
2. Seed: `npm run seed:baserow-ops-menu`
3. Push Pages secrets: `npm run setup:ops`
4. Open [Menu recipes](https://gwenda-ops.pages.dev/menu/) after deploy
5. **Publish** syncs guest-facing fields to Sanity + rebuilds the site

Local:

```bash
npm run dev -w @gwenda/ops
```

Starts:

- Vite menu SPA with HMR: [http://127.0.0.1:5174/menu/](http://127.0.0.1:5174/menu/) (`/api` proxied to wrangler)
- Pages + gate Functions: [http://127.0.0.1:8788/](http://127.0.0.1:8788/)

Log in via the gate on `:8788` first if the API returns 401, or open the SPA after authenticating on that origin. For cookie sharing during local SPA work, authenticate against the proxied `/api/auth` from the Vite origin, or use the built assets on `:8788/menu/` after `npm run build -w @gwenda/ops`.

Requires `OPS_PASSWORD` and `BASEROW_API_KEY` (plus ops table IDs) in repo-root `.env`.

Build only:

```bash
npm run build -w @gwenda/ops
```

## Stock / breakeven / cashflow

Edit those HTML tools under `src/`. Stock syncs from Drive with `npm run sync -w @gwenda/ops`.

## Password

```bash
cd ops/site
npx wrangler pages secret put OPS_PASSWORD --project-name gwenda-ops
```

## Deploy

| Trigger | Target |
|---------|--------|
| Push to `main` / `release` (`ops/site/**`) | [gwenda-ops.pages.dev](https://gwenda-ops.pages.dev) |
| Other branches | `https://<branch>.gwenda-ops.pages.dev` |

CI runs `npm run build -w @gwenda/ops` before `wrangler pages deploy`.
