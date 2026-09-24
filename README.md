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
npm run env:ark:pull      # SM Ark → .env.ark (Cloudflare)
npm run env:web:pull      # SM Ark/Web → .env.web
npm run dev               # marketing site → http://localhost:4321
npm run studio            # Sanity Studio → http://localhost:3333
```

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
