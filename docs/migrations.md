# Deploy migrations

Changes to data the apps share (Baserow columns and tables, config rows) that a code change depends on go in `migrations/`. CI runs them around each deploy, so nobody has to remember a setup script.

## Before and after the deploy

- **pre** runs before the app deploys. It may only **add** (a column, a table, a row), because the code still running must keep working next to it.
- **post** runs once the new code is live. It **removes** what only the old code used.

A rename is two releases: add the new column (pre), switch the code, then remove the old one (post) in a later change.

## Writing one

One file per change, named with the date so they run in order:

```js
// migrations/2026-09-25-form-submissions-edit-link.mjs
export const app = "web";      // whose deploy runs it: "web" or "ops"
export const phase = "pre";    // "pre" or "post"
export const about = "Form Submissions: Edit Link column";

export async function up({ env, database, processEnv, log }) {
  const website = await database("website"); // or "ops"
  log(await website.ensureField("Form Submissions", { name: "Edit Link", type: "url" }));
}
```

`database(key)` opens this environment's database (`scripts/lib/migrations.mjs` `DATABASES`): `website` or `ops`, in `dev` (Gwenda Dev) or `production` (Gwenda), or `config`, that environment's Gwenda Config database. It offers `ensureField`, `ensureSelectOption`, `removeField` and `fields`. Anything else can call the Baserow API with the same login.

A migration can also change **Sanity content** (a form's field, a document the code now reads differently): `up` gets `sanity()`, this environment's project (`query(groq, params)`, `mutate(mutations)`), through `SANITY_API_TOKEN`, which web deploys pull before they migrate. Query the real state first and patch only what's left to do; see `2026-10-05-play-form-series-choice.mjs`. The website is built before the post migrations, so the runner notes every change the build reads, a published Sanity document (not drafts) or a row in a table in `SITE_BUILD_TABLES`, and CI then rebuilds: `web.yml` both dev sites, `web-promote.yml` a content promote and production's preview. Change content only through `sanity()` and `database()`, so nothing is missed.

Pick `app` by which deploy the change belongs to: the app whose new code needs it (pre) or whose old code last used it (post).

**Every migration must be safe to run again.** Nothing records which ones ran: every deploy runs them all, and each checks the real state first. A record would be wrong after `copy-prod-to-dev` replaces a copy from production. Also add new columns to the matching `setup:baserow-*` script, so a table built from scratch has them.

Delete a migration once it has run in production. Two standing migrations are the exception and stay: `config-retired-settings.mjs` removes whatever is listed in `RETIRED_SETTINGS`, and `smoke-test-cleanup.mjs` removes the deploy smoke test's sign-up from Subscribers and, in production, Mailchimp, if a run left it behind.

Code that uses a new column should cope without it (see `saveFormEditLink` in `marketing/web/functions/_lib/form-store.js`). Then a local database, or a deploy that skipped migrations, still works.

## Changing menu or event data, and dry runs

A migration that changes records in D1 (menu sections, dishes, event series) goes through the feature's use cases, not SQL: `opsDataForMigration` (`scripts/lib/ops-migration.mjs`) hands `up` an `env` whose repositories are this environment's D1, and logs every write as what changed. See `2026-11-10-menu-plain-sections.mjs`.

With `--dry-run` (and `--only`) the same code runs against a throwaway copy of the data instead (`scripts/lib/d1-rehearsal.mjs`): an in-memory SQLite with every `db/ops/migrations/*.sql` applied, filled with the real rows. Nothing is written, and the log is what the real run will do, also when the environment's D1 schema is behind the code: the dry run then names what is missing, and the real run refuses until the schema is applied:

```bash
node scripts/with-ops-env.mjs node scripts/migrate.mjs --app ops --phase post --env dev --only 2026-11-10-menu-plain-sections --dry-run
node scripts/with-ops-env.mjs node scripts/d1-migrate.mjs --env dev --db ops   # the D1 schema; --dry-run lists what is pending
```

Only D1 has a copy to rehearse on. A dry run gets no Google service account, so nothing it runs can change the calendar or Drive, but a use case that writes to Sanity would write for real: on a dry run a migration says what it would do there instead of calling it (see `2026-11-10-one-happy-hour.mjs`, which deletes a series and publishes the removal).

Migrations run in file-name order, and one may need another's result (Chez Pickle's menu chapter belongs to the series that `2026-11-10-a-series-categories.mjs` marks a pop-up kitchen; `2026-11-10-z-promotions-on-website.mjs` goes last). When the order matters, say so in the name, with a letter after the date.

## Rehearsing a rollout on dev

`npm run rehearse:rollout` (`scripts/rehearse-rollout.mjs`) does on dev what a release will do in production, from production's data: it copies production's menu, events and artists (D1) and website content (Sanity) over dev, applies the D1 schema, runs the ops post-deploy migrations the branch adds (the ones `main` doesn't have), brings the website content up to date as ops does by itself (the menu's Update website, the events' website job), and checks the result. It only ever writes dev; production is read. `-- --dry-run` says what it would do, `-- --no-copy` keeps dev's data.

Production's series point at production's Drive folders, and dev uses the same Google service account, so `data:move` leaves those behind on any copy out of production (see [db/README.md](../db/README.md)): they never reach dev. Hosted dev ops runs `main` on the same data every five minutes; while a branch changes what the website job compares, the rehearsal holds hosted dev off the series concerned (see `holdHostedDev` in the script).

## Where CI runs them

| Deploy | pre | post |
|--------|-----|------|
| Website, dev (`web.yml`) | dev | dev |
| Website, prod's preview (`web.yml`, release) | production | — (the live site still runs the old code) |
| Website, production (`web-promote.yml`) | production | production |
| Ops, dev and production (`apps.yml`) | its env | its env |

Schema changes log in to Baserow as `BASEROW_JWT_EMAIL` / `BASEROW_JWT_PASSWORD` (Secrets Manager), because database tokens can only touch rows.

By hand, e.g. against your dev copy:

```bash
npm run migrate -- --app web --phase pre --env dev
```
