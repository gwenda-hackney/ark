# D1 databases

The data layer is moving from Baserow to Cloudflare D1, one feature at a time (#127). It sits behind each feature's repository (#186).

## Databases

Each Cloudflare account (production, and gwenda-dev) has its own three databases. Code in one account can never reach the other's.

| Role      | Database         | Binding      | Holds                                                 | Bound in                                   |
| --------- | ---------------- | ------------ | ----------------------------------------------------- | ------------------------------------------ |
| `ops`     | `gwenda-ops`     | `OPS_DB`     | events, menu and inventory, artists, users, Instagram | ops; website (artists)                     |
| `website` | `gwenda-website` | `WEBSITE_DB` | guests: subscribers, form submissions, invites        | website, ops, Mailchimp sync, Wi-Fi portal |
| `config`  | `gwenda-config`  | `CONFIG_DB`  | settings and sync state                               | ops, website                               |

The names, ids and bindings are listed in `shared/d1-databases.js`.

## Reaching a database

All three ways have the same shape (`prepare/bind/all/first/run`, `batch`), so an adapter can't tell them apart:

| Where                                              | How                                                                                                             |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Workers and Pages Functions                        | the binding (`env.OPS_DB`)                                                                                      |
| Node scripts, the website build in CI, `astro dev` | the REST API (`shared/d1-http.js`), using this environment's `CLOUDFLARE_API_TOKEN`                             |
| Tests                                              | `createTestD1(role)` (`shared/testing/d1-sqlite.js`), an in-memory SQLite with this folder's migrations applied |

`databaseFor(env, role)` in `shared/d1-env.js` picks the binding when there is one, and the REST API otherwise. Only repository adapters call it. Helpers for queries, inserts and patches are in `shared/d1.js`.

## Writing a feature's D1 adapter

Each feature has its own D1 adapter, because only that adapter knows its tables (#186). Adapters are built from shared functions they compose, never from base classes:

1. **Declare each table** with `d1Table({ table, columns, orderBy })` from `shared/d1-table.js`. That gives:
   - `toRecord/toRow`;
   - `get/list/insert/patch/remove/upsert`;
   - `*Statement` versions, to put changes to several tables in one `batch`;
   - `exportAll`.
2. **Write only the queries the domain needs,** usually `table.list(db, { where, params })`.
3. **Copy methods:**
   - `exportAll()` returns `exportTables(db, [parents…, children…])`;
   - `importAll(snapshot)` calls `importTables(db, [[table, records], …])`, which keeps ids and works in dependency order.
4. **Test it** with `repositoryContract(name, { adapters, seed, cases })` from `shared/testing/repository-contract.js`. It runs the feature's cases against every adapter, plus the shared copy round trip.

## Migrations

`db/<role>/migrations/NNNN_<what>.sql`, applied in order by `wrangler d1 migrations apply`. It runs before every deploy (#191), and wrangler records which migrations ran.

- **SQL migrations only add things:** tables, columns with defaults, indexes. Dev deploys run ahead of production, and every app deploys at its own moment, so a new column must never break code that doesn't know about it yet.
- **Removals** (dropping a column or table) are JS migrations with `phase: "post"` in `/migrations`, after the code that used it is gone.
- **Never edit a migration** once it has run anywhere. Add a new one.

## Schema conventions

| Thing                                     | Rule                                                                                                                                          |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Names                                     | snake_case. Tables are plural (`menu_items`), columns aren't (`alt_price`).                                                                   |
| Ids                                       | `id INTEGER PRIMARY KEY AUTOINCREMENT`. The import from Baserow keeps Baserow's row ids, so routes, Sanity references and links keep working. |
| One-choice values (Baserow single select) | `TEXT`, with the allowed values as constants in the domain model. No `CHECK`: in SQLite, adding a value would mean rebuilding the table.      |
| Lists of values (multi select)            | a JSON array in `TEXT`                                                                                                                        |
| Yes/no                                    | `INTEGER NOT NULL DEFAULT 0`, 0 or 1 (`toBool`/`fromBool`)                                                                                    |
| Dates                                     | `TEXT`: `YYYY-MM-DD`, or ISO-8601 UTC for moments. Names end in `_on` (dates) or `_at` (moments).                                             |
| Structured values                         | JSON in `TEXT` (`toJson`/`fromJson`)                                                                                                          |
| A link to one row                         | `<thing>_id INTEGER REFERENCES <things>(id)`, with `ON DELETE SET NULL` unless the row means nothing without it (`CASCADE`)                   |
| Links to many rows                        | a junction table `<a>_<b>(a_id, b_id, PRIMARY KEY (a_id, b_id))` with `ON DELETE CASCADE`                                                     |
| Images                                    | Sanity asset ids in `TEXT` (#183). D1 holds no files.                                                                                         |
| Order                                     | every query that returns a list has an explicit `ORDER BY`                                                                                    |
| Indexes                                   | on every column a repository filters or joins by. On the free plan, every row a query scans counts towards 5M reads a day.                    |

## Limits to design around

| Limit                              | How we handle it                                                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 100 bound parameters per statement | `insertRows` splits rows; `idList` passes any number of ids as one parameter (`IN (SELECT value FROM json_each(?))`) |
| 100 KB per statement               | large JSON goes in as a bound parameter, never as SQL text                                                           |
| 50 queries per request (free plan) | adapters write with `batch`, one call                                                                                |
| Foreign keys are always on         | a migration that rebuilds a table uses `PRAGMA defer_foreign_keys = true`                                            |
| A `batch` is one transaction       | over the REST API, not documented; scripts check the outcome (#190)                                                  |

Free-plan allowances per account: 5M rows read and 100k written per day, 5 GB storage, 7 days of Time Travel. At our size this should cost $0. Going over a daily limit stops queries until 00:00 UTC, so Dev tools shows the day's usage.
