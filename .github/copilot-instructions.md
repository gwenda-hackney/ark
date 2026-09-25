# Copilot instructions — Gwenda web

Repository custom instructions for GitHub Copilot and coding agents working on this project.

## Project

Static marketing site for Gwenda (canalside ristobar, Hackney Wick). **Astro 4** static output deployed to **Cloudflare Pages** with **Pages Functions** for server logic.

| Environment | Branch    | Cloudflare Pages project | URL                            | Sanity dataset | Perspective | Studio |
| ----------- | --------- | ------------------------ | ------------------------------ | -------------- | ----------- | ------ |
| Local       | `develop` | local `npm run web:dev`      | http://localhost:4321          | `staging`      | drafts      | localhost Studio |
| Staging     | `main`    | `gwenda-staging`         | https://gwenda-staging.pages.dev | `staging`    | published   | [gwenda-dev.sanity.studio](https://gwenda-dev.sanity.studio) |
| Production  | promote (`release` pointer) | `gwenda` | https://gwenda.co.uk | `production` (copied by ops Release) | published | [gwenda.sanity.studio](https://gwenda.sanity.studio) |

Two datasets only (`staging` + `production`). Local Studio and `npm run web:dev` share staging with a drafts overlay. Hosted builds ignore drafts.

## Branch flow

- Develop on **`develop`** → [Web](workflows/web.yml) verify only. No hosted development site. Work in local Studio; leave WIP as drafts.
- Merge to **`main`** → verify → staging deploy from published staging → smoke test.
- **Promote to staging** (ops Web / Dev Studio) rebuilds gwenda-staging from published documents.
- **Production requires explicit authorization.** Do not promote to live unless the user clearly asks. Default after changes: commit and push **`develop`** (or merge to `main` for staging), then verify staging.
- Live website, ops, brand, and production Studio each promote on their own manual workflow, and only from **`release`**. `main` deploys staging and previews. Merging to `release` does not deploy production.
- Website: [Web promote](workflows/web-promote.yml) on `release` clones Sanity `staging` → `production` and deploys gwenda.co.uk. It does not move `release`.
- Ops: [Apps](workflows/apps.yml) workflow dispatch, app `ops`, target production, branch `release`. Pushing `main` does not update gwenda-ops.

**Production manual gate:** Run the workflow from the `release` branch. A dispatch from `main` fails. This private repo cannot enable GitHub branch protection, so the workflows enforce the branch check themselves.

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
- **Deploy logic:** `actions/deploy-pages/action.yml` + `marketing/web/scripts/ci/*` — keep workflows thin; do not add inline bash loops to YAML.
- **Wrangler config:** `wrangler.toml` (gwenda — `[vars]` + `[env.preview.vars]`) and `wrangler.staging.toml` (gwenda-staging). Plain vars (SMTP host/port, invite URLs) live in wrangler; runtime secrets sync only via `web-secrets.yml` / `ops-secrets.yml` → `sync-pages-secrets.mjs` (Bitwarden SM → Pages). Deploys do not push secrets.
- **Production promote:** preview job uploads `production-dist` artifact; promote workflow downloads it and deploys with `skip-build: true` to the `release` branch (production environment).
- **Production custom domains:** `ensure-pages-domain.mjs` for `gwenda.co.uk` and `www.gwenda.co.uk` only (production deploy).
- **Staging URL:** `gwenda-staging.pages.dev` only — no custom domain in zone (keeps staging out of prod Web Analytics).
- **Web Analytics:** Cloudflare dashboard zone auto-inject on production only; no analytics CI scripts or manual HTML beacons.
- **Smoke tests:** `scripts/ci/smoke-test.mjs` — homepage (gate bypass on staging), `/api/subscribe`, critical `/_astro/` assets, `/robots.txt`, `X-Gwenda-Version` must match `--expected-version`.
- **Secrets:** Bitwarden SM is source of truth (Ark / Ark/Ops / Ark/Web). GitHub keeps only `BWS_ACCESS_TOKEN`. Never commit secrets.

## Code quality

- Run `npm run lint` and `npm test` before proposing changes.
- Match existing style; ESLint + Prettier are enforced in CI.
- Prefer minimal, focused diffs. Reuse existing helpers in `functions/_lib/` and `scripts/`.
- Add unit tests for security-sensitive logic in `functions/_lib/` (Vitest). See issue #6 for coverage backlog.

## Configuration

- Local: `npm run env:pull` (Bitwarden note `ark/.env.local`), then `npm run env:secrets:pull` (one `.env.secrets` under SM names; `with-env` / `with-ops-env` map them per app). See [docs/env.md](../docs/env.md) and [docs/config.md](../docs/config.md).
- Staging gate: `SITE_PASSWORD` (Bitwarden Ark/Web → Cloudflare Pages via `web-secrets.yml`).
- Secrets in Bitwarden SM follow one rule: `NAME` is shared, `NAME__LOCAL` / `__STAGING` / `__PRODUCTION` overrides it for that env. Per-app key lists and renames live in `scripts/lib/bitwarden-sm.mjs` (`APP_SECRETS`). Do not add fallbacks across envs.
- Subscribe: `SUBSCRIBE_SECRET`, `BASEROW_API_KEY` (runtime name; SM `BASEROW_WEBSITE_API_KEY__<ENV>`). Subscribe, Event Invites, and Form Submissions tables are resolved by name. The token selects the Website database.
- Runtime non-secret config (pour targets, `forms.notify_email`, Sanity dataset…): Baserow **Gwenda Config** database, read via `shared/config-db.js` with `BASEROW_CONFIG_API_KEY`. Rows are profiled by Env and Service; a runtime only writes its own Env rows. Ops table ids are resolved by name from the Baserow catalog (optional `BASEROW_OPS_DATABASE_ID` only). Marketing product flags stay in Sanity `siteSettings`.
- Opening year: `PUBLIC_OPENING_DATE` (GitHub variable, build-time; Story Est. year).
## What not to do

- **Do not deploy to production without explicit user authorization** — no ops promote, no production workflow triggers, no manual prod Cloudflare deploys unless the user asks.
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
- [docs/env.md](../docs/env.md) — Bitwarden → local `.env`
- [.env.example](../.env.example) — local env reference
