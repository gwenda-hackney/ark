# Copilot instructions — Gwenda web

Repository custom instructions for GitHub Copilot and coding agents working on this project.

## Project

Static marketing site for Gwenda (canalside ristobar, Hackney Wick). **Astro 4** static output deployed to **Cloudflare Pages** with **Pages Functions** for server logic.

| Environment | Branch    | Cloudflare Pages project | URL                            |
| ----------- | --------- | ------------------------ | ------------------------------ |
| Staging     | `main`    | `gwenda-staging`         | https://gwenda-staging.pages.dev |
| Production  | `release` | `gwenda`                 | https://gwenda.co.uk           |

## Branch flow

- Develop on **`main`** → [Deploy staging](workflows/deploy-staging.yml): verify → deploy → smoke test.
- **Production requires explicit authorization.** Do not merge `main` into `release`, push to `release`, open a production deploy PR, or run production deploy steps unless the user clearly asks (e.g. “deploy to production”, “push release”). Default after changes: commit and push **`main`** only, then verify staging.
- When authorized: merge `main` into **`release`**, push → [Deploy production](workflows/deploy-production.yml): verify → deploy **preview** → smoke test preview. After reviewing the preview link in the job summary, run [Promote production to live](workflows/deploy-production-promote.yml) → live deploy → ensure prod domains → smoke test → CalVer tag.

**Production manual gate:** Promotion is a separate `workflow_dispatch` workflow (private repos cannot use GitHub Environment required reviewers without Enterprise). Preview URL is the `release-preview` branch alias from the deploy step (currently `https://release-preview.gwenda-blue.pages.dev`).

There is no separate CI workflow. Quality gates run on every push to `main`; a PR into `release` promotes already-verified code.

Do not push directly to `release` without going through `main` first.

## Architecture

```
src/           Pages, components, styles, client JS, imported assets
functions/     Pages Functions — _middleware.js (gate), api/auth, api/subscribe
scripts/       Build post-processors, Cloudflare API helpers
scripts/ci/    Deploy orchestration (secrets sync, smoke test, tagging)
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
- **Verify before deploy:** reusable workflow `verify.yml` (build → test). Called by both deploy workflows.
- **Deploy logic:** `actions/deploy-pages/action.yml` + `scripts/ci/*` — keep workflows thin; do not add inline bash loops to YAML.
- **Wrangler config:** `wrangler.toml` (gwenda — `[vars]` + `[env.preview.vars]`) and `wrangler.staging.toml` (gwenda-staging). Plain vars sync on deploy; secrets via `sync-pages-secrets.mjs`.
- **Production promote:** preview job uploads `production-dist` artifact; promote workflow downloads it and deploys with `skip-build: true` to the `release` branch (production environment).
- **Production custom domains:** `ensure-pages-domain.mjs` for `gwenda.co.uk` and `www.gwenda.co.uk` only (production deploy).
- **Staging URL:** `gwenda-staging.pages.dev` only — no custom domain in zone (keeps staging out of prod Web Analytics).
- **Web Analytics:** Cloudflare dashboard zone auto-inject on production only; no analytics CI scripts or manual HTML beacons.
- **Smoke tests:** `scripts/ci/smoke-test.mjs` — homepage (gate bypass on staging), `/api/subscribe`, critical `/_astro/` assets, `/robots.txt`, `X-Gwenda-Version` must match `--expected-version`.
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

- **Do not deploy to production without explicit user authorization** — no merges/pushes to `release`, no production workflow triggers, no manual prod Cloudflare deploys unless the user asks.
- Do not add a `public/` folder for assets — use `src/assets/` imports.
- Do not reintroduce a standalone CI workflow on `main` — verify already runs inside Deploy staging.
- Do not reattach `staging.gwenda.co.uk` without explicit request — staging uses `pages.dev` to stay out of prod analytics.
- Do not introduce Pulumi/Terraform unless explicitly requested — Cloudflare provisioning uses Node scripts.
- Do not add CodeQL or heavy SAST unless requested — lint + targeted Vitest tests are the standard.
- Do not force-push `main` or `release`.

## Manual Cloudflare helpers

```bash
npm run ensure:project   # Create/update Pages project
npm run ensure:domain    # Attach custom domain + DNS (CUSTOM_DOMAIN, ZONE_NAME)
```

## Related docs

- [README.md](../README.md) — full setup, branch flow, rollback
- [.env.example](../.env.example) — local env reference
