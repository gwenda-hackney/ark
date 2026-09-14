# Gwenda ops tools

Password-gated internal HTML tools on Cloudflare Pages.

Live: [gwenda-ops.pages.dev](https://gwenda-ops.pages.dev)

## Layout

```
ops/
├── src/
│   ├── index.html     ← hub
│   ├── menu/          ← recipes in Baserow Ops (photos, spec book, publish)
│   ├── stock/         ← menu prices & stock (Drive sync)
│   ├── breakeven/
│   ├── cashflow/
│   ├── gate/
│   └── robots.txt
├── functions/         ← password gate + Baserow menu API
└── scripts/sync-from-mydrive.mjs
```

## Where data lives

| Data | Store |
|------|--------|
| Recipes, ingredients, method, glass, garnish, ops photos | **Baserow** database `Gwenda Ops` |
| Guest digital menu (names, prices, short lines, gallery) | **Sanity** (marketing site only) |
| Stock / POS HTML | Drive → `ops/src/stock` |

Ops does **not** store recipes in Sanity. **Publish to digital menu** copies guest-facing fields from Baserow into matching Sanity `menuItem` documents (by name or stored Sanity ID), then triggers the site rebuild webhook.

## Menu recipes

1. Create tables: `npm run setup:baserow-ops` (needs Baserow admin login; prefers the **Gwenda** workspace)
2. Script writes table IDs into repo-root `.env` and, if Bitwarden is unlocked, into `ark/.env.local`
3. Seed sections + copy drinks from Sanity: `npm run seed:baserow-ops-menu`
4. Push Pages secrets: `npm run setup:ops` (needs `CLOUDFLARE_API_TOKEN`)
5. Open [Menu recipes](https://gwenda-ops.pages.dev/menu/) after deploy
6. **Publish** syncs guest-facing fields to Sanity + rebuilds the site

If Bitwarden was locked during setup, sync the ids manually:

```bash
export BW_SESSION=$(bw unlock --raw)
npm run env:set -- BASEROW_OPS_DATABASE_ID '556507'
npm run env:set -- BASEROW_OPS_SECTIONS_TABLE_ID '1196325'
npm run env:set -- BASEROW_OPS_ITEMS_TABLE_ID '1196326'
npm run env:set -- BASEROW_OPS_INGREDIENTS_TABLE_ID '1196327'
npm run env:set -- BASEROW_WORKSPACE_ID '208709'
```

(`setup:baserow-ops` now attempts this automatically when the vault is unlocked.)


Local:

```bash
npm run dev -w @gwenda/ops
```

Requires `OPS_PASSWORD` and `BASEROW_API_KEY` (plus ops table IDs) in repo-root `.env`. Publish also needs `SANITY_API_TOKEN` and the deploy webhook secrets.

## Stock / breakeven / cashflow

Unchanged — see earlier sections in git history or edit those HTML tools directly. Stock still syncs from Drive with `npm run sync -w @gwenda/ops`.

## Password

```bash
cd ops
npx wrangler pages secret put OPS_PASSWORD --project-name gwenda-ops
```

## Deploy

| Trigger | Target |
|---------|--------|
| Push to `main` / `release` (`ops/**`) | [gwenda-ops.pages.dev](https://gwenda-ops.pages.dev) |
| Other branches | `https://<branch>.gwenda-ops.pages.dev` |
