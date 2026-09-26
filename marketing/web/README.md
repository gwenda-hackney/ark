# Gwenda marketing site

Astro site for [gwenda.co.uk](https://gwenda.co.uk) — Cloudflare Pages with Functions for the password gate and subscribe API. Website content and copy from Sanity are included at build time; more pages are moving into the CMS over time.

Part of the Gwenda monorepo (`marketing/web/` under the ark root).

## Environments

Each environment's Sanity project has one dataset, `production`. A preview shows drafts over published documents; a live site shows published only.

| | Site | Sanity | Git branch | Perspective |
|---|------|--------|------------|-------------|
| **Local** | [localhost:4321](http://localhost:4321) (`npm run web:dev`), [:4322](http://localhost:4322) (`web:dev:live`) | Gwenda Dev | your branch | drafts / published |
| **Dev** | [preview.gwenda-web-dev.pages.dev](https://preview.gwenda-web-dev.pages.dev), [gwenda-web-dev.pages.dev](https://gwenda-web-dev.pages.dev) | Gwenda Dev | `main` | drafts / published |
| **Prod** | [preview.gwenda-blue.pages.dev](https://preview.gwenda-blue.pages.dev), [gwenda.co.uk](https://gwenda.co.uk) | Gwenda Web | `release` (live via Web promote) | drafts / published |

![Preview deployment](https://img.shields.io/github/deployments/gwenda-hackney/ark/preview?label=preview)
![Production deployment](https://img.shields.io/github/deployments/gwenda-hackney/ark/production?label=production)

Deployment history: [github.com/gwenda-hackney/ark/deployments](https://github.com/gwenda-hackney/ark/deployments)

**Content** goes live when ops publishes the drafts; the live site then rebuilds. See [docs/sanity.md](../../docs/sanity.md#workflows).

## Development

```bash
# From repo root
npm run web:dev

# Or from this directory
npm run web:dev
```

Repo-root `.env` supplies `SANITY_*` for local builds. `npm run web:dev` overlays Sanity drafts, like a preview; live builds use published documents only (`SANITY_PERSPECTIVE`). See [docs/sanity.md](../../docs/sanity.md).

## Branch flow

Gitflow-style: `develop` is WIP, `main` is dev, `release` is prod's preview, and live is promote-only.

1. **Develop on `develop`** — local Studio + `npm run web:dev` against Gwenda Dev with drafts. CI verifies.
2. **Dev** — merge to `main`. CI deploys both dev sites and tests them against dev data.
3. **Preview** — merge `main` into `release`. CI deploys prod's preview (the release code on drafts) and runs the deep smoke test.
4. **Live** — run Web promote from `release`: it rebuilds gwenda.co.uk from published documents.
5. **Feature branches** — push `marketing/web/**` (except `develop` / `release`) → branch preview on the dev website, with dev data.

Pushing `release` does not change the live site. Emergency hotfixes land on `main`, then `release`, then promote. Leave `develop` WIP alone.

Schema and site code follow git. Content lives in one Sanity dataset per environment; ops publishes drafts to put them live. Baserow subscribers and RSVPs are not copied.

## Layout

```
web/
├── src/           Pages, components, Sanity queries, config
├── public/        Static assets
├── functions/     Cloudflare Pages Functions
├── scripts/       Build helpers, CI scripts
├── astro.config.mjs
└── wrangler.toml
```

## Related

- [studio/README.md](../studio/README.md) — CMS schema and Studio commands
- [docs/sanity.md](../../docs/sanity.md) — full CMS workflow
- [docs/monorepo.md](../../docs/monorepo.md) — CI workflows and path filters

CI/CD workflows live at `../.github/workflows/`.
