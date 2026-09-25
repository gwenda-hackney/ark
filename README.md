# Ark — Gwenda monorepo

Marketing site, brand guidelines, Sanity Studio, ops tools, and Cloudflare Workers for [gwenda.co.uk](https://gwenda.co.uk).

```
ark/
├── marketing/
│   ├── web/                      ← marketing site (Astro → Cloudflare Pages)
│   ├── brand/                    ← brand guidelines (→ brand.gwenda.co.uk)
│   ├── studio/                   ← Sanity CMS (guest-facing website content)
│   ├── site-deploy-webhook/      ← Studio → site rebuild Worker
│   ├── subscribe-mailchimp-sync/ ← Baserow → Mailchimp sync Worker
│   └── wifi-captive-portal/      ← UniFi captive portal Worker
├── ops/                          ← internal ops Pages app
│   └── recipe-cost-webhook/
├── docs/
├── scripts/
└── .github/
```

## Quick start

```bash
npm install
npm run env:pull          # Bitwarden Password Manager → .env (bw-unlock once per container)
npm run env:secrets:pull  # Secrets Manager → .env.secrets (all app secrets)
npm run dev:refresh           # copy real data into your dev copies (Sanity + Baserow)
npm run web:dev               # website, dev copy → http://localhost:4321 (web:dev:live → :4322)
npm run ops:dev               # ops, dev copy → http://localhost:5174
npm run studio:dev            # Sanity Studio, dev copy → http://localhost:3333
```

Commands say which environment they touch: `dev` is your copy, `prod` is the real thing (`ops:prod` runs ops locally on real data). gwenda-staging is prod's preview. See [docs/sanity.md](docs/sanity.md#environments).

## Environments

Two environments, **dev** and **prod**, built the same way: each has its own ops app, website (with a preview), Sanity project and Baserow databases. Code on `main` runs in dev and on prod's preview; `release` is what goes live. Data only moves by copying (`npm run dev:refresh` copies prod into dev). Details: [docs/sanity.md](docs/sanity.md#environments).

### Prod

| What | Link |
|------|------|
| **Website** (live) | [gwenda.co.uk](https://gwenda.co.uk) |
| **Website preview** (prod content not yet live, code on `main`; ribbon "Preview") | [gwenda-staging.pages.dev](https://gwenda-staging.pages.dev) |
| Release preview (code on `release` before Web promote) | [release-preview.gwenda-blue.pages.dev](https://release-preview.gwenda-blue.pages.dev) |
| **Ops** | [gwenda-ops.pages.dev](https://gwenda-ops.pages.dev) |
| Brand guidelines | [brand.gwenda.co.uk](https://brand.gwenda.co.uk) |
| Site health | [health.gwenda.co.uk](https://health.gwenda.co.uk) |
| **CMS**: Sanity project Gwenda Web (`pn5yjro6`) | [manage](https://www.sanity.io/manage/project/pn5yjro6) |
| Studio for live content (schema only; don't edit live content) | [gwenda.sanity.studio](https://gwenda.sanity.studio) |
| Studio for preview content (`staging` dataset) | [gwenda-dev.sanity.studio](https://gwenda-dev.sanity.studio) (name predates the dev environment) |
| **Databases**: Baserow workspace Gwenda (`208709`) | [dashboard](https://baserow.io/dashboard) · Ops `556507` · Website `461843` · Website Staging `564496` (the preview's forms) |

### Dev

| What | Link |
|------|------|
| **Website** (dev live content; ribbon "Dev") | [gwenda-web-dev.pages.dev](https://gwenda-web-dev.pages.dev) |
| **Website preview** (dev preview content; ribbon "Dev · preview") | [preview.gwenda-web-dev.pages.dev](https://preview.gwenda-web-dev.pages.dev) |
| **Ops** (hosted; its builds only reach the dev website) | [gwenda-ops-dev.pages.dev](https://gwenda-ops-dev.pages.dev) |
| **CMS**: Sanity project Gwenda Dev (`gwscpagy`) | [manage](https://www.sanity.io/manage/project/gwscpagy) · Studio: `npm run studio:dev` |
| **Databases**: Baserow workspace Gwenda Dev (`239049`) | [dashboard](https://baserow.io/dashboard) · Ops `560292` · Website `563090` |

On your machine, the same dev copies:

| Command | Runs |
|---------|------|
| `npm run web:dev` | Website, dev preview content → http://localhost:4321 |
| `npm run web:dev:live` | Website, dev live content → http://localhost:4322 |
| `npm run ops:dev` | Ops → http://localhost:5174 |
| `npm run studio:dev` | Studio → http://localhost:3333 |
| `npm run ops:prod` | Ops on your machine with **real prod data** (red banner) |

Shared by both: the **Gwenda Config** Baserow database (`569392`, rows per Env; dev is `local`), Bitwarden Secrets Manager (dev secrets are the `__LOCAL` overrides), and the deploy webhook Worker, which routes each ops app's builds to its own website.

See **[docs/monorepo.md](docs/monorepo.md)** for workspaces, deploy triggers, and colour sync.

### Marketing — [`marketing/`](marketing/)

| Package | Role |
|---------|------|
| [`marketing/web/`](marketing/web/) | Guest site |
| [`marketing/studio/`](marketing/studio/) | Sanity Studio for website content |
| [`marketing/brand/`](marketing/brand/) | Brand guidelines site |
| Workers under `marketing/` | Deploy webhook, Mailchimp sync, Wi‑Fi portal |

### Ops — [`ops/`](ops/)

Internal tools and ops-facing Workers. Guest menu marketing content is published from ops into Sanity; ops data does not live in the CMS.

→ **[ops/README.md](ops/README.md)**

### Docs — [`docs/`](docs/)

Environment, Sanity, colours, Instagram invites, and more.
