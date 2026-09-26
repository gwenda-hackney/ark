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
bw-unlock                 # the login; npm scripts then load secrets in memory (docs/env.md)
git config user.email you@gwenda.co.uk   # your local form emails go here too; no .env needed
npm run dev:refresh           # copy real data into your dev copies (Sanity + Baserow)
npm run web:dev               # website, dev copy → http://localhost:4321 (web:dev:live → :4322)
npm run ops:dev               # ops, dev copy → http://localhost:5174
npm run studio:dev            # Sanity Studio, dev copy → http://localhost:3333
```

Commands say which environment they touch: `dev` is your copy, `prod` is the real thing (`ops:prod` runs ops locally on real data). See [docs/sanity.md](docs/sanity.md#environments).

## Environments

There are two environments, built the same way. Each is a complete, separate copy: its own ops app, website, CMS (one Sanity dataset) and databases.

- **Prod** is the real thing. Guests see it.
- **Dev** is for testing. Nothing done there can reach gwenda.co.uk.

**Live and preview.** Each environment's website comes in two versions:

- **Live**: what visitors see.
- **Preview**: the same site showing changes saved in ops or Studio (Sanity drafts) but not yet published with **Update website**. Password-protected. Otherwise it is the live environment: forms on prod's preview are real submissions.

**Code** on `main` runs in dev. Code on `release` runs prod's preview, and goes live with Web promote. **Data** only moves by copying: `npm run dev:refresh` copies prod into dev.

### Prod

**Websites**
- Live: [gwenda.co.uk](https://gwenda.co.uk)
- Preview: [preview.gwenda-blue.pages.dev](https://preview.gwenda-blue.pages.dev) (ribbon says "Preview"): the `release` code on drafts

**Ops:** [gwenda-ops.pages.dev](https://gwenda-ops.pages.dev)

**CMS:** Sanity project "Gwenda Web" (`pn5yjro6`), [manage](https://www.sanity.io/manage/project/pn5yjro6)
- Studio: [gwenda.sanity.studio](https://gwenda.sanity.studio). It saves drafts only; ops publishes.

**Databases:** Baserow workspace "Gwenda", [dashboard](https://baserow.io/dashboard): "Gwenda Ops" and "Website" (found by name; no ids are configured, see [docs/config.md](docs/config.md#baserow-no-ids))

**Other:** [brand.gwenda.co.uk](https://brand.gwenda.co.uk) (brand guidelines), [health.gwenda.co.uk](https://health.gwenda.co.uk) (site health)

### Dev

**Websites**
- Live: [gwenda-web-dev.pages.dev](https://gwenda-web-dev.pages.dev) (ribbon says "Dev")
- Preview: [preview.gwenda-web-dev.pages.dev](https://preview.gwenda-web-dev.pages.dev) (ribbon says "Dev · preview")

**Ops:** [gwenda-ops-dev.pages.dev](https://gwenda-ops-dev.pages.dev) (Update website here only changes the dev websites)

**CMS:** Sanity project "Gwenda Dev" (`gwscpagy`), [manage](https://www.sanity.io/manage/project/gwscpagy). Studio: `npm run studio:dev`.

**Databases:** Baserow workspace "Gwenda Dev", [dashboard](https://baserow.io/dashboard): copies of "Gwenda Ops" and "Website"

### Dev on your machine

The same dev copies, run locally:

| Command | What | Address |
|---------|------|---------|
| `npm run web:dev` | Website, preview | http://localhost:4321 |
| `npm run web:dev:live` | Website, live | http://localhost:4322 |
| `npm run ops:dev` | Ops | http://localhost:5174 |
| `npm run studio:dev` | Studio | http://localhost:3333 |

`npm run ops:prod` is the exception: ops on your machine with **real prod data** (red banner).

### Shared by both

- **Settings:** the "Gwenda Config" Baserow database (`569392`). Each row is marked with its environment; dev is called `local` there.
- **Secrets:** Bitwarden Secrets Manager. Dev (your machine and the dev sites) uses the `__DEV` versions.
- **Builds:** the deploy webhook Worker sends each ops app's builds to its own website.

More detail: [docs/sanity.md](docs/sanity.md#environments).

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
