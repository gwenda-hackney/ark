# Gwenda marketing site

Astro site for [gwenda.co.uk](https://gwenda.co.uk) — Cloudflare Pages with Functions for the password gate and subscribe API.

Part of the Gwenda monorepo (repo root is one level up).

## Development

```bash
# From repo root
npm run dev

# Or from this directory
npm run dev -w @gwenda/web
```

## Sites

| Environment | URL | Branch |
|-------------|-----|--------|
| **Staging** | [gwenda-staging.pages.dev](https://gwenda-staging.pages.dev) | `main` |
| **Production** | [gwenda.co.uk](https://gwenda.co.uk) | `release` |

![Staging deployment](https://img.shields.io/github/deployments/gwenda-hackney/ark/staging?label=staging)
![Production deployment](https://img.shields.io/github/deployments/gwenda-hackney/ark/production?label=production)

Deployment history: [github.com/gwenda-hackney/ark/deployments](https://github.com/gwenda-hackney/ark/deployments)

## Branch flow

GitLab Flow with a long-running `release` branch:

1. **Develop on `main`** — verify + deploy to staging.
2. **Release** — merge `main` into `release`, push (production preview), then manually promote.

## Layout

```
web/
├── src/           Pages, components, config
├── public/        Static assets
├── functions/     Cloudflare Pages Functions
├── scripts/       Build helpers, CI scripts
├── astro.config.mjs
└── wrangler.toml
```

CI/CD workflows live at `../.github/workflows/`.
