# Environment variables: reference

Every secret and setting the apps, Workers, scripts and CI read: what it is for, where it lives, its dev and production names, whether it expires, and what changing it breaks. Checked against Secrets Manager and the providers on 2026-10-02.

- How the secret store works (naming rule, projects, who reads what): [config.md](config.md#secrets-one-naming-rule)
- Loading secrets on your machine and in CI: [env.md](env.md)
- Rebuilding everything from scratch: [secrets-rebuild.md](secrets-rebuild.md)

## How to read an entry

Each entry opens with **why** it exists: what would stop working without it. Then:

- **Owner:** the account or project it was issued under, which is where you revoke or replace it. "Gwenda" means a value we generate ourselves.
- **SM:** the name in Secrets Manager and its project. Production values (`NAME__PRODUCTION`) sit in [`ark`](#ark), [`ark/ops`](#arkops) or [`ark/web`](#arkweb); dev values (`NAME__DEV`) and shared values (plain `NAME`, one value for both) sit in [`ark-dev`](#ark-dev), [`ark/ops-dev`](#arkops-dev) or [`ark/web-dev`](#arkweb-dev).
- **Runtime name:** what the code reads, when it differs.
- **Used by:** who reads it.
- **Gets there by:** how the value reaches them: a CI pull, a Cloudflare Pages secret, a Worker secret, or your machine's in-memory cache.
- **Expires:** whether it stops working on its own.
- **Changing it:** what to run, and what breaks until everything has the new value.

## Contents

- [Secrets Manager projects](#secrets-manager-projects): the six projects, and who reads each
- [Secrets Manager access](#secrets-manager-access): the tokens that unlock everything else
- [Cloudflare](#cloudflare)
- [Baserow](#baserow)
- [Sanity](#sanity)
- [Google](#google)
- [Ops](#ops)
- [Website](#website)
- [Deploys and Workers](#deploys-and-workers)
- [Plain settings](#plain-settings): not secret
- [Overview](#overview): everything in one table

## Secrets Manager projects

Six projects in the Bitwarden organisation, in pairs. The plain name is production; `-dev` is dev. Each pair splits by area: shared infrastructure, ops, website. The scripts find projects by name, ignoring case, and a secret's area decides its pair (`SECRET_OWNERS` in `scripts/lib/bitwarden-sm.mjs`).

Production values never sit in a `-dev` project, so the dev CI token, which reads only the `-dev` projects, never sees one.

### `ark`

Production values (`NAME__PRODUCTION`) for shared infrastructure: the config database token, the GitHub dispatch token, the UptimeRobot key.

- **Read by:** [`ark-local`](#ark_local_bw_token) (read/write), [`ark-ci`](#ark_ci_token).
- **Open:** [ark in Bitwarden](https://vault.bitwarden.eu/#/sm/39757de9-63b3-4844-8aa1-b4d501372b56/projects/4752cab2-4d4d-441d-be41-b4d600c97608/secrets)

### `ark/ops`

Production values for ops: its Baserow token, session secret and local admin password.

- **Read by:** [`ark-local`](#ark_local_bw_token) (read/write), [`ark-ci`](#ark_ci_token).
- **Open:** [ark/ops in Bitwarden](https://vault.bitwarden.eu/#/sm/39757de9-63b3-4844-8aa1-b4d501372b56/projects/4d70b6fc-00e8-407a-ab30-b4d600c9879b/secrets)

### `ark/web`

Production values for the website: its Baserow and Sanity tokens, the signing secret, the preview password and gate key, the form admin secret, the deploy webhook secret, the Studio deploy token, the Mailchimp key and sync secret.

- **Read by:** [`ark-local`](#ark_local_bw_token) (read/write), [`ark-ci`](#ark_ci_token).
- **Open:** [ark/web in Bitwarden](https://vault.bitwarden.eu/#/sm/39757de9-63b3-4844-8aa1-b4d501372b56/projects/7b53d05f-9f8a-49b7-abcf-b4d600c980ac/secrets)

### `ark-dev`

Dev values (`NAME__DEV`) and shared values (plain `NAME`, one value for both environments) for shared infrastructure: the Cloudflare token and account id, the config database token.

- **Read by:** [`ark-local`](#ark_local_bw_token) (read/write), [`ark-ci`](#ark_ci_token), [`ark-ci-dev`](#ark_ci_dev_token).
- **Open:** [ark-dev in Bitwarden](https://vault.bitwarden.eu/#/sm/39757de9-63b3-4844-8aa1-b4d501372b56/projects/502b2a1d-332e-46d0-948f-b4d70079cf1e/secrets)

### `ark/ops-dev`

Dev and shared values for ops: its dev Baserow token, session secret and local admin password, the Baserow login, the Google service account and OAuth secret.

- **Read by:** [`ark-local`](#ark_local_bw_token) (read/write), [`ark-ci`](#ark_ci_token), [`ark-ci-dev`](#ark_ci_dev_token).
- **Open:** [ark/ops-dev in Bitwarden](https://vault.bitwarden.eu/#/sm/39757de9-63b3-4844-8aa1-b4d501372b56/projects/c0696997-f778-4d42-8948-b4d7007a068c/secrets)

### `ark/web-dev`

Dev and shared values for the website: its dev Baserow and Sanity tokens, signing secret, preview password and gate key, form admin secret, deploy webhook secret; and the shared UniFi key.

- **Read by:** [`ark-local`](#ark_local_bw_token) (read/write), [`ark-ci`](#ark_ci_token), [`ark-ci-dev`](#ark_ci_dev_token).
- **Open:** [ark/web-dev in Bitwarden](https://vault.bitwarden.eu/#/sm/39757de9-63b3-4844-8aa1-b4d501372b56/projects/ebcf1b4b-8711-4863-a539-b4d70079fe89/secrets)

---

## Secrets Manager access

Bitwarden is two products. Your **vault** (Password Manager, `bw`) holds personal items and is opened with your master password. **Secrets Manager** (`bws`) holds the app secrets below, and it only accepts **machine-account access tokens**: no password, no session. These tokens are those keys: one for your machine, one each for production and dev CI. Each machine account sees only the projects it needs.

### `ARK_LOCAL_BW_TOKEN`

Lets your machine read the app secrets. It is your machine's key to Secrets Manager. It sits in your vault, so `bw-unlock` (your master password) is all you do; the scripts fetch it from there.

- **Owner:** Bitwarden organisation: an access token of the machine account `ark-local`.
- **Machine account:** `ark-local`, read/write on all six projects.
- **Stored in:** the Password Manager vault note `ark/.env.local`. Never in `.env`; the loader warns if it finds it there.
- **Used by:** every script on a developer's machine (`with-env`, `with-ops-env`, `ops:dev`, `setup:*`, `secret:set`, `secrets:move-dev`, `secrets:rename`).
- **Gets there by:** `bw-unlock` opens the vault; the scripts read the token from the session in RAM (`/dev/shm/ark-secrets-<uid>/`).
- **Expires:** never (created without an expiry).
- **Changing it:** make a new access token on `ark-local`, put it in the vault note, run `npm run env:secrets:refresh`, then revoke the old one.

### `ARK_CI_TOKEN`

Lets production deploys read production secrets, and nothing else can. Only jobs on `release`, in the `production` GitHub environment, get this token.

- **Owner:** Bitwarden organisation: an access token of the machine account `ark-ci`.
- **Machine account:** `ark-ci`, read on all six projects.
- **Stored in:** GitHub, as the `production` environment's secret `BWS_ACCESS_TOKEN`.
- **Used by:** every job in the `production` environment, which only accepts the `release` branch: web promote, the prod preview, ops production, brand production, Studio, Workers, Baserow copy, ops and web secrets syncs.
- **Expires:** as set when it was created on 2026-10-02. Check the token list on `ark-ci` in Bitwarden.
- **Changing it:** make a new token on `ark-ci`, set it with `gh secret set BWS_ACCESS_TOKEN --env production`, check one production job, revoke the old token.

### `ARK_CI_DEV_TOKEN`

Lets branches and `main` build and test without ever seeing a production secret. Anyone who can push a branch can make a workflow print its token's secrets; this one has none worth stealing.

- **Owner:** Bitwarden organisation: an access token of the machine account `ark-ci-dev`.
- **Machine account:** `ark-ci-dev`, read on the three `-dev` projects only. It can't see any `__PRODUCTION` value; a production pull with it stops with "This token can't read production secrets".
- **Stored in:** GitHub, as the `dev` and `preview` environments' secret `BWS_ACCESS_TOKEN`.
- **Used by:** jobs on `main` (dev website, dev ops) and on feature branches (branch previews).
- **Expires:** as set when it was created on 2026-10-02. Check the token list on `ark-ci-dev`.
- **Changing it:** as above, for both `--env dev` and `--env preview`.

---

## Cloudflare

### `CLOUDFLARE_API_TOKEN`

Everything we run is on Cloudflare (Pages sites, Workers), and deploying or changing any of it needs an API token.

- **Owner:** the Cloudflare account ("Dscalamogna@gwenda.co.uk's Account"). It is an account token (`cfat_`), not tied to a person.
- **SM:** `CLOUDFLARE_API_TOKEN`, shared, in [`ark-dev`](#ark-dev).
- **Used by:** every deploy: Pages (website, ops, brand), Workers, Wrangler, the Pages secrets syncs (`ops-secrets.yml`, `web-secrets.yml`), the rollback script (#18), and `ops:dev` locally (Workers AI).
- **Gets there by:** CI pulls it (`env:ark:pull -- --github-env`); your machine loads it from the cache.
- **Permissions:** Pages Edit, Workers Scripts Edit, Workers KV Storage Edit, Workers Routes Edit (zone), Account Settings Read, Workers AI Read ([env.md](env.md#cloudflare-tokens)).
- **Expires:** never (Cloudflare reports no expiry, checked 2026-10-02).
- **Changing it:** create the new token, `npm run secret:set`, run one deploy, delete the old token in Cloudflare.

### `CLOUDFLARE_ACCOUNT_ID`

Cloudflare's API addresses everything by account, so every call needs it next to the token.

- **Owner:** the Cloudflare account; an id, not issued to anyone.
- **SM:** `CLOUDFLARE_ACCOUNT_ID`, shared, in [`ark-dev`](#ark-dev). It is an id, not a secret; it is also in each Worker's `wrangler.toml`.
- **Used by:** the same jobs as the token.
- **Expires:** never.

---

## Baserow

### `BASEROW_OPS_API_KEY`

Ops keeps its data (events, menu, inventory, artists, users) in Baserow, and a database token is how code reads and writes those rows. Each environment has its own database, so its own token.

- **Owner:** Baserow user automation@gwenda.co.uk (database tokens belong to the user who made them).
- **SM:** `BASEROW_OPS_API_KEY__DEV` ([`ark/ops-dev`](#arkops-dev)), `BASEROW_OPS_API_KEY__PRODUCTION` ([`ark/ops`](#arkops)).
- **What:** a Baserow database token for the "Gwenda Ops" database (production) or its copy in "Gwenda Dev".
- **Runtime name:** `BASEROW_API_KEY` in ops. The website reads it as `BASEROW_OPS_API_KEY` (featured artist at build time).
- **Used by:** ops (events, menu, inventory, artists, users), the website build, the Baserow clone scripts. Production ops also reads `BASEROW_OPS_API_KEY__DEV` by name, to compare production with the dev copy (`db-diff.js`).
- **Gets there by:** ops: Pages secret, synced by the ops deploy (`setup-ops-secrets.mjs`). Website build: CI pull.
- **Expires:** never. Database tokens don't expire.
- **Changing it:** recover or create it in Baserow as automation@ (tokens are named after their SM keys), store it, then run the ops deploy and a website deploy.

### `BASEROW_WEBSITE_API_KEY`

Guest data from the website (form entries, subscribers, RSVPs) lives in Baserow's Website database; this token is how the site and its Workers write it.

- **Owner:** Baserow user automation@gwenda.co.uk.
- **SM:** `BASEROW_WEBSITE_API_KEY__DEV` ([`ark/web-dev`](#arkweb-dev)), `BASEROW_WEBSITE_API_KEY__PRODUCTION` ([`ark/web`](#arkweb)).
- **What:** a database token for the "Website" database (forms, subscribers, RSVPs) or its dev copy.
- **Runtime name:** `BASEROW_API_KEY` on the website; `BASEROW_WEBSITE_API_KEY` in ops (form resends).
- **Used by:** website functions (forms, subscribe, RSVP, tickets), ops forms, `setup:subscribe-mailchimp-sync`, and the Mailchimp sync and Wi-Fi portal Workers (as their `BASEROW_API_KEY`).
- **Gets there by:** website: Pages secret (`web-secrets.yml`); ops: Pages secret; Workers: `wrangler secret put` by CI or the setup scripts.
- **Expires:** never.
- **Changing it:** as above, then `web-secrets.yml` for both profiles, a website deploy, and the Workers deploy.

### `BASEROW_CONFIG_API_KEY`

Non-secret settings (for example `forms.notify_email`, who gets form emails) and machine state live in a Baserow config database rather than in code, so they change without a deploy. This token reads and writes it.

- **Owner:** Baserow user automation@gwenda.co.uk.
- **SM:** `BASEROW_CONFIG_API_KEY__PRODUCTION` in [`ark`](#ark); `BASEROW_CONFIG_API_KEY__DEV` in [`ark-dev`](#ark-dev).
- **What:** a database token for the environment's own "Gwenda Config" database (Gwenda for production, Gwenda Dev for dev). Each token sees only its own, so dev can't change production's settings.
- **Used by:** ops and the website (`shared/config-db.js`), `setup:baserow-config`.
- **Gets there by:** Pages secrets on ops and the website; CI pull.
- **Expires:** never.

### `BASEROW_JWT_EMAIL` and `BASEROW_JWT_PASSWORD`

Database tokens can only change rows. Adding a table or field during a deploy (a migration) or copying a database needs a real Baserow login, so CI signs in as automation@.

- **Owner:** Baserow user automation@gwenda.co.uk; it is that user's login. automation@ is an alias of notifications@.
- **SM:** both shared, in [`ark/ops-dev`](#arkops-dev).
- **What:** the automation@gwenda.co.uk Baserow login. Database tokens can only touch rows; changing tables and fields needs a logged-in user.
- **Used by:** migrations in every ops and website deploy (`scripts/migrate.mjs`), the Baserow copy, the clone and setup scripts.
- **Gets there by:** CI exports them by name (`sm-export.mjs`); scripts log in and get a short-lived token per run.
- **Expires:** the password doesn't. Don't turn on two-factor sign-in: CI signs in with the password.
- **Changing it:** reset the password on Baserow (the reset email reaches the notifications@ inbox; automation@ is its alias), then `npm run secret:set` for `BASEROW_JWT_PASSWORD`.

---

## Sanity

### `SANITY_API_TOKEN`

Website content (events, menu, pages) lives in Sanity. Ops writes it and the website build reads it, including unpublished drafts for the preview, which needs a token.

- **Owner:** the Sanity project itself: robot tokens on Gwenda Web (`pn5yjro6`) and Gwenda Dev (`gwscpagy`), labelled with their SM key. Not tied to a person.
- **SM:** `SANITY_API_TOKEN__DEV` ([`ark/web-dev`](#arkweb-dev), project `gwscpagy`, Gwenda Dev), `SANITY_API_TOKEN__PRODUCTION` ([`ark/web`](#arkweb), project `pn5yjro6`, Gwenda Web). Both Editor.
- **Used by:** the website build (reading content and drafts), ops (writing events and the menu, publishing), `site-build-snapshot.mjs`.
- **Gets there by:** website build: CI pull; ops: Pages secret.
- **Expires:** never. Sanity robot tokens don't expire.
- **Changing it:** `npm run setup:sanity-tokens` (after `npx sanity login`) creates and stores both, labelled with their SM key. Add `--revoke-old` once the deploys are green.

### `SANITY_DEPLOY_TOKEN`

The hosted Studio at gwenda.sanity.studio is redeployed with each release when its code changed; Sanity only lets a token with the Deploy Studio role do that.

- **Owner:** the Sanity project Gwenda Web (`pn5yjro6`): a robot token labelled with its SM key.
- **SM:** `SANITY_DEPLOY_TOKEN`, shared, in [`ark/web-dev`](#arkweb-dev). Deploy Studio role on `pn5yjro6`.
- **Used by:** the hosted Studio deploy (`studio:deploy`) in web promote and `studio.yml`. `with-env` passes it to the Sanity CLI as `SANITY_AUTH_TOKEN`.
- **Expires:** never.

---

## Google

### `GOOGLE_SERVICE_ACCOUNT_JSON`

Ops and the website send email (form confirmations, alerts) from notifications@ and keep the events calendar in sync. A service account with domain-wide delegation can do that as notifications@ without a person signing in.

- **Owner:** Google Cloud project `gwenda-ops`: a key of the service account `gwenda-ops-drive`, with domain-wide delegation in the gwenda.co.uk Workspace.
- **SM:** `GOOGLE_SERVICE_ACCOUNT_JSON`, shared, in [`ark/ops-dev`](#arkops-dev). The key of `gwenda-ops-drive@gwenda-ops.iam.gserviceaccount.com`, as one line of JSON.
- **What:** domain-wide delegation: it sends Gmail as notifications@ and edits Google Calendar and Drive.
- **Runtime names:** `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` (ops: Drive, calendar) and `GMAIL_SERVICE_ACCOUNT_JSON` (ops form resends, website form email, site-health alerts).
- **Used by:** ops, website functions, the site-health Worker (its own `GMAIL_SERVICE_ACCOUNT_JSON` secret, put there by `setup:site-health`).
- **Gets there by:** Pages secrets; Worker secret.
- **Expires:** service account keys don't expire unless an organisation policy says so. The current key was made on 2026-10-01.
- **Changing it:** add a key to the same service account in Google Cloud (delegation stays), store it, redeploy ops and the website, run `setup:site-health`, then delete the old key.
- **Outside production:** all mail is redirected to the safe inbox by `shared/gmail-send.js` (#107). That stops accidents, not someone holding the key.

### `GOOGLE_OAUTH_CLIENT_SECRET`

Staff sign in to ops with their Google account. Google only completes that sign-in for an app that proves who it is with its client secret.

- **Owner:** Google Cloud project `682046070260`: a secret of the ops OAuth client.
- **SM:** `GOOGLE_OAUTH_CLIENT_SECRET`, shared, in [`ark/ops-dev`](#arkops-dev). Its client id is the plain setting `GOOGLE_OAUTH_CLIENT_ID`.
- **Used by:** ops sign-in with Google (`/api/auth`).
- **Gets there by:** Pages secret.
- **Expires:** never.
- **Changing it:** add a secret to the OAuth client in Google Cloud, store it, redeploy ops (dev and production), then delete the old secret.

---

## Ops

### `OPS_SESSION_SECRET`

After sign-in, ops keeps you signed in with a cookie. Signing that cookie means nobody can forge one to get in.

- **Owner:** Gwenda: a random value we generate. No outside account.
- **SM:** `OPS_SESSION_SECRET__DEV` ([`ark/ops-dev`](#arkops-dev)), `OPS_SESSION_SECRET__PRODUCTION` ([`ark/ops`](#arkops)). Random, 32 bytes.
- **What:** signs the ops sign-in cookie.
- **Used by:** ops.
- **Gets there by:** Pages secret, synced by the ops deploy.
- **Expires:** never.
- **Changing it:** logs everyone out of that ops once. Pick a quiet time, store the new value, then run the ops deploy (`ops-secrets.yml` for production).

### `OPS_LOCAL_ADMIN_PW`

Google sign-in only works on the registered ops addresses, not on localhost. This password lets a developer sign in to ops running on their own machine.

- **Owner:** Gwenda: a random value we generate.
- **SM:** `OPS_LOCAL_ADMIN_PW__DEV` ([`ark/ops-dev`](#arkops-dev)), `OPS_LOCAL_ADMIN_PW__PRODUCTION` ([`ark/ops`](#arkops)).
- **What:** the password for the local admin sign-in at `/gate/` when ops runs on your machine (`npm run ops:dev`), where Google sign-in isn't set up.
- **Used by:** local ops only. It is never pushed to Cloudflare Pages (`pagesSkip`).
- **Expires:** never.

---

## Website

### `SUBSCRIBE_SECRET`

The website sends guests links that must not be guessable or editable: RSVP tickets, email-verification and edit links. Signing them with this secret is how the site knows a link is one it made.

- **Owner:** Gwenda: a random value we generate.
- **SM:** `SUBSCRIBE_SECRET__DEV` ([`ark/web-dev`](#arkweb-dev)), `SUBSCRIBE_SECRET__PRODUCTION` ([`ark/web`](#arkweb)). Random.
- **What:** signs the website's own links and cookies: the subscribe form's CSRF cookie, RSVP ticket links (`/events/<slug>/ticket` and the Apple Wallet pass), and form email-verification and edit links.
- **Used by:** website functions.
- **Gets there by:** Pages secret (`web-secrets.yml`).
- **Expires:** never.
- **Changing it:** **every ticket link already sent stops working**, as do open verification and edit links. Avoid rotating it in production unless it has leaked.

### `FORMS_ADMIN_SECRET`

Only ops may ask the website to resend a form email; this secret proves the request is from ops.

- **Owner:** Gwenda: a random value we generate.
- **SM:** `FORMS_ADMIN_SECRET__DEV` ([`ark/web-dev`](#arkweb-dev)), `FORMS_ADMIN_SECRET__PRODUCTION` ([`ark/web`](#arkweb)).
- **What:** protects the website's form admin endpoint (`/api/forms/admin/resend`).
- **Used by:** the website, and ops (which calls it).
- **Expires:** never.

### `SITE_PASSWORD`

The preview shows unpublished drafts and the dev website shows test data. A password keeps both away from guests and search engines.

- **Owner:** Gwenda: a value we choose.
- **SM:** `SITE_PASSWORD__DEV` ([`ark/web-dev`](#arkweb-dev)), `SITE_PASSWORD__PRODUCTION` ([`ark/web`](#arkweb)).
- **What:** the password for the gate on the prod preview (preview.gwenda-blue) and the dev website. The live site is always public.
- **Used by:** the website middleware.
- **Gets there by:** Pages secret, on the preview environment only.
- **Expires:** never.
- **Changing it:** editors need the new password for the preview.

### `GATE_BYPASS_KEY`

CI smoke tests and preview share links need to see a gated site without typing the password.

- **Owner:** Gwenda: a random value we generate.
- **SM:** `GATE_BYPASS_KEY__DEV` ([`ark/web-dev`](#arkweb-dev)), `GATE_BYPASS_KEY__PRODUCTION` ([`ark/web`](#arkweb)).
- **What:** `?access=<key>` gets past the gate without the password. Used by the CI smoke tests on gated sites and by the preview share links.
- **Used by:** the website middleware and `preview-share.js`; `smoke-test.mjs` in CI.
- **Expires:** never.
- **Changing it:** preview links already shared stop working.

---

## Deploys and Workers

### `DEPLOY_WEBHOOK_SECRET`

Ops starts website rebuilds and releases, but only GitHub can run them. The webhook Worker holds the GitHub token and does it for ops; this secret is how each side knows the other is genuine. Production and dev ops each have their own, so dev's can't reach production.

- **Owner:** Gwenda: a random value we generate (`setup:site-deploy` makes one if missing).
- **SM:** `DEPLOY_WEBHOOK_SECRET__PRODUCTION` ([`ark/web`](#arkweb)), `DEPLOY_WEBHOOK_SECRET__DEV` ([`ark/web-dev`](#arkweb-dev)).
- **What:** each environment's value has three uses:
  - ops → the site deploy webhook Worker. Production's secret can do everything: rebuild, promote, status, compare, Baserow copy. Dev's can only rebuild the dev website, read status and compare. It can't start a live promote, rebuild the prod preview or copy the databases, whatever it asks for.
  - the webhook → that environment's ops (`/api/web/tick`, every few minutes, for scheduled website updates);
  - CI → that environment's website deep health check (`/api/health/deep`).
- **Runtime name:** `DEPLOY_WEBHOOK_SECRET` in ops and on the website. The webhook Worker holds both, as `DEPLOY_WEBHOOK_SECRET` (production) and `DEPLOY_WEBHOOK_SECRET_DEV`.
- **Used by:** ops (dev and production), the site deploy webhook Worker, the website, `smoke-test.mjs --deep`.
- **Gets there by:** Pages secrets on ops and the website; Worker secrets put by `workers.yml` (or `setup:site-deploy`).
- **Expires:** never.
- **Changing it:** one environment at a time; its holders change together: the Worker (`workers.yml` on `release`), that ops (its deploy) and that website (`web-secrets.yml` for its profile).

### `DISPATCH_TOKEN`

Starting a GitHub workflow needs a GitHub token. The webhook Worker holds this one so ops never needs GitHub access itself.

- **Owner:** GitHub user **das974** (a personal account): a fine-grained token limited to `gwenda-hackney/ark`. It stops working if that account loses access to the repo.
- **SM:** `DISPATCH_TOKEN`, shared, in [`ark-dev`](#ark-dev).
- **What:** a fine-grained GitHub token for `gwenda-hackney/ark` only (Actions read/write, Contents read). The webhook Worker starts the `web.yml`, `web-promote.yml` and `baserow-copy.yml` runs with it.
- **Runtime name:** `GITHUB_TOKEN` on the webhook Worker.
- **Gets there by:** `workers.yml` exports it (`sm-export.mjs`) and puts it on the Worker.
- **Expires:** GitHub reports no expiry date (checked 2026-10-02).
- **Changing it:** make a new fine-grained token, store it, rerun Workers on `release`, delete the old token.

### `MAILCHIMP_API_KEY`

Subscribers sign up on the website (stored in Baserow); the sync Worker copies them into the Mailchimp audience that newsletters go to.

- **Owner:** Mailchimp user **dscalamogna@gwenda.co.uk**, in the Gwenda account. It stops working if that user is removed.
- **SM:** `MAILCHIMP_API_KEY`, shared, in [`ark/web-dev`](#arkweb-dev).
- **What:** the Mailchimp API key for the real audience.
- **Used by:** the Mailchimp sync Worker, `setup:subscribe-mailchimp-sync`, `upload-mailchimp-template.mjs`.
- **Gets there by:** `workers.yml` puts it on the Worker.
- **Expires:** **yes, after a year. The current key stops working around 2027-10-01.**
- **Changing it:** create a key in Mailchimp, check it (`/3.0/ping`), store it, rerun Workers on `release` (or `setup:subscribe-mailchimp-sync`), then revoke the old key. Check you're revoking the right one.

### `SUBSCRIBE_MAILCHIMP_SYNC_SECRET`

The sync Worker runs on a schedule but can also be run by hand; this secret stops anyone else from triggering it.

- **Owner:** Gwenda: a random value `setup:subscribe-mailchimp-sync` generates.
- **SM:** `SUBSCRIBE_MAILCHIMP_SYNC_SECRET`, shared, in [`ark/web-dev`](#arkweb-dev). Random; made by `setup:subscribe-mailchimp-sync` if missing.
- **What:** protects the Mailchimp sync Worker's manual run (`POST /` with `Authorization: Bearer …`).
- **Runtime name:** `SYNC_SECRET` on the Worker.
- **Expires:** never.

### `UNIFI_SITE_MANAGER_API_KEY`

The venue Wi-Fi asks guests to sign up before going online; the portal Worker then tells the UniFi controller to let that device on.

- **Owner:** the UniFi account that owns the venue console, at unifi.ui.com.
- **SM:** `UNIFI_SITE_MANAGER_API_KEY`, shared, in [`ark/web-dev`](#arkweb-dev). Shared because there is one Wi-Fi controller, the venue's, and the local portal dev server uses it too.
- **What:** the UniFi Site Manager API key; the captive portal Worker lets guests onto the Wi-Fi with it.
- **Used by:** the Wi-Fi captive portal Worker, `setup:wifi-portal`, `wifi-portal-dev.mjs`.
- **Gets there by:** `setup:wifi-portal` puts it on the Worker.
- **Expires:** check at [unifi.ui.com/api](https://unifi.ui.com/api); set when the key was made.

### `UPTIME_ROBOT_API_KEY`

UptimeRobot checks the sites from outside Cloudflare and emails alerts@ when one is down; `setup:uptime` uses this key to keep the monitors in place.

- **Owner:** UptimeRobot account alerts@gwenda.co.uk: its main API key.
- **SM:** `UPTIME_ROBOT_API_KEY`, shared, in [`ark-dev`](#ark-dev). The main API key of the UptimeRobot account (login alerts@gwenda.co.uk).
- **Used by:** `npm run setup:uptime`, on your machine only.
- **Expires:** never.

---

## Plain settings

Not secret: committed in `wrangler*.toml`, the deploy workflows or the local defaults. Each app's dev config (`wrangler.dev.toml`) sets the dev value.

### Environment

The same code runs as production, dev and on your machine; these tell it which one it is, so it picks the right data and protections.

- `SITE_ENV`: `production`, `dev` or `local`. Required: `environmentOf` in `shared/config-db.js` throws if it is missing, so dev data can't reach production by accident. Set in every `wrangler*.toml`, and `production` on the site-health Worker.
- `SITE_PREVIEW`: `true` on a website preview (drafts shown, password gate). Set in `[env.preview.vars]`.

### Sanity

Which Sanity project and which view of it (published or drafts) a site builds from.

- `SANITY_PROJECT_ID`: `pn5yjro6` (Gwenda Web, production) or `gwscpagy` (Gwenda Dev). Your machine defaults to `gwscpagy`.
- `SANITY_DATASET`: `production` in both projects (each has one dataset).
- `SANITY_PERSPECTIVE`: `published` for a live site, `previewDrafts` for a preview.

### Addresses

Where each part finds the others, and where alerts go.

- `ALERT_EMAIL`: `alerts@gwenda.co.uk`, where ops, the website and site health send alerts.
- `INVITE_BASE_URL`, `INVITE_IMAGE_URL`: links and the image in event invite emails. Your machine defaults `INVITE_BASE_URL` to `http://localhost:4321`.
- `SITE_DEPLOY_WEBHOOK_URL`: where ops finds the site deploy webhook Worker.
- `SITE_HEALTH_URL`: `https://health.gwenda.co.uk`, linked from ops.
- `OPS_URL`, `OPS_DEV_URL`: the ops sites the webhook ticks (`gwenda-ops.pages.dev`, `gwenda-ops-dev.pages.dev`).
- `SITE_URL`, `PREVIEW_SITE_URL`: what the site-health Worker checks.
- `GITHUB_REPOSITORY`: `gwenda-hackney/ark`, for the webhook Worker's GitHub calls.

### Google

Public halves of the Google setup; the secrets are above.

- `GOOGLE_OAUTH_CLIENT_ID`: the ops sign-in client (its secret is above).
- `GOOGLE_CALENDAR_ID`: the production events calendar, in production ops' `wrangler.toml`.

### Mailchimp sync Worker

Which audience and which Baserow tables the sync works on.

- `MAILCHIMP_AUDIENCE_ID`: the audience it syncs into.
- `BASEROW_API_URL`: `https://api.baserow.io` (also on the Wi-Fi portal).
- `BASEROW_SYNC_LOG_TABLE_ID`: the Baserow table it logs runs to.

### Wi-Fi captive portal Worker

Which Wi-Fi network the portal controls, and how guests are let on.

- `UNIFI_CONSOLE_ID`, `UNIFI_SITE_IDENTIFIER`: which UniFi console and site.
- `UNIFI_GUEST_MINUTES`: `1440`, how long a guest stays connected.
- `WIFI_SUBSCRIBE_TAG`: `wifi`, the tag on subscribers who signed up through the portal.
- `REDIRECT_URL`: `https://gwenda.co.uk`, where guests land afterwards.

### Website build (set by CI in `.github/actions/deploy-pages`)

Stamped into each build so a page can say which build it is, whether it's a preview, and where it lives. The deploy checks compare the stamp to know the new build is live.

- `PUBLIC_BUILD_VERSION`, `PUBLIC_BUILD_SHA`, `PUBLIC_BUILD_REF`, `PUBLIC_BUILD_TIME`: the build stamp. The site reports the version as `X-Gwenda-Version`.
- `PUBLIC_IS_PREVIEW`: `true` for a preview or the dev website.
- `PUBLIC_ENV_LABEL`: the ribbon text on a non-live build.
- `PUBLIC_SITE_ORIGIN`: the public address of a non-live build.
- `PUBLIC_OPENING_DATE`: the opening date; GitHub variable `PUBLIC_OPENING_DATE`, default `2026-08-01`.

### Secrets Manager scripts

Optional, not secret, and unset by default.

- `BWS_SERVER_URL`: the Bitwarden server the scripts talk to. Unset means `https://vault.bitwarden.eu`, where our account is. Set it only if the account moves.

### Your machine only

Personal settings for local work, so test email reaches you and nothing else.

- `FORMS_NOTIFY_EMAIL`: the safe inbox outside production. Defaults to your git email; override it in `.env`.
- `.env` is optional and holds personal overrides only. Never secrets, never `ARK_LOCAL_BW_TOKEN` or `BWS_ACCESS_TOKEN`.

---

## Overview

| Name | Owner | Dev / production | SM project (production / dev) | Expires |
|---|---|---|---|---|
| `ARK_LOCAL_BW_TOKEN` | Bitwarden `ark-local` | — | vault note | never |
| `ARK_CI_TOKEN` | Bitwarden `ark-ci` | production | GitHub env `production` | as set |
| `ARK_CI_DEV_TOKEN` | Bitwarden `ark-ci-dev` | dev | GitHub envs `dev`, `preview` | as set |
| `CLOUDFLARE_API_TOKEN` | Cloudflare account | shared | — / [`ark-dev`](#ark-dev) | never |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account | shared | — / [`ark-dev`](#ark-dev) | never |
| `BASEROW_OPS_API_KEY` | Baserow automation@ | own values | [`ark/ops`](#arkops) / [`ark/ops-dev`](#arkops-dev) | never |
| `BASEROW_WEBSITE_API_KEY` | Baserow automation@ | own values | [`ark/web`](#arkweb) / [`ark/web-dev`](#arkweb-dev) | never |
| `BASEROW_CONFIG_API_KEY` | Baserow automation@ | `__DEV` / `__PRODUCTION` | [`ark`](#ark) / [`ark-dev`](#ark-dev) | never |
| `BASEROW_JWT_EMAIL` / `_PASSWORD` | Baserow automation@ | shared | — / [`ark/ops-dev`](#arkops-dev) | never |
| `SANITY_API_TOKEN` | Sanity projects | own values | [`ark/web`](#arkweb) / [`ark/web-dev`](#arkweb-dev) | never |
| `SANITY_DEPLOY_TOKEN` | Sanity project `pn5yjro6` | shared | — / [`ark/web-dev`](#arkweb-dev) | never |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Google Cloud `gwenda-ops` | shared | — / [`ark/ops-dev`](#arkops-dev) | never |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google Cloud `682046070260` | shared | — / [`ark/ops-dev`](#arkops-dev) | never |
| `OPS_SESSION_SECRET` | Gwenda | own values | [`ark/ops`](#arkops) / [`ark/ops-dev`](#arkops-dev) | never |
| `OPS_LOCAL_ADMIN_PW` | Gwenda | own values | [`ark/ops`](#arkops) / [`ark/ops-dev`](#arkops-dev) | never |
| `SUBSCRIBE_SECRET` | Gwenda | own values | [`ark/web`](#arkweb) / [`ark/web-dev`](#arkweb-dev) | never |
| `FORMS_ADMIN_SECRET` | Gwenda | own values | [`ark/web`](#arkweb) / [`ark/web-dev`](#arkweb-dev) | never |
| `SITE_PASSWORD` | Gwenda | own values | [`ark/web`](#arkweb) / [`ark/web-dev`](#arkweb-dev) | never |
| `GATE_BYPASS_KEY` | Gwenda | own values | [`ark/web`](#arkweb) / [`ark/web-dev`](#arkweb-dev) | never |
| `DEPLOY_WEBHOOK_SECRET` | Gwenda | own values | [`ark/web`](#arkweb) / [`ark/web-dev`](#arkweb-dev) | never |
| `DISPATCH_TOKEN` | GitHub user das974 | shared | — / [`ark-dev`](#ark-dev) | none reported |
| `MAILCHIMP_API_KEY` | Mailchimp user dscalamogna@ | shared | — / [`ark/web-dev`](#arkweb-dev) | **~2027-10-01** |
| `SUBSCRIBE_MAILCHIMP_SYNC_SECRET` | Gwenda | shared | — / [`ark/web-dev`](#arkweb-dev) | never |
| `UNIFI_SITE_MANAGER_API_KEY` | UniFi account | shared | — / [`ark/web-dev`](#arkweb-dev) | check UniFi |
| `UPTIME_ROBOT_API_KEY` | UptimeRobot alerts@ | shared | — / [`ark-dev`](#ark-dev) | never |
