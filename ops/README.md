# Gwenda ops tools

Password-gated internal HTML tools on Cloudflare Pages (menu prices & stock).

Live: [gwenda-ops.pages.dev](https://gwenda-ops.pages.dev) (optional custom domain later: `ops.gwenda.co.uk`).

## Layout

```
ops/
├── src/
│   ├── index.html     ← hub with links to tools
│   ├── stock/         ← menu prices & stock (synced from mydrive)
│   ├── gate/          ← password form (/gate)
│   └── robots.txt
├── functions/         ← Pages Functions password gate
└── scripts/sync-from-mydrive.mjs
```

## Edit → publish

1. Edit the working copy: `mydrive/operations/stock/master-stock-pricing.html`
2. Sync into this package: `npm run sync -w @gwenda/ops` (writes `src/stock/index.html`)
3. Deploy: `npm run deploy:production -w @gwenda/ops`

Requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the environment (see repo `.env.example`).

## Password

Set the Pages secret once:

```bash
cd ops
npx wrangler pages secret put OPS_PASSWORD --project-name gwenda-ops
```

Optional shareable bypass link: set `OPS_BYPASS_KEY`, then open `https://gwenda-ops.pages.dev/?access=<key>`.

## Deploy

| Trigger | Target | URL |
|---------|--------|-----|
| Push to `main` or `release` (`ops/**`) | Production (`--branch main`) | [gwenda-ops.pages.dev](https://gwenda-ops.pages.dev) |
| Push to any other branch (`ops/**`) | Branch preview | `https://<branch>.gwenda-ops.pages.dev` |
| Manual | [Deploy ops](../.github/workflows/deploy-ops.yml) | preview or production |
