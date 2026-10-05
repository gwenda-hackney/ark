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

**Every migration must be safe to run again.** Nothing records which ones ran: every deploy runs them all, and each checks the real state first. A record would be wrong after `baserow-copy` replaces a copy from production. Also add new columns to the matching `setup:baserow-*` script, so a table built from scratch has them.

Delete a migration once it has run in production. `config-retired-settings.mjs` is the exception: it stays and removes whatever is listed in `RETIRED_SETTINGS`.

Code that uses a new column should cope without it (see `saveFormEditLink` in `marketing/web/functions/_lib/form-store.js`). Then a local database, or a deploy that skipped migrations, still works.

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
