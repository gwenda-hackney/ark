# Gwenda marketing site

Astro site for [gwenda.co.uk](https://gwenda.co.uk) — Cloudflare Pages with Functions for the password gate and subscribe API. Website content and copy from Sanity are included at build time; more pages are moving into the CMS over time.

Part of the Gwenda monorepo (repo root is one level up).

## Environments

| | Site | Studio | Git branch | Sanity dataset |
|---|------|--------|------------|----------------|
| **Local** | [localhost:4321](http://localhost:4321) (`npm run dev`) | [localhost:3333](http://localhost:3333) (`npm run studio`) | — | `development` |
| **Staging** | [gwenda-staging.pages.dev](https://gwenda-staging.pages.dev) | [gwenda-dev.sanity.studio](https://gwenda-dev.sanity.studio) | `main` | `development` |
| **Production** | [gwenda.co.uk](https://gwenda.co.uk) | [gwenda.sanity.studio](https://gwenda.sanity.studio) | `release` | `production` |

![Staging deployment](https://img.shields.io/github/deployments/gwenda-hackney/ark/staging?label=staging)
![Production deployment](https://img.shields.io/github/deployments/gwenda-hackney/ark/production?label=production)

Deployment history: [github.com/gwenda-hackney/ark/deployments](https://github.com/gwenda-hackney/ark/deployments)

**Content deploys** (published CMS → site rebuild) are triggered from Studio → **Deploy site**, not from git pushes. Staging is one click; production is preview → promote. See [docs/sanity.md](../docs/sanity.md#deploy-published-content-to-the-website).

## Development

```bash
# From repo root
npm run dev

# Or from this directory
npm run dev -w @gwenda/web
```

Repo-root `.env` supplies `SANITY_*` for local builds. See [docs/sanity.md](../docs/sanity.md).

## Branch flow

GitLab Flow with a long-running `release` branch:

1. **Develop on `main`** — verify + deploy to staging (development dataset).
2. **Feature branches** — push `web/**` changes → branch preview on `gwenda-staging` (see [deploy-web-preview.yml](../.github/workflows/deploy-web-preview.yml)).
3. **Release** — merge `main` into `release`, push (production preview), then manually promote to live.

Schema and site code promote via git. Editorial content promotes separately in Sanity (dev dataset → prod dataset, then Studio **Deploy site**: staging one-click, production preview → promote).

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
- [docs/sanity.md](../docs/sanity.md) — full CMS workflow
- [docs/monorepo.md](../docs/monorepo.md) — CI workflows and path filters

CI/CD workflows live at `../.github/workflows/`.
