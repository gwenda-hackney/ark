# Configuration layers

Gwenda separates **secrets**, **deploy-time vars**, and **runtime config**.

| Layer | Store | Examples |
|-------|--------|----------|
| Secrets | Bitwarden Secrets Manager → process env locally (after `bw-unlock`) / Cloudflare Pages secrets | API tokens, passwords, signing keys |
| Deploy-time plain config | `wrangler.toml` `[vars]` | `SITE_ENV`, `ALERT_EMAIL` |
| Fixed values, same in every env | Code constants | Mail sender (`shared/mail-from.js`) |
| Runtime non-secret config | Baserow **Gwenda Config** database, one per environment (profiled by Env + Service) | Pour targets, Sanity project/dataset, dev notify inbox |
| Marketing product flags | Sanity `siteSettings` | Booking / gallery toggles |

| File | Role |
|------|------|
| `.env` | Optional personal overrides (`.env.example`); `FORMS_NOTIFY_EMAIL` defaults to your git email |
| `/dev/shm/ark-secrets-<uid>/` | RAM cache of every app secret under its SM name (not in the repo; see [env.md](./env.md)) |

Everything loads through `scripts/lib/load-env.mjs`: `.env`, then `LOCAL_DEFAULTS` (a machine works on the dev copies), then secrets from the unlocked vault (cached), then the app's runtime names from the rename table below. Marketing / Studio (`with-env`) get web names; ops scripts and `npm run ops:dev` (`with-ops-env`, `ops-dev`) get ops names.

## Secrets: one naming rule

Each secret in detail (use, expiry, what changing it breaks): [env-reference.md](env-reference.md).

Bitwarden Secrets Manager has no per-env secrets, so env is encoded in the name:

| SM name | Meaning |
|---------|---------|
| `NAME` | The same value in every env |
| `NAME__DEV` / `NAME__PRODUCTION` | The value for that env. Wins over `NAME`. |

There are two envs. **dev** is a developer's machine and the hosted dev sites alike; **production** is live and its preview. A pull for env `E` lists every SM project, keeps `NAME` and `NAME__E`, and lets the env value win. That is the whole merge: code reads the plain `NAME` and never chooses an env. Per-env credentials (Baserow tokens, `FORMS_ADMIN_SECRET`) have **no** shared `NAME`, so a missing value is reported as missing instead of silently using another env's.

The one reader that needs another env's value asks for it by its full name: production ops compares its database with the dev copy using `BASEROW_OPS_API_KEY__DEV` (`ops/site/src/platform/db-diff.js`). Do not add bespoke per-env names (`FOO_DEV_KEY`) or env checks that pick a secret.

Which runtime keys each app gets is a manifest in `scripts/lib/bitwarden-sm.mjs` (`APP_SECRETS`). When a runtime key differs from the SM name, the manifest renames it (locally in `load-env.mjs`, in CI via `--github-env`):

| App | Runtime key | SM name |
|-----|-------------|---------|
| ops | `BASEROW_API_KEY` | `BASEROW_OPS_API_KEY__<ENV>` |
| ops | `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` | `GOOGLE_SERVICE_ACCOUNT_JSON` |
| web | `BASEROW_API_KEY` | `BASEROW_WEBSITE_API_KEY__<ENV>` |
| web | `GMAIL_SERVICE_ACCOUNT_JSON` | `GOOGLE_SERVICE_ACCOUNT_JSON` |

Everything else uses the same name at runtime and in SM. The same manifest drives local pulls (`env:<app>:pull`), CI pulls (`--github-env`) and the Cloudflare Pages sync (`setup:ops`, `sync-pages-secrets.mjs`), so there is one list to edit.

Projects record ownership (`SECRET_OWNERS`). A key must live in exactly one project; the pull fails if the same name appears in two. Projects come in pairs, named like everything else (#61; each project and who reads it: [env-reference.md](env-reference.md#secrets-manager-projects)): **`ark`, `ark/ops`, `ark/web` are production** and hold the `NAME__PRODUCTION` values; **`ark-dev`, `ark/ops-dev`, `ark/web-dev`** hold the `NAME__DEV` and shared `NAME` values. A write goes to the owner's production project for a `__PRODUCTION` name and to its `-dev` project otherwise; a pull reads every project the token can see. `npm run secrets:move-dev` moves the dev and shared values out of the production projects (dry run first, `-- --apply` to move). `npm run secrets:rename -- OLD NEW` renames a secret, for example a shared `NAME` that becomes `NAME__PRODUCTION` (dry run first, `--apply` to rename). `npm run secrets:import-env` stores secrets pasted into `.env` and removes those lines (dry run first, `-- --apply` to store).

| Project (name in SM) | Owns |
|---------|------|
| `ark` | Cloudflare tokens, `BASEROW_CONFIG_API_KEY__*` |
| `ark/ops` | `BASEROW_OPS_API_KEY__*`, Google service account + OAuth secret, ops session/bypass, Lightspeed, Baserow login `BASEROW_JWT_EMAIL` / `BASEROW_JWT_PASSWORD` (automation@) |
| `ark/web` | `BASEROW_WEBSITE_API_KEY__*`, `FORMS_ADMIN_SECRET__*`, Sanity, deploy webhook, subscribe, site gate, Instagram |

Scripts find the projects by name (ignoring case) with `bws project list`, so recreating a project needs no code change.

### Who reads what (#61)

| Machine account | `ark`, `ark/ops`, `ark/web` (production) | `ark-dev`, `ark/ops-dev`, `ark/web-dev` | Where the token lives |
|---|---|---|---|
| `ark-local` | read/write | read/write | vault note `ark/.env.local` as `ARK_LOCAL_BW_TOKEN` (a developer's machine) |
| `ark-ci` | read | read | token `ARK_CI_TOKEN`, stored as GitHub environment `production` secret `BWS_ACCESS_TOKEN` (deploys from `release` only) |
| `ark-ci-dev` | none | read | token `ARK_CI_DEV_TOKEN`, stored as GitHub environments `dev` and `preview` secret `BWS_ACCESS_TOKEN` |

So a job on `main` or a feature branch can't read a production value. In CI a pull defaults to production on `release` and dev on any other branch; a production pull with a token that sees no `__PRODUCTION` value stops with "This token can't read production secrets" instead of quietly using shared values. `pr.yml` uses no secrets.

### Shared names and production

A shared `NAME` is visible to the dev token, so it must not be able to change production. Names that only ever act on production are **production-only** (`PRODUCTION_ONLY` in `scripts/lib/bitwarden-sm.mjs`): stored as `NAME__PRODUCTION`, skipped by a dev pull, and read by scripts through `productionSecretValues()`; storing one without the suffix is refused. Audit (2026-10-01):

| Shared name | Can it touch production? | Decision |
|---|---|---|
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Yes: a token deploys every Pages project and Worker in its account | Split: dev has its own Cloudflare account (gwenda-dev), `__DEV` and `__PRODUCTION` (#129) |
| `DISPATCH_TOKEN` | Yes: starts workflows | Production only: `DISPATCH_TOKEN__PRODUCTION` |
| `MAILCHIMP_API_KEY`, `SUBSCRIBE_MAILCHIMP_SYNC_SECRET` | Yes: the real audience | Production only: `…__PRODUCTION` |
| `SANITY_DEPLOY_TOKEN` | Yes: deploys the hosted Studio | Production only: `SANITY_DEPLOY_TOKEN__PRODUCTION` (deploy locally with `npx sanity login`) |
| `UNIFI_SITE_MANAGER_API_KEY` | Yes: the venue Wi-Fi | Stays shared: there is one controller (the venue's), and the local portal dev server needs it |
| `UPTIME_ROBOT_API_KEY` | Monitoring only | Production only: `UPTIME_ROBOT_API_KEY__PRODUCTION` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Yes: sends mail as notifications@, edits calendars | Split: a dev service account limited to the dev calendar and the safe inbox (follow-up) |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Low: sign-in only works on registered addresses | Split: a dev OAuth client (follow-up) |
| `BASEROW_JWT_EMAIL` / `_PASSWORD` | Yes: automation@ is in both workspaces, and Baserow tokens can't change structure, so migrations need this login | Stays shared: replaced by the move off Baserow (#127) |
| `BASEROW_CONFIG_API_KEY` | Yes, when one config table held both envs' rows | Split: a Gwenda Config database per env, `__DEV` and `__PRODUCTION` tokens |
| `DEPLOY_WEBHOOK_SECRET` | Yes: the webhook can start a live promote | Split: `__PRODUCTION` and `__DEV`; the webhook lets the dev one rebuild the dev website only |

```bash
npm run env:secrets:refresh                   # refetch dev into the RAM cache
npm run env:secrets:refresh -- --env production --dry-run
FORMS_ADMIN_SECRET=... npm run env:web:push -- FORMS_ADMIN_SECRET   # shell → SM (shared name unless --profile)
FORMS_ADMIN_SECRET=... npm run env:web:push -- --profile dev FORMS_ADMIN_SECRET   # → FORMS_ADMIN_SECRET__DEV
```

Machine accounts: see [Who reads what](#who-reads-what-61). Local bootstrap is `ARK_LOCAL_BW_TOKEN`, read from the unlocked vault note `ark/.env.local` (never in `.env`); CI uses the `BWS_ACCESS_TOKEN` of the job's GitHub environment. Do not mirror app secrets into GitHub.

Sync to Cloudflare Pages (manual, after rotation):

```bash
gh workflow run ops-secrets.yml                     # production ops
gh workflow run web-secrets.yml -f profile=production   # gwenda: live, and the gate secrets on its preview
gh workflow run web-secrets.yml -f profile=dev          # gwenda-web-dev
```

Deploy workflows (`web.yml`, `web-promote.yml`) ship code only. They do not push Pages secrets.

## Runtime config: Gwenda Config database

Non-secret settings live in a Baserow database called **Gwenda Config** (table `Config`), one per environment: production's in the **Gwenda** workspace, dev's in **Gwenda Dev**. Each has its own token, so nothing that runs in dev can change production's settings. It sits outside the Ops and Website databases, so copying data between envs (prod Ops → dev Ops) never copies config.

| Column | Values |
|--------|--------|
| Name | Dotted key, e.g. `forms.notify_email` |
| Value | String |
| Env | `all`, `dev`, `production`; machine state also uses a site's name (`preview`) |
| Service | `all`, `ops`, `web` |

### The config service

All code reads settings through **`shared/config.js`**, never the database directly (`shared/config.test.js` fails the build otherwise). It decides where each value comes from, in order:

1. **A developer's own value.** On a developer's machine (`SITE_ENV=local`, set by `npm run ops:dev` / `web:dev`), settings marked `local` read that developer's value: `FORMS_NOTIFY_EMAIL` defaults to their git email (`git config user.email`) and can be overridden in `.env`. `ops:dev` / `web:dev` refuse to start without it.
2. **The Config database.** This environment's row, else the `all` row. A developer's machine reads **dev's** database: dev settings are its defaults.

The environment comes from `SITE_ENV`: `dev` (hosted dev), `local` (a developer's machine, which is dev), `production`. Prod's preview runs as `production`. A runtime writes only its own Env row (e.g. ops `/config` pour targets). Values are cached for 60 seconds per isolate. Each environment reads its own database with its own token, `BASEROW_CONFIG_API_KEY__DEV` or `__PRODUCTION`, which sees only that database.

**Moving to D1 (#127).** `shared/config.js` reaches the rows only through the config repository (`shared/config-repository.js`): Baserow today, the `config_values` table of the `gwenda-config` D1 database once `store:config` in its `_meta` says `d1` (`npm run data:move -- --feature config …`, then `npm run d1:store`). In D1 a name + Env + Service is one row (a unique key), so a write is an upsert. Code outside Pages (scripts, CI) reaches D1 with `SITE_ENV` and that environment's `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`; without them it stays on Baserow.

Ops **Developer tools → Settings** lists every setting in its environment and where its value comes from; in dev it also shows a developer's machine.

| Key | Env / Service | Meaning | On a developer's machine |
|-----|---------------|---------|--------------------------|
| `pour_target.*` | all, then per env / ops | House pour-cost % by drink type. Saving at ops `/config` writes that env's row. | dev rows |
| `sanity.project_id` | all, dev / all | Sanity project (dev: Gwenda Dev) | dev row |
| `site_deploy.webhook_url` | all / ops | Deploy webhook Worker | |
| `google.oauth_client_id` | all / ops | Google OAuth client id (secret stays in SM) | |
| `google.drive_events_folder_id` | dev, production / ops | Drive folder for event galleries (`Events-dev/` vs `Events/`) | dev row |
| `google.calendar_id` | dev, production / ops | Calendar that receives ops nights | dev row |
| `lightspeed.archive_skus` | per env / ops | Lightspeed SKUs archived from the ops stock view | |
| `ops.admin_emails` | all / ops | Who sees Developer tools (everyone in dev) | |
| `forms.notify_email` | dev / web | Form notifications outside production: `alerts@gwenda.co.uk`. Required outside production (none means no email). Production has no row: each form's own address. | **`FORMS_NOTIFY_EMAIL`** in `.env` (your email) |

Do **not** put credentials here.

```bash
npm run setup:baserow-config -- --env dev               # create/repair DB, table, fields, seed rows. Additive only.
npm run setup:baserow-config -- --env dev --token       # also mint BASEROW_CONFIG_API_KEY__DEV into SM
npm run setup:baserow-config -- --env production --token
```

**Breaking config changes happen after the deploy.** The code still running may read a row until the new code is live. So: add what both versions need first (`setup:baserow-config` only adds), deploy, then remove the old. Retired settings are listed in `RETIRED_SETTINGS` (`shared/config.js`); `migrations/config-retired-settings.mjs` removes their rows after each ops deploy (see [migrations](migrations.md)).

### Machine state in Gwenda Config

A few rows are written by code, not people. Leave them alone:

| Key | Service | Env | Written by | Holds |
|---|---|---|---|---|
| `site.build_snapshot` | web | the site: preview / production (live) | deploy job (`site-build-snapshot.mjs`) | What the last build was made from |
| `site.auto_update` | ops | the site: preview / production | ops scheduler tick | Quiet timer, running build, failures |
| `site.prep_failures` | ops | environment | ops website jobs | Events that couldn't be got ready for the website |


## Baserow: no ids

No Baserow workspace, database or table id is configured anywhere. They change when a database is recreated, so everything goes by name:

- **Apps** use a database token. A token belongs to one workspace, so it decides the environment: the production tokens only see **Gwenda**, the dev tokens only **Gwenda Dev**. Tokens can't read database names, so the app finds its database by its tables (`DATABASE_FINGERPRINTS` in `shared/baserow.js`: Menu Sections / Menu Items / Ingredients for Ops; Subscribers / Form Submissions for Website), then its tables by name. A token that sees two such databases is an error.
- **Scripts** (migrations, clones, setup) log in as `BASEROW_JWT_EMAIL` and find databases by workspace and database name (`DATABASES` in `scripts/lib/migrations.mjs`).

The Baserow data tokens only exist per env (`__DEV` / `__PRODUCTION`), never as a shared value. That is what keeps a developer's machine off production data; there is no id check.

### The six tokens

Each Baserow token is named exactly like the SM key that holds it, so there is never a question of which token is which. They belong to the `automation@gwenda.co.uk` Baserow user (the `BASEROW_JWT_EMAIL` login), not to a person, and have create / read / update / delete on the listed databases only:

| Baserow token = SM key | Workspace | Databases |
|---|---|---|
| `BASEROW_OPS_API_KEY__PRODUCTION` | Gwenda | Gwenda Ops, Website |
| `BASEROW_WEBSITE_API_KEY__PRODUCTION` | Gwenda | Website |
| `BASEROW_OPS_API_KEY__DEV` | Gwenda Dev | Gwenda Ops, Website |
| `BASEROW_WEBSITE_API_KEY__DEV` | Gwenda Dev | Website |
| `BASEROW_CONFIG_API_KEY__PRODUCTION` (in Baserow: `gwenda-config`) | Gwenda | Gwenda Config |
| `BASEROW_CONFIG_API_KEY__DEV` | Gwenda Dev | Gwenda Config |

The website has its own token so the public site never holds a key to staff data. Config has its own so a settings reader never holds a key to data.

## Ops Baserow workspaces

Ops uses **two Baserow workspaces** so a local token cannot see production data:

| Env | Workspace | Database | Token (SM) |
|-----|-----------|----------|------------|
| production | `Gwenda` | `Gwenda Ops` | `BASEROW_OPS_API_KEY__PRODUCTION` |
| dev | `Gwenda Dev` (Free) | `Gwenda Ops` (copy) | `BASEROW_OPS_API_KEY__DEV` |

The copies are refreshed from production by CI (ops Developer tools → Copy production to dev, or Databases → Copy production over it; `copy-prod-to-dev.yml`): reading production needs the production token. Clone and promote scripts do not touch config (it is in its own database).

**Not hand-edited for production:**

| Value | Where |
|-------|--------|
| Prod secrets | SM → Pages by the ops deploy (`apps.yml`), or `ops-secrets.yml` then redeploy |
| `SITE_ENV` | `local` via ops-dev; `production` in wrangler `[vars]` |

The Drive copy and ops nights on Google Calendar use SM `GOOGLE_SERVICE_ACCOUNT_JSON` (runtime `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON`, account `gwenda-ops-drive@gwenda-ops.iam.gserviceaccount.com`). Ops copies each event's photos (main image, flyers, gallery) one way into a `website images/` folder in its Drive folder for collaborators, a few per scheduler run (`event-drive-mirror.js`); it only touches files it tagged, so files added by hand stay. A series keeps its gallery in ops (#183): photos upload straight to Sanity, and Events "Gallery" holds their asset ids, newest first, each with a night's date or none. The gallery is on in dev and production (#30). The series main image and a night's flyer upload straight to Sanity: ops keeps only the asset id (Events "Hero asset", Event dates "Override asset") and shows them from cdn.sanity.io (#183). Artist photos work the same way: Artists "Portrait asset" holds the portrait's asset id, and "Art assets" and "Gwenda assets" JSON lists of them; the website shows them from cdn.sanity.io too. The service account must be a Content manager on the Shared Drive and have **Make changes to events** on the calendar. Local ops can still override the calendar with `GOOGLE_CALENDAR_ID_LOCAL` in `.env`.

## Marketing Baserow workspaces

Marketing uses the same two workspaces so a dev token cannot see live subscribers. Prod's preview uses the production Website DB, like live:

| Env | Workspace | Database | Token (SM) |
|-----|-----------|----------|------------|
| production | `Gwenda` | `Website` | `BASEROW_WEBSITE_API_KEY__PRODUCTION` |
| dev | `Gwenda Dev` (Free) | `Website` (copy) | `BASEROW_WEBSITE_API_KEY__DEV` |

Subscribe, RSVP, and form submission tables are resolved **by name** (`Subscribers`, `Event Invites`, `Form Submissions`). The token is scoped to that env's Website database, so runtime needs no id. Do not copy subscriber or RSVP rows from dev to production.

Ops `/forms` reads the same Form Submissions table with runtime `BASEROW_WEBSITE_API_KEY` (same SM key, same env).

```bash
npm run dev:refresh:baserow-web                    # once: copy website DB into Gwenda Dev
npm run setup:baserow-form-submissions           # create/repair Form Submissions table (JWT)
```

## Form mail

Mail goes out through the Gmail API as `notifications@` with `GMAIL_SERVICE_ACCOUNT_JSON` (domain-wide delegation); see [email.md](./email.md). Form From / Reply-To / notify addresses live on the Sanity `form` document; `forms.notify_email` in config overrides the notify address outside production (the dev inbox).

Each submission sends two emails: a **notification** to the team and a **receipt** to the applicant. After each one actually goes out (not a local dry run) the row is stamped in `Notify Sent` / `Receipt Sent`.

The code that renders and sends both emails lives in `shared/forms/` and is used by both apps. Ops `/forms` shows both stamps and can send or resend either email itself: it reads the row, loads the form from the live site's Sanity dataset (published only), sends through the same Gmail mailbox (`GMAIL_SERVICE_ACCOUNT_JSON`, sender in `shared/mail-from.js`), and stamps the row. Ops never calls the website.

The receipt's "change your application" link is signed with the website's secret. The site saves the finished link in the row's `Edit Link` column when it stores the submission, so ops can resend a receipt without the secret or the website's address. The column is added by a pre-deploy [migration](migrations.md); until it exists the site skips saving. Rows without a link get a link to the form's page on gwenda.co.uk instead.
