# Ark

Gwenda's code monorepo — marketing site, brand guidelines, and operational utilities. Named for the archive salon: everything we build and preserve in one place.

```
ark/                    ← repo root (GitHub: gwenda-hackney/ark)
├── web/                ← marketing site (Astro → gwenda.co.uk)
│   └── src/
├── brand/              ← brand guidelines (→ brand.gwenda.co.uk)
│   └── src/
├── utils/              ← CLI tools and Cloudflare Workers
│   ├── event-invites/
│   └── recipe-cost-webhook/
├── .github/            ← shared CI/CD and cross-project scripts
├── .devcontainer/      ← Node 24 + Python 3.12
└── package.json        ← npm workspaces root
```

## Quick start

```bash
npm install
npm run dev           # Astro site at :4321
npm run sync:brand    # site colours → brand guidelines
npm test              # site unit tests
```

Open **`ark/.devcontainer/`** in Cursor for the full dev environment.

## Projects

| Directory | Package | Deploy |
|-----------|---------|--------|
| [`web/`](web/) | `@gwenda/web` | [gwenda.co.uk](https://gwenda.co.uk) via CI |
| [`brand/`](brand/) | `@gwenda/brand` | [brand.gwenda.co.uk](https://brand.gwenda.co.uk) via CI |
| [`utils/`](utils/) | per-tool | Workers deploy via CI when their directory changes |

See [docs/monorepo.md](docs/monorepo.md) for layout notes.
