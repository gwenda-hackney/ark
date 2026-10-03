# Copilot instructions — Gwenda web

Repository custom instructions for GitHub Copilot and coding agents working on this project.

## Project

Static marketing site for Gwenda (canalside ristobar, Hackney Wick). **Astro 4** static output deployed to **Cloudflare Pages** with **Pages Functions** for server logic.

| Site | Branch | Cloudflare Pages project (branch) | URL | Sanity | Perspective |
| ---- | ------ | --------------------------------- | --- | ------ | ----------- |
| Local | your branch | `npm run web:dev` / `web:dev:live` | http://localhost:4321 / :4322 | Gwenda Dev | drafts / published |
| Dev preview / live | `main` | `gwenda-web-dev` (`preview` / `main`) | https://preview.gwenda-web-dev.pages.dev, https://gwenda-web-dev.pages.dev | Gwenda Dev | drafts / published |
| Prod preview | `release` | `gwenda` (`preview`) | https://preview.gwenda-blue.pages.dev | Gwenda Web | drafts |
| Live | promote (`release`) | `gwenda` (`release`) | https://gwenda.co.uk | Gwenda Web | published |

One dataset per Sanity project (`production`). Ops and Studio write drafts; ops publishes them. Previews show drafts over published; live sites show published only. There is no staging environment.

## Branch flow

Every change starts as a GitHub issue and goes through a pull request. Nobody commits straight to `main`.

- **Branch** from `main`: `feat/<issue>-<slug>`, `fix/…`, `chore/…`, `refactor/…`, `test/…`. Pushing it deploys a branch preview of the dev website.
- **Pull request** into `main`, using the template (`Closes #N`, how it was tested, before/after-deploy notes). [PR checks](workflows/pr.yml) run lint and tests for the website, and tests, type check and build for ops. Merge only when they're green (the repo can't enforce branch protection, so this is by convention). Squash-merge and delete the branch.
- Merge to **`main`** → dev: both dev sites and dev ops deploy, tested against dev data.
- Merge `main` into **`release`** → prod's preview deploys (release code on drafts) with the deep smoke test. The live site does not change.
- **Production requires explicit authorization.** Do not promote to live unless the user clearly asks. Default after changes: merge the PR to **`main`** and verify dev.
- Live website, ops, brand, and production Studio each promote on their own manual workflow, and only from **`release`**.
- Website: [Web promote](workflows/web-promote.yml) on `release` rebuilds gwenda.co.uk from published documents. It does not move `release` or copy content.
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
| `functions/_middleware.js`             | Password gate (previews, dev website)                    |
| `functions/_lib/site-auth.js`          | Gate tokens, cookies, redirect safety, crawler allowlist |
| `functions/_lib/subscribe-auth.js`     | CSRF + secret header for subscribe POST                  |
| `functions/_lib/subscribe-honeypot.js` | Bot honeypot (silent success)                            |
| `functions/_lib/subscribe.js`          | Baserow email append                                     |
| `functions/api/subscribe.js`           | Subscribe API (production)                               |
| `functions/preview/_middleware.js`     | Basic auth for `/preview/*`                              |

`astro.config.mjs` stubs `/api/subscribe` in local dev only.

## CI/CD conventions

- **Node 24 + npm 11** via Corepack (`packageManager` in `package.json`). Workflows run `corepack enable` before `npm ci`.
- **Tests:** [PR checks](workflows/pr.yml) run on every pull request (website lint and tests; ops tests, `svelte-check` and build). Each web deploy job also runs the unit tests and checks its own build.
- **Deploy logic:** `actions/deploy-pages/action.yml` + `marketing/web/scripts/ci/*` — keep workflows thin; do not add inline bash loops to YAML.
- **Wrangler config:** `wrangler.toml` (gwenda: `[vars]` live, `[env.preview.vars]` its preview) and `wrangler.dev.toml` (gwenda-web-dev, the same shape). Plain vars (SMTP host/port, invite URLs) live in wrangler; runtime secrets sync only via `web-secrets.yml` / `ops-secrets.yml` → `sync-pages-secrets.mjs` (Bitwarden SM → Pages). Deploys do not push secrets.
- **Production custom domains:** `ensure-pages-domain.mjs` for `gwenda.co.uk` and `www.gwenda.co.uk` only (production deploy).
- **Preview URL:** `preview.gwenda-blue.pages.dev` only — no custom domain in zone (keeps the preview out of prod Web Analytics).
- **Web Analytics:** Cloudflare dashboard zone auto-inject on production only; no analytics CI scripts or manual HTML beacons.
- **Smoke tests:** `scripts/ci/smoke-test.mjs` — homepage (gate bypass on previews), `/api/subscribe`, critical `/_astro/` assets, `/robots.txt`, `X-Gwenda-Version` must match `--expected-version`.
- **Secrets:** Bitwarden SM is source of truth (Ark / Ark/Ops / Ark/Web). GitHub keeps only `BWS_ACCESS_TOKEN`. Never commit secrets.

## Code quality

- Run `npm run lint` and `npm test` before proposing changes.
- Match existing style; ESLint + Prettier are enforced on pull requests (website).
- Prefer minimal, focused diffs. Reuse existing helpers in `functions/_lib/` and `scripts/`.
- Add tests for security-sensitive logic (Vitest; see docs/testing.md). See issue #6 for coverage backlog.

## Configuration

- Local: `bw-unlock` and a git email (`FORMS_NOTIFY_EMAIL` defaults to it); `.env` is optional overrides (`.env.example`); local settings default to the dev copies (`LOCAL_DEFAULTS` in `scripts/lib/load-env.mjs`). Secrets are never in files: `with-env` / `with-ops-env` / `ops:dev` load them from Secrets Manager into memory (RAM cache in `/dev/shm`). If a script says the vault is locked, run `bw-unlock`. See [docs/env.md](../docs/env.md) and [docs/config.md](../docs/config.md).
- Preview gate: `SITE_PASSWORD` (Bitwarden Ark/Web → the Pages preview environment via `web-secrets.yml`).
- Secrets in Bitwarden SM follow one rule: `NAME` is shared, `NAME__DEV` / `NAME__PRODUCTION` overrides it for that env (dev = a developer's machine and the dev sites). Code reads the plain name; never add bespoke per-env names or env checks that pick a secret. Per-app key lists and renames live in `scripts/lib/bitwarden-sm.mjs` (`APP_SECRETS`). Do not add fallbacks across envs.
- Subscribe: `SUBSCRIBE_SECRET`, `BASEROW_API_KEY` (runtime name; SM `BASEROW_WEBSITE_API_KEY__<ENV>`). Subscribe, Event Invites, and Form Submissions tables are resolved by name. The token selects the Website database.
- Runtime non-secret config (pour targets, `forms.notify_email`, Sanity dataset…): Baserow **Gwenda Config** database, read via `shared/config.js` with `BASEROW_CONFIG_API_KEY`. Rows are profiled by Env and Service; a runtime only writes its own Env rows. No Baserow ids are configured: the token picks the workspace (per-env tokens only, `__DEV` / `__PRODUCTION`), and database and table ids are resolved by table names. Marketing product flags stay in Sanity `siteSettings`.
- Opening year: `PUBLIC_OPENING_DATE` (GitHub variable, build-time; Story Est. year).
## What not to do

- **Do not deploy to production without explicit user authorization** — no ops promote, no production workflow triggers, no manual prod Cloudflare deploys unless the user asks.
- Do not add a `public/` folder for assets — use `src/assets/` imports.
- Do not reintroduce a standalone CI workflow on `main` — tests already run inside the deploy jobs.
- Do not reintroduce a staging environment or a second Sanity dataset — the preview is drafts.
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
- [docs/env.md](../docs/env.md) — local env: vault login, secrets in memory, defaults
- [docs/secrets-rebuild.md](../docs/secrets-rebuild.md) — rebuilding every secret if Secrets Manager is lost
- [.env.example](../.env.example) — local env reference
