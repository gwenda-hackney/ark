# Gwenda marketing site

Astro site for [gwenda.co.uk](https://gwenda.co.uk) — Cloudflare Pages with Functions for the password gate and subscribe API. Website content and copy from Sanity are included at build time; more pages are moving into the CMS over time.

Part of the Gwenda monorepo (`marketing/web/` under the ark root).

## Environments

| | Site | Studio | Git branch | Sanity dataset | Perspective |
|---|------|--------|------------|----------------|-------------|
| **Local** | [localhost:4321](http://localhost:4321) (`npm run dev`) | [localhost:3333](http://localhost:3333) (`npm run studio`) | `develop` | `staging` | drafts overlay |
| **Staging** | [gwenda-staging.pages.dev](https://gwenda-staging.pages.dev) | [gwenda-dev.sanity.studio](https://gwenda-dev.sanity.studio) | `main` | `staging` | published only |
| **Production** | [gwenda.co.uk](https://gwenda.co.uk) | [gwenda.sanity.studio](https://gwenda.sanity.studio) | promote (`release` pointer) | `production` | published only |

![Staging deployment](https://img.shields.io/github/deployments/gwenda-hackney/ark/staging?label=staging)
![Production deployment](https://img.shields.io/github/deployments/gwenda-hackney/ark/production?label=production)

Deployment history: [github.com/gwenda-hackney/ark/deployments](https://github.com/gwenda-hackney/ark/deployments)

**Content deploys** rebuild staging from published documents, then copy staging onto production. See [docs/sanity.md](../../docs/sanity.md#deploy-published-content-to-the-website).

## Development

```bash
# From repo root
npm run dev

# Or from this directory
npm run dev -w @gwenda/web
```

Repo-root `.env` supplies `SANITY_*` for local builds. `npm run dev` overlays Sanity drafts. Staging and production builds use published documents only. See [docs/sanity.md](../../docs/sanity.md).

## Branch flow

Gitflow-style: `develop` is WIP, `main` is staging, production is promote-only.

1. **Develop on `develop`** — local Studio + `npm run dev` against the staging dataset with drafts. CI verifies. There is no hosted development site.
2. **Stage code** — merge to `main`. CI deploys gwenda-staging from **published** staging documents (drafts ignored).
3. **Promote to staging** — publish in Studio, then ops Web or Dev Studio rebuilds gwenda-staging.
4. **Publish live** — ops Website → Staging → live copies reviewed staging documents to `production` and rebuilds live from `release`.
5. **Feature branches** — push `marketing/web/**` (except `develop` / `release`) → branch preview on `gwenda-staging`.

Do not push `release` to go live. Emergency hotfixes land on `main`, review on staging, then promote. Leave `develop` WIP alone.

Schema and site code follow git. Editorial content lives in two Sanity datasets (`staging` and `production`). Production gets staging documents through ops Website → Staging → live. Baserow subscribers and RSVPs are not copied.

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
