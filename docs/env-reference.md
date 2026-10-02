# Environment variables: reference

Every secret and setting the apps, Workers, scripts and CI read: what it is for, where it lives, its dev and production names, whether it expires, and what changing it breaks. Checked against Secrets Manager and the providers on 2026-10-02.

- How the secret store works (naming rule, projects, who reads what): [config.md](config.md#secrets-one-naming-rule)
- Loading secrets on your machine and in CI: [env.md](env.md)
- Rebuilding everything from scratch: [secrets-rebuild.md](secrets-rebuild.md)

Lines marked **Planned** describe a change in an open pull request or issue. They are not live yet.

## How to read an entry

- **Secrets Manager (SM):** the stored name, and the project it sits in. `NAME__PRODUCTION` sits in `ark`, `ark/ops` or `ark/web`. `NAME__DEV` and a shared `NAME` sit in `ark-dev`, `ark/ops-dev` or `ark/web-dev`.
- **Dev / production:** whether each environment has its own value (`__DEV` / `__PRODUCTION`), or both share one (`NAME`).
- **Runtime name:** what the code reads, if it differs from the SM name.
- **Used by:** the apps, Workers, scripts and workflows that read it.
- **Gets there by:** how the value reaches its user. For example: a CI pull, a Cloudflare Pages secret, a Worker secret, or your machine's in-memory cache.
- **Expires:** when it stops working on its own.
- **Changing it:** what to run, and what breaks until everything has the new value.

---

## Secrets Manager access

These four tokens unlock everything else. They are Bitwarden machine-account access tokens, not stored in SM themselves.

### `ARK_LOCAL_BW_TOKEN`

- **Machine account:** `ark-local`, read/write on all six projects.
- **Stored in:** the Password Manager vault note `ark/.env.local`. Never in `.env`; the loader warns if it finds it there.
- **Used by:** every script on a developer's machine (`with-env`, `with-ops-env`, `ops:dev`, `setup:*`, `secret:set`, `secrets:move-dev`).
- **Gets there by:** `bw-unlock` opens the vault; the scripts read the token from the session in RAM (`/dev/shm/ark-secrets-<uid>/`).
- **Expires:** never (created without an expiry).
- **Changing it:** make a new access token on `ark-local`, put it in the vault note, run `npm run env:secrets:refresh`, then revoke the old one.

### `ARK_CI_TOKEN`

- **Machine account:** `ark-ci`, read on all six projects.
- **Stored in:** GitHub, as the `production` environment's secret `BWS_ACCESS_TOKEN`.
- **Used by:** every job in the `production` environment, which only accepts the `release` branch: web promote, the prod preview, ops production, brand production, Studio, Workers, Baserow copy, ops and web secrets syncs.
- **Expires:** as set when it was created on 2026-10-02. Check the token list on `ark-ci` in Bitwarden.
- **Changing it:** make a new token on `ark-ci`, set it with `gh secret set BWS_ACCESS_TOKEN --env production`, check one production job, revoke the old token.

### `ARK_CI_DEV_TOKEN`

- **Machine account:** `ark-ci-dev`, read on the three `-dev` projects only. It can't see any `__PRODUCTION` value; a production pull with it stops with "This token can't read production secrets".
- **Stored in:** GitHub, as the `dev` and `preview` environments' secret `BWS_ACCESS_TOKEN`.
- **Used by:** jobs on `main` (dev website, dev ops) and on feature branches (branch previews).
- **Expires:** as set when it was created on 2026-10-02. Check the token list on `ark-ci-dev`.
- **Changing it:** as above, for both `--env dev` and `--env preview`.

### `BWS_ACCESS_TOKEN` (repo-level, retiring)

- **What:** the old `ark-ci` token, as a repository secret. Jobs now use their environment's secret first, so nothing should depend on it.
- **Planned (#61):** delete the repo secret after a production promote works with `ARK_CI_TOKEN`, then revoke the old token named `BWS_ACCESS_TOKEN` on `ark-ci`.
- **Locally:** never put `BWS_ACCESS_TOKEN` in `.env`. It overrides the vault token. Run scripts with `env -u BWS_ACCESS_TOKEN` if your shell has one.

### Overrides (rarely needed)

- `BWS_SERVER_URL`: Bitwarden server. Default `https://vault.bitwarden.eu`. Without it `bws` talks to the US server and every token looks invalid.
- `BWS_ARK_PROJECT_ID`, `BWS_OPS_PROJECT_ID`, `BWS_WEB_PROJECT_ID`: pin the production projects by id instead of finding them by name.

---

## Cloudflare

### `CLOUDFLARE_API_TOKEN`

- **SM:** `CLOUDFLARE_API_TOKEN`, shared, in `ark-dev`.
- **Used by:** every deploy: Pages (website, ops, brand), Workers, Wrangler, the Pages secrets syncs (`ops-secrets.yml`, `web-secrets.yml`), the rollback script (#18), and `ops:dev` locally (Workers AI).
- **Gets there by:** CI pulls it (`env:ark:pull -- --github-env`); your machine loads it from the cache.
- **Permissions:** Pages Edit, Workers Scripts Edit, Workers KV Storage Edit, Workers Routes Edit (zone), Account Settings Read, Workers AI Read ([env.md](env.md#cloudflare-tokens)).
- **Expires:** never (Cloudflare reports no expiry, checked 2026-10-02).
- **Changing it:** create the new token, `npm run secret:set`, run one deploy, delete the old token in Cloudflare.
- **Planned (#61):** split into `CLOUDFLARE_API_TOKEN__DEV`, scoped to `gwenda-web-dev`, `gwenda-ops-dev` and the brand previews, and `CLOUDFLARE_API_TOKEN__PRODUCTION`. Today a branch can deploy to production Pages projects with it.

### `CLOUDFLARE_ACCOUNT_ID`

- **SM:** `CLOUDFLARE_ACCOUNT_ID`, shared, in `ark-dev`. It is an id, not a secret; it is also in each Worker's `wrangler.toml`.
- **Used by:** the same jobs as the token.
- **Expires:** never.

---

## Baserow

### `BASEROW_OPS_API_KEY`

- **SM:** `BASEROW_OPS_API_KEY__DEV` (`ark/ops-dev`), `BASEROW_OPS_API_KEY__PRODUCTION` (`ark/ops`).
- **What:** a Baserow database token for the "Gwenda Ops" database (production) or its copy in "Gwenda Dev".
- **Runtime name:** `BASEROW_API_KEY` in ops. The website reads it as `BASEROW_OPS_API_KEY` (featured artist at build time).
- **Used by:** ops (events, menu, inventory, artists, users), the website build, the Baserow clone scripts. Production ops also reads `BASEROW_OPS_API_KEY__DEV` by name, to compare production with the dev copy (`db-diff.js`).
- **Gets there by:** ops: Pages secret, synced by the ops deploy (`setup-ops-secrets.mjs`). Website build: CI pull.
- **Expires:** never. Database tokens don't expire.
- **Changing it:** recover or create it in Baserow as automation@ (tokens are named after their SM keys), store it, then run the ops deploy and a website deploy.

### `BASEROW_WEBSITE_API_KEY`

- **SM:** `BASEROW_WEBSITE_API_KEY__DEV` (`ark/web-dev`), `BASEROW_WEBSITE_API_KEY__PRODUCTION` (`ark/web`).
- **What:** a database token for the "Website" database (forms, subscribers, RSVPs) or its dev copy.
- **Runtime name:** `BASEROW_API_KEY` on the website; `BASEROW_WEBSITE_API_KEY` in ops (form resends).
- **Used by:** website functions (forms, subscribe, RSVP, tickets), ops forms, `setup:subscribe-mailchimp-sync`, and the Mailchimp sync and Wi-Fi portal Workers (as their `BASEROW_API_KEY`).
- **Gets there by:** website: Pages secret (`web-secrets.yml`); ops: Pages secret; Workers: `wrangler secret put` by CI or the setup scripts.
- **Expires:** never.
- **Changing it:** as above, then `web-secrets.yml` for both profiles, a website deploy, and the Workers deploy.

### `BASEROW_CONFIG_API_KEY`

- **SM:** `BASEROW_CONFIG_API_KEY`, shared, in `ark-dev`.
- **What:** a database token for "Gwenda Config", the runtime settings both environments read. One table holds both environments' rows.
- **Used by:** ops and the website (`shared/config-db.js`), `setup:baserow-config`.
- **Gets there by:** Pages secrets on ops and the website; CI pull.
- **Expires:** never.
- **Planned (#120):** one config database per environment, each with its own token, so a dev credential can't change production settings.

### `BASEROW_JWT_EMAIL` and `BASEROW_JWT_PASSWORD`

- **SM:** both shared, in `ark/ops-dev`.
- **What:** the automation@gwenda.co.uk Baserow login. Database tokens can only touch rows; changing tables and fields needs a logged-in user.
- **Used by:** migrations in every ops and website deploy (`scripts/migrate.mjs`), the Baserow copy, the clone and setup scripts.
- **Gets there by:** CI exports them by name (`sm-export.mjs`); scripts log in and get a short-lived token per run.
- **Expires:** the password doesn't. Don't turn on two-factor sign-in: CI signs in with the password.
- **Changing it:** reset the password on Baserow (the reset email reaches the notifications@ inbox; automation@ is its alias), then `npm run secret:set` for `BASEROW_JWT_PASSWORD`.
- **Planned (#120):** a dev-only Baserow user, a member of "Gwenda Dev" only, for dev migrations. automation@ is a member of both workspaces, so today a dev credential can change production tables.

---

## Sanity

### `SANITY_API_TOKEN`

- **SM:** `SANITY_API_TOKEN__DEV` (`ark/web-dev`, project `gwscpagy`, Gwenda Dev), `SANITY_API_TOKEN__PRODUCTION` (`ark/web`, project `pn5yjro6`, Gwenda Web). Both Editor.
- **Used by:** the website build (reading content and drafts), ops (writing events and the menu, publishing), `site-build-snapshot.mjs`.
- **Gets there by:** website build: CI pull; ops: Pages secret.
- **Expires:** never. Sanity robot tokens don't expire.
- **Changing it:** `npm run setup:sanity-tokens` (after `npx sanity login`) creates and stores both, labelled with their SM key. Add `--revoke-old` once the deploys are green.

### `SANITY_DEPLOY_TOKEN`

- **SM:** `SANITY_DEPLOY_TOKEN`, shared, in `ark/web-dev`. Deploy Studio role on `pn5yjro6`.
- **Used by:** the hosted Studio deploy (`studio:deploy`) in web promote and `studio.yml`. `with-env` passes it to the Sanity CLI as `SANITY_AUTH_TOKEN`.
- **Expires:** never.
- **Planned (#119):** production-only, stored as `SANITY_DEPLOY_TOKEN__PRODUCTION`. Deploy Studio from your machine with `npx sanity login` instead.

---

## Google

### `GOOGLE_SERVICE_ACCOUNT_JSON`

- **SM:** `GOOGLE_SERVICE_ACCOUNT_JSON`, shared, in `ark/ops-dev`. The key of `gwenda-ops-drive@gwenda-ops.iam.gserviceaccount.com`, as one line of JSON.
- **What:** domain-wide delegation: it sends Gmail as notifications@ and edits Google Calendar and Drive.
- **Runtime names:** `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` (ops: Drive, calendar) and `GMAIL_SERVICE_ACCOUNT_JSON` (ops form resends, website form email, site-health alerts).
- **Used by:** ops, website functions, the site-health Worker (its own `GMAIL_SERVICE_ACCOUNT_JSON` secret, put there by `setup:site-health`).
- **Gets there by:** Pages secrets; Worker secret.
- **Expires:** service account keys don't expire unless an organisation policy says so. The current key was made on 2026-10-01.
- **Changing it:** add a key to the same service account in Google Cloud (delegation stays), store it, redeploy ops and the website, run `setup:site-health`, then delete the old key.
- **Outside production:** all mail is redirected to the safe inbox by `shared/gmail-send.js` (#107). That stops accidents, not someone holding the key.
- **Planned (#121, backlog):** a dev mailbox for Gmail and a dev calendar share, so dev never holds the delegated key.

### `GOOGLE_OAUTH_CLIENT_SECRET`

- **SM:** `GOOGLE_OAUTH_CLIENT_SECRET`, shared, in `ark/ops-dev`. Its client id is the plain setting `GOOGLE_OAUTH_CLIENT_ID`.
- **Used by:** ops sign-in with Google (`/api/auth`).
- **Gets there by:** Pages secret.
- **Expires:** never.
- **Changing it:** add a secret to the OAuth client in Google Cloud, store it, redeploy ops (dev and production), then delete the old secret.
- **Planned (#121, backlog):** a dev OAuth client.

---

## Ops

### `OPS_SESSION_SECRET`

- **SM:** `OPS_SESSION_SECRET__DEV` (`ark/ops-dev`), `OPS_SESSION_SECRET__PRODUCTION` (`ark/ops`). Random, 32 bytes.
- **What:** signs the ops sign-in cookie.
- **Used by:** ops.
- **Gets there by:** Pages secret, synced by the ops deploy.
- **Expires:** never.
- **Changing it:** logs everyone out of that ops once. Pick a quiet time, store the new value, then run the ops deploy (`ops-secrets.yml` for production).

### `OPS_LOCAL_ADMIN_PW`

- **SM:** `OPS_LOCAL_ADMIN_PW__DEV` (`ark/ops-dev`), `OPS_LOCAL_ADMIN_PW__PRODUCTION` (`ark/ops`).
- **What:** the password for the local admin sign-in at `/gate/` when ops runs on your machine (`npm run ops:dev`), where Google sign-in isn't set up.
- **Used by:** local ops only. It is never pushed to Cloudflare Pages (`pagesSkip`).
- **Expires:** never.

---

## Website

### `SUBSCRIBE_SECRET`

- **SM:** `SUBSCRIBE_SECRET__DEV` (`ark/web-dev`), `SUBSCRIBE_SECRET__PRODUCTION` (`ark/web`). Random.
- **What:** signs the website's own links and cookies: the subscribe form's CSRF cookie, RSVP ticket links (`/events/<slug>/ticket` and the Apple Wallet pass), and form email-verification and edit links.
- **Used by:** website functions.
- **Gets there by:** Pages secret (`web-secrets.yml`).
- **Expires:** never.
- **Changing it:** **every ticket link already sent stops working**, as do open verification and edit links. Avoid rotating it in production unless it has leaked.

### `FORMS_ADMIN_SECRET`

- **SM:** `FORMS_ADMIN_SECRET__DEV` (`ark/web-dev`), `FORMS_ADMIN_SECRET__PRODUCTION` (`ark/web`).
- **What:** protects the website's form admin endpoint (`/api/forms/admin/resend`).
- **Used by:** the website, and ops (which calls it).
- **Expires:** never.
- **Planned:** remove the endpoint and the secret once the new ops form resend is live; ops sends resends itself now.

### `SITE_PASSWORD`

- **SM:** `SITE_PASSWORD__DEV` (`ark/web-dev`), `SITE_PASSWORD__PRODUCTION` (`ark/web`).
- **What:** the password for the gate on the prod preview (preview.gwenda-blue) and the dev website. The live site is always public.
- **Used by:** the website middleware.
- **Gets there by:** Pages secret, on the preview environment only.
- **Expires:** never.
- **Changing it:** editors need the new password for the preview.

### `GATE_BYPASS_KEY`

- **SM:** `GATE_BYPASS_KEY__DEV` (`ark/web-dev`), `GATE_BYPASS_KEY__PRODUCTION` (`ark/web`).
- **What:** `?access=<key>` gets past the gate without the password. Used by the CI smoke tests on gated sites and by the preview share links.
- **Used by:** the website middleware and `preview-share.js`; `smoke-test.mjs` in CI.
- **Expires:** never.
- **Changing it:** preview links already shared stop working.

---

## Deploys and Workers

### `DEPLOY_WEBHOOK_SECRET`

- **SM:** `DEPLOY_WEBHOOK_SECRET`, shared, in `ark/web-dev`.
- **What:** one secret, three uses:
  - ops → the site deploy webhook Worker (rebuild, promote, status, compare, Baserow copy);
  - the webhook → ops (`/api/web/tick`, every few minutes, for scheduled website updates);
  - CI → the website's deep health check (`/api/health/deep`).
- **Used by:** ops (dev and production), the site deploy webhook Worker, the website, `smoke-test.mjs --deep`.
- **Gets there by:** Pages secrets on ops and the website; Worker secret put by `workers.yml`.
- **Expires:** never.
- **Changing it:** every holder must change together: the Worker (`workers.yml` on `release`), ops (ops deploys), and the website (`web-secrets.yml`).
- **Planned (#120):** `DEPLOY_WEBHOOK_SECRET__PRODUCTION` and `__DEV`. The Worker keeps the dev one as `DEPLOY_WEBHOOK_SECRET_DEV`, and a dev secret can only rebuild the dev website: no live promote, no prod preview, no database copy.

### `DISPATCH_TOKEN`

- **SM:** `DISPATCH_TOKEN`, shared, in `ark-dev`.
- **What:** a fine-grained GitHub token for `gwenda-hackney/ark` only (Actions read/write, Contents read). The webhook Worker starts the `web.yml`, `web-promote.yml` and `baserow-copy.yml` runs with it.
- **Runtime name:** `GITHUB_TOKEN` on the webhook Worker.
- **Gets there by:** `workers.yml` exports it (`sm-export.mjs`) and puts it on the Worker.
- **Expires:** GitHub reports no expiry date (checked 2026-10-02).
- **Changing it:** make a new fine-grained token, store it, rerun Workers on `release`, delete the old token.
- **Planned (#119):** production-only, as `DISPATCH_TOKEN__PRODUCTION`.

### `MAILCHIMP_API_KEY`

- **SM:** `MAILCHIMP_API_KEY`, shared, in `ark/web-dev`.
- **What:** the Mailchimp API key for the real audience.
- **Used by:** the Mailchimp sync Worker, `setup:subscribe-mailchimp-sync`, `upload-mailchimp-template.mjs`.
- **Gets there by:** `workers.yml` puts it on the Worker.
- **Expires:** **yes, after a year. The current key stops working around 2027-10-01** (#98).
- **Changing it:** create a key in Mailchimp, check it (`/3.0/ping`), store it, rerun Workers on `release` (or `setup:subscribe-mailchimp-sync`), then revoke the old key. Check you're revoking the right one.
- **Planned (#119):** production-only, as `MAILCHIMP_API_KEY__PRODUCTION`. #98: one command to rotate it, and a reminder before it expires.

### `SUBSCRIBE_MAILCHIMP_SYNC_SECRET`

- **SM:** `SUBSCRIBE_MAILCHIMP_SYNC_SECRET`, shared, in `ark/web-dev`. Random; made by `setup:subscribe-mailchimp-sync` if missing.
- **What:** protects the Mailchimp sync Worker's manual run (`POST /` with `Authorization: Bearer …`).
- **Runtime name:** `SYNC_SECRET` on the Worker.
- **Expires:** never.
- **Planned (#119):** production-only, as `SUBSCRIBE_MAILCHIMP_SYNC_SECRET__PRODUCTION`.

### `UNIFI_SITE_MANAGER_API_KEY`

- **SM:** `UNIFI_SITE_MANAGER_API_KEY`, shared, in `ark/web-dev`. It stays shared: there is one Wi-Fi controller, the venue's, and the local portal dev server needs it.
- **What:** the UniFi Site Manager API key; the captive portal Worker lets guests onto the Wi-Fi with it.
- **Used by:** the Wi-Fi captive portal Worker, `setup:wifi-portal`, `wifi-portal-dev.mjs`.
- **Gets there by:** `setup:wifi-portal` puts it on the Worker.
- **Expires:** check at [unifi.ui.com/api](https://unifi.ui.com/api); set when the key was made.

### `UPTIME_ROBOT_API_KEY`

- **SM:** `UPTIME_ROBOT_API_KEY`, shared, in `ark-dev`. The main API key of the UptimeRobot account (login alerts@gwenda.co.uk).
- **Used by:** `npm run setup:uptime`, on your machine only.
- **Expires:** never.
- **Planned (#119):** production-only, as `UPTIME_ROBOT_API_KEY__PRODUCTION`.

---

## Plain settings

Not secret: committed in `wrangler*.toml`, the deploy workflows or the local defaults. Each app's dev config (`wrangler.dev.toml`) sets the dev value.

### Environment

- `SITE_ENV`: `production`, `dev` or `local`. Required: `environmentOf` in `shared/config-db.js` throws if it is missing, so dev data can't reach production by accident. Set in every `wrangler*.toml`, and `production` on the site-health Worker.
- `SITE_PREVIEW`: `true` on a website preview (drafts shown, password gate). Set in `[env.preview.vars]`.

### Sanity

- `SANITY_PROJECT_ID`: `pn5yjro6` (Gwenda Web, production) or `gwscpagy` (Gwenda Dev). Your machine defaults to `gwscpagy`.
- `SANITY_DATASET`: `production` in both projects (each has one dataset).
- `SANITY_PERSPECTIVE`: `published` for a live site, `previewDrafts` for a preview.

### Addresses

- `ALERT_EMAIL`: `alerts@gwenda.co.uk`, where ops, the website and site health send alerts.
- `INVITE_BASE_URL`, `INVITE_IMAGE_URL`: links and the image in event invite emails. Your machine defaults `INVITE_BASE_URL` to `http://localhost:4321`.
- `SITE_DEPLOY_WEBHOOK_URL`: where ops finds the site deploy webhook Worker. `SANITY_STUDIO_SITE_DEPLOY_URL` is its older name, still read as a fallback.
- `SITE_HEALTH_URL`: `https://health.gwenda.co.uk`, linked from ops.
- `OPS_URL`, `OPS_DEV_URL`: the ops sites the webhook ticks (`gwenda-ops.pages.dev`, `gwenda-ops-dev.pages.dev`).
- `SITE_URL`, `PREVIEW_SITE_URL`: what the site-health Worker checks.
- `GITHUB_REPOSITORY`: `gwenda-hackney/ark`, for the webhook Worker's GitHub calls.

### Google

- `GOOGLE_OAUTH_CLIENT_ID`: the ops sign-in client (its secret is above).
- `GOOGLE_CALENDAR_ID`: the production events calendar, in production ops' `wrangler.toml`.

### Mailchimp sync Worker

- `MAILCHIMP_AUDIENCE_ID`: the audience it syncs into.
- `BASEROW_API_URL`: `https://api.baserow.io` (also on the Wi-Fi portal).
- `BASEROW_SYNC_LOG_TABLE_ID`: the Baserow table it logs runs to. (#39 plans to find it by name instead.)

### Wi-Fi captive portal Worker

- `UNIFI_CONSOLE_ID`, `UNIFI_SITE_IDENTIFIER`: which UniFi console and site.
- `UNIFI_GUEST_MINUTES`: `1440`, how long a guest stays connected.
- `WIFI_SUBSCRIBE_TAG`: `wifi`, the tag on subscribers who signed up through the portal.
- `REDIRECT_URL`: `https://gwenda.co.uk`, where guests land afterwards.

### Website build (set by CI in `.github/actions/deploy-pages`)

- `PUBLIC_BUILD_VERSION`, `PUBLIC_BUILD_SHA`, `PUBLIC_BUILD_REF`, `PUBLIC_BUILD_TIME`: the build stamp. The site reports the version as `X-Gwenda-Version`.
- `PUBLIC_IS_PREVIEW`: `true` for a preview or the dev website.
- `PUBLIC_ENV_LABEL`: the ribbon text on a non-live build.
- `PUBLIC_SITE_ORIGIN`: the public address of a non-live build.
- `PUBLIC_OPENING_DATE`: the opening date; GitHub variable `PUBLIC_OPENING_DATE`, default `2026-08-01`.

### Your machine only

- `FORMS_NOTIFY_EMAIL`: the safe inbox outside production. Defaults to your git email; override it in `.env`.
- `.env` is optional and holds personal overrides only. Never secrets, never `ARK_LOCAL_BW_TOKEN` or `BWS_ACCESS_TOKEN`.

---

## Overview

| Name | Dev / production | SM project (production / dev) | Expires | Planned |
|---|---|---|---|---|
| `ARK_LOCAL_BW_TOKEN` | — | vault note | never | |
| `ARK_CI_TOKEN` | production | GitHub env `production` | as set | |
| `ARK_CI_DEV_TOKEN` | dev | GitHub envs `dev`, `preview` | as set | |
| `CLOUDFLARE_API_TOKEN` | shared | — / `ark-dev` | never | split (#61) |
| `CLOUDFLARE_ACCOUNT_ID` | shared | — / `ark-dev` | never | |
| `BASEROW_OPS_API_KEY` | own values | `ark/ops` / `ark/ops-dev` | never | |
| `BASEROW_WEBSITE_API_KEY` | own values | `ark/web` / `ark/web-dev` | never | |
| `BASEROW_CONFIG_API_KEY` | shared | — / `ark-dev` | never | split (#120) |
| `BASEROW_JWT_EMAIL` / `_PASSWORD` | shared | — / `ark/ops-dev` | never | split (#120) |
| `SANITY_API_TOKEN` | own values | `ark/web` / `ark/web-dev` | never | |
| `SANITY_DEPLOY_TOKEN` | shared | — / `ark/web-dev` | never | production-only (#119) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | shared | — / `ark/ops-dev` | never | backlog (#121) |
| `GOOGLE_OAUTH_CLIENT_SECRET` | shared | — / `ark/ops-dev` | never | backlog (#121) |
| `OPS_SESSION_SECRET` | own values | `ark/ops` / `ark/ops-dev` | never | |
| `OPS_LOCAL_ADMIN_PW` | own values | `ark/ops` / `ark/ops-dev` | never | |
| `SUBSCRIBE_SECRET` | own values | `ark/web` / `ark/web-dev` | never | |
| `FORMS_ADMIN_SECRET` | own values | `ark/web` / `ark/web-dev` | never | remove |
| `SITE_PASSWORD` | own values | `ark/web` / `ark/web-dev` | never | |
| `GATE_BYPASS_KEY` | own values | `ark/web` / `ark/web-dev` | never | |
| `DEPLOY_WEBHOOK_SECRET` | shared | — / `ark/web-dev` | never | split (#120) |
| `DISPATCH_TOKEN` | shared | — / `ark-dev` | none reported | production-only (#119) |
| `MAILCHIMP_API_KEY` | shared | — / `ark/web-dev` | **~2027-10-01** | production-only (#119), rotation (#98) |
| `SUBSCRIBE_MAILCHIMP_SYNC_SECRET` | shared | — / `ark/web-dev` | never | production-only (#119) |
| `UNIFI_SITE_MANAGER_API_KEY` | shared, on purpose | — / `ark/web-dev` | check UniFi | |
| `UPTIME_ROBOT_API_KEY` | shared | — / `ark-dev` | never | production-only (#119) |
