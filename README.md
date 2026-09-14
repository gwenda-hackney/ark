# Ark

Gwenda's code monorepo — marketing site, CMS, brand guidelines, and operational utilities. Named for the archive salon: everything we build and preserve in one place.

```
ark/
├── web/                ← marketing site (Astro → Cloudflare Pages)
├── studio/             ← Sanity CMS (website content & copy)
├── brand/              ← brand guidelines (→ brand.gwenda.co.uk)
├── ops/                ← internal ops HTML (→ gwenda-ops.pages.dev)
├── utils/              ← CLI tools and Cloudflare Workers
├── docs/               ← cross-project guides (Sanity, monorepo, colours)
├── .github/            ← CI/CD workflows
└── package.json        ← npm workspaces root
```

## Live URLs

| | Site | Studio |
|---|------|--------|
| **Production** | [gwenda.co.uk](https://gwenda.co.uk) | [gwenda.sanity.studio](https://gwenda.sanity.studio) |
| **Staging** | [gwenda-staging.pages.dev](https://gwenda-staging.pages.dev) | [gwenda-dev.sanity.studio](https://gwenda-dev.sanity.studio) |
| **Local** | [localhost:4321](http://localhost:4321) | [localhost:3333](http://localhost:3333) |

## Quick start

```bash
npm install
export BW_SESSION=$(bw unlock --raw)   # after bw login (EU: vault.bitwarden.eu)
npm run env:pull                       # Bitwarden → repo-root .env
npm run dev             # Astro site at http://localhost:4321
npm run studio          # Sanity Studio at http://localhost:3333
```

Secrets come from Bitwarden, not from minting new API tokens. See **[docs/env.md](docs/env.md)**. Open **`.devcontainer/`** in Cursor for the full env (Node 24, Python, `gh`, `bw`, ImageMagick, plus nest docs tools: pandoc, csvkit). The Gwenda nest workspace builds this same Dockerfile.

## Projects

### Web — [`web/`](web/)

Astro marketing site for [gwenda.co.uk](https://gwenda.co.uk). Staging on `main`, production on `release`. Editorial content and copy from Sanity are baked in at build time (migration ongoing).

→ **[web/README.md](web/README.md)** — environments, Studio links, branch flow, layout

### Studio — [`studio/`](studio/)

Sanity CMS — the editorial source for website data and copy. Hosted Studio for editors; **Deploy site** rebuilds the website from published content. Not all pages are in the CMS yet.

→ **[studio/README.md](studio/README.md)** — quick start, hosted URLs, schema  
→ **[docs/sanity.md](docs/sanity.md)** — tokens, datasets, content deploy setup

### Brand — [`brand/`](brand/)

Static HTML brand guidelines at [brand.gwenda.co.uk](https://brand.gwenda.co.uk). Colour tokens synced from the marketing site.

→ **[brand/README.md](brand/README.md)** — layout, colour sync, deploy

### Ops — [`ops/`](ops/)

Password-gated internal tools (menu prices & stock) at [gwenda-ops.pages.dev](https://gwenda-ops.pages.dev). Edit in `gdrive/operations/stock/`, sync into `ops/`, then deploy.

→ **[ops/README.md](ops/README.md)** — sync, password secret, deploy

### Utils — [`utils/`](utils/)

Operational tools: private event-invite CLI, ClickUp recipe-cost webhook, Studio→GitHub site-deploy webhook.

→ **[utils/README.md](utils/README.md)** — tool index and development notes

## Docs

| Guide | Contents |
|-------|----------|
| [docs/monorepo.md](docs/monorepo.md) | Layout, CI path filters, brand sync |
| [docs/env.md](docs/env.md) | Bitwarden → local `.env` (`npm run env:pull`) |
| [docs/sanity.md](docs/sanity.md) | CMS environments, tokens, content deploy |
| [docs/colors.md](docs/colors.md) | Brand colour reference |

## Common commands

```bash
npm run env:pull               # Bitwarden → .env (see docs/env.md)
npm run dev                    # local site
npm run studio                 # local Studio
npm run build                  # production site build
npm test                       # site unit tests
npm run sync:brand             # site colours → brand guidelines
npm run setup:sanity-tokens  # Editor local + Viewer/Deploy Studio → GitHub (+ Bitwarden)
npm run setup:site-deploy      # Studio content-deploy webhook + secrets (first-time / repair)
```
