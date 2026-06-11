# Copilot instructions — Gwenda web

Repository custom instructions for GitHub Copilot and coding agents working on this project.

## Project

Static marketing site for Gwenda (canalside ristobar, Hackney Wick). **Astro 4** static output deployed to **Cloudflare Pages** with **Pages Functions** for server logic.

| Environment | Branch    | Cloudflare Pages project | URL                                                            |
| ----------- | --------- | ------------------------ | -------------------------------------------------------------- |
| Staging     | `main`    | `gwenda-staging`         | https://staging.gwenda.co.uk (also `gwenda-staging.pages.dev`) |
| Production  | `release` | `gwenda`                 | https://gwenda.co.uk                                           |

## Branch flow

- Develop on **`main`** → [Deploy staging](workflows/deploy-staging.yml): verify → deploy → smoke test.
- Release: merge `main` into **`release`**, push → [Deploy production](workflows/deploy-production.yml): same steps → CalVer tag.

There is no separate CI workflow. Quality gates run on every push to `main`; a PR into `release` promotes already-verified code.

Do not push directly to `release` without going through `main` first.

## Architecture

```
src/           Pages, components, styles, client JS, imported assets
functions/     Pages Functions — _middleware.js (gate), api/auth, api/subscribe
scripts/       Build post-processors, Cloudflare API helpers
scripts/ci/    Deploy orchestration (secrets sync, smoke test, rollback)
dist/          Build output (gitignored)
```

- **No `public/` folder.** Static assets go in `src/assets/` and are imported in `.astro` files.
- **Share preview image:** `src/assets/images/social/logo-board.png` → `SocialMeta.astro` (Open Graph / Twitter).
- **SEO files** (`robots.txt`, `sitemap.xml`, `_headers`) are generated at build time by scripts in `scripts/`.
- **Version headers:** CalVer `YYYY.MM.DD+shortsha` via `scripts/compute-build-version.mjs`.

## Server logic (Pages Functions)

| Path                                   | Role                                                     |
| -------------------------------------- | -------------------------------------------------------- |
| `functions/_middleware.js`             | Staging password gate                                    |
| `functions/_lib/site-auth.js`          | Gate tokens, cookies, redirect safety, crawler allowlist |
| `functions/_lib/subscribe-auth.js`     | CSRF + secret header for subscribe POST                  |
| `functions/_lib/subscribe-honeypot.js` | Bot honeypot (silent success)                            |
| `functions/_lib/subscribe.js`          | Baserow email append                                     |
| `functions/api/subscribe.js`           | Subscribe API (production)                               |
| `functions/preview/_middleware.js`     | Basic auth for `/preview/*`                              |

`astro.config.mjs` stubs `/api/subscribe` in local dev only.

## CI/CD conventions

- **Node 24 + npm 11** via Corepack (`packageManager` in `package.json`). Workflows run `corepack enable` before `npm ci`.
- **Verify before deploy:** reusable workflow `verify.yml` (lint → build → test). Called by both deploy workflows.
- **Deploy logic:** `actions/deploy-pages/action.yml` + `scripts/ci/*` — keep workflows thin; do not add inline bash loops to YAML.
- **Staging custom domain:** `ensure-pages-domain.mjs` with `CUSTOM_DOMAIN=staging.gwenda.co.uk`, `ZONE_NAME=gwenda.co.uk`.
- **Deploy pipeline:** `deploy-staging.yml` and `deploy-production.yml` are mirrored — build, deploy, ensure domain (staging only), live smoke test, summary (+ CalVer tag on production). Keep them in sync when changing deploy steps.
- **Smoke tests:** `scripts/ci/smoke-test.mjs` — `/`, `/robots.txt`, `X-Gwenda-Version` must match `--expected-version`.
- **Secrets:** synced via `scripts/ci/sync-pages-secrets.mjs` profiles (`staging` | `production`). Never commit secrets.

## Code quality

- Run `npm run lint` and `npm test` before proposing changes.
- Match existing style; ESLint + Prettier are enforced in CI.
- Prefer minimal, focused diffs. Reuse existing helpers in `functions/_lib/` and `scripts/`.
- Add unit tests for security-sensitive logic in `functions/_lib/` (Vitest). See issue #6 for coverage backlog.

## Configuration

- Local: copy `.env.example` → `.env`.
- Staging gate: `SITE_PASSWORD` (GitHub secret + Cloudflare Pages secret).
- Subscribe: `SUBSCRIBE_SECRET`, `BASEROW_API_KEY`. Table IDs: `BASEROW_STAGING_TABLE_ID` (staging, default `1024006`), `BASEROW_TABLE_ID` (production).
- Countdown: `PUBLIC_OPENING_DATE` (GitHub variable, build-time).

## What not to do

- Do not add a `public/` folder for assets — use `src/assets/` imports.
- Do not let `deploy-staging.yml` and `deploy-production.yml` diverge — they must run the same steps.
- Do not reintroduce a standalone CI workflow on `main` — verify already runs inside Deploy staging.
- Do not introduce Pulumi/Terraform unless explicitly requested — Cloudflare provisioning uses Node scripts.
- Do not add CodeQL or heavy SAST unless requested — lint + targeted Vitest tests are the standard.
- Do not force-push `main` or `release`.

## Manual Cloudflare helpers

```bash
npm run ensure:project   # Create/update Pages project
npm run ensure:domain    # Attach custom domain + DNS (CUSTOM_DOMAIN, ZONE_NAME)
npm run resolve:analytics
npm run setup:analytics
```

## Related docs

- [README.md](../README.md) — full setup, branch flow, rollback
- [.env.example](../.env.example) — local env reference
