# Gwenda ops site

Internal ops tools on Cloudflare Pages with a shared Svelte shell (collapsible rail).
Auth is Google OAuth in the app (local and production). Membership is Baserow Users.

Live: [gwenda-ops.pages.dev](https://gwenda-ops.pages.dev)

## Layout

```
ops/site/                 one package: @gwenda/ops
├── src/                  one folder per part of ops, plus four shared ones
│   ├── events/  menu/  inventory/  artists/  forms/  users/
│   ├── website/  config/  home/  access/ (sign-in)
│   │     each holds its screens (.svelte), logic (.ts/.js) and tests (*.test.*);
│   │     server/ inside it holds its Baserow, Sanity and Google code (Functions only)
│   ├── app/              App.svelte, main.ts, shell/, navigation, routing, API client, money format
│   ├── ui/               shared components (grid, fields, dialogs, toast…) and theme/
│   ├── platform/         server building blocks: Sanity, Google, HTTP, log, config (Baserow is in /shared)
│   └── testing/          the fake world for use-case tests
├── functions/            Pages Functions routes only: middleware and /api/*, calling src/
├── scripts/              ops-only tooling: setup-baserow (npm run setup:baserow-ops), LWC price list, supplier enrichment; data/
├── public/               served as-is: gate/ (sign-in page), icons, robots.txt
├── dist/                 build output (gitignored): `npm run build`, deployed by CI
├── index.html  vite.config.ts  svelte.config.js  tsconfig.json
└── wrangler.toml / wrangler.dev.toml
```

**Rules**
- New code goes in the folder of the part of ops it belongs to; there is no catch-all `lib/`.
- The app never imports `server/` or `platform/`. Code outside them may be imported by the app, so it must be pure: no `fetch`, no `env`.
- Tests sit next to the code they test; each area's `use-cases.test.js` covers what an editor does ([docs/testing.md](../../docs/testing.md)).
- Code another app needs (website, scripts) moves to `/shared` rather than being imported from here ([#64](https://github.com/gwenda-hackney/ark/issues/64)).

## Shell

One UI for all tools. Collapsible icon rail (state in `localStorage` key `ops.rail`):

| Route | Content |
|-------|---------|
| `/` | Overview |
| `/menu` | Menu items (Stock) |
| `/menu/new` | New recipe |
| `/menu/:name` | Recipe detail (`/menu/negroni`) |
| `/inventory` | Inventory (Stock) |
| `/inventory/new` | New inventory item |
| `/inventory/:name` | Inventory item detail |
| `/lightspeed` | Lightspeed POS reconcile (Stock) |
| `/lightspeed/export` | Lightspeed POS export (Stock) |
| `/lightspeed/menus` | Lightspeed POS menus (Stock) |
| `/suppliers` | Wholesaler catalog (Stock) |
| `/sections` | Guest menu sections |
| `/web` | The website and its preview: what is waiting, health, publish |
| `/forms` | People who submitted a site form |
| `/users` | Who may sign in |
| `/config` | House pour-cost targets (Baserow config database) |

Old hash URLs (`/#/menu`) still resolve to the path routes. Drink and inventory URLs use the unique name (`/menu/negroni`). The old static Tools pages (stock, breakeven, cashflow) were removed; the calculators come back as an ops feature in [#75](https://github.com/gwenda-hackney/ark/issues/75).

Theme/UI primitives mirror trading’s `shell.web` (Gwenda colours + Ysabeau/Roboto).

## Auth (Google OAuth + Baserow Users)

The same Google login works on **localhost** and **gwenda-ops.pages.dev**. Who may use ops lives in the Baserow **Users** table (Email + Active), managed at `/users`.

```bash
# Secrets Manager (loaded after bw-unlock); the client id is in wrangler [vars]
GOOGLE_OAUTH_CLIENT_SECRET=…
OPS_SESSION_SECRET=…          # signs the app session cookie (not from Google)

npm run setup:baserow-ops     # creates Users (and other Ops tables)
npm run setup:ops             # Pages secrets
npm run teardown:ops-access   # once: remove old Cloudflare Access apps
```

Google Cloud **Web application** OAuth client (reuse the existing client):

1. Authorized JavaScript origins: `http://localhost:5174`, `http://127.0.0.1:5174`, `https://gwenda-ops.pages.dev`
2. Authorized redirect URIs: `http://localhost:5174/api/auth/callback`, `http://127.0.0.1:5174/api/auth/callback`, `https://gwenda-ops.pages.dev/api/auth/callback`

Local: `npm run ops:dev` → http://localhost:5174/ → Continue with Google. Optional `OPS_LOCAL_ADMIN_PW` remains a local bypass only. Leave `OPS_LOCAL_ADMIN_PW` unset on Pages.

Logout clears the session cookie and returns to `/gate/`.

If Cloudflare Access still intercepts production after cutover, run `npm run teardown:ops-access` (or delete the Gwenda ops Access apps in Zero Trust).

### Letting in someone outside the company (a personal Gmail)

No code change is needed. Google sign-in proves who someone is; an active row in **Users** decides whether they get in. A company account without an active row is refused the same way an outside Gmail is.

1. **Google Cloud → OAuth consent screen** (not the OAuth client): set User type from **Internal** to **External**. Scopes stay `openid email profile`, so no sensitive-scope verification. While the app is in **Testing**, add the Gmail as a test user; publishing the app removes the test-user cap. Don't change the client id, secret or redirect URIs.
2. **Ops → `/users`:** add their Google email with **Active** on. Without the row, sign-in ends in a 403 with no session.

Where it's enforced: `api/auth/callback.js` checks `isOpsUser` before setting a session, `_middleware.js` checks again on every request, and `src/users/server/user-store.js` reads Users (cached 30 seconds). The authorize URL in `src/access/server/google-oauth.js` doesn't lock a Workspace domain. Deactivating someone at `/users` cuts them off on their next request.

There are no roles: an active user sees all of ops (recipes and trade prices, form submissions, events, website release, and `/users` itself). Only add people who should see all of that.

## Where data lives

| Data | Store |
|------|--------|
| Recipes, ingredients, method, glass, garnish, ops photos | **Baserow** `Menu Items` + `Ingredients` |
| Where a drink appears (print / digital / POS) | **Baserow** `Menu placements` (channel + section or POS menu/screen). Legacy Section / On print / On digital / POS menus fields are mirrored for compatibility. |
| Lightspeed menus catalog (Fall 2026, Gwenda, …) | **Baserow** `POS Menus`. Manage at `/lightspeed/menus`. |
| Lightspeed till screen path | **Baserow** `Menu placements` POS screen (also mirrored on Menu Items `Lightspeed menu/screen`). |
| Menu chapters and groups (Our Formulas, Spritz, Draught Beer…) | **Baserow** `Menu Sections` (parent + order). Nested tree on `GET /api/menu`. Edit in the menu **Sections** panel. |
| Bar stock / ABV catalog | **Baserow** `Inventory` |
| Wholesalers, product pages, and pack prices | **Baserow** `Suppliers` plus junction `Inventory suppliers` (SKU, pack, trade price, product URL) |
| Who may sign in to ops | **Baserow** `Users` (Email, Active). Manage in the app at `/users`, or in Baserow. |
| House pour-cost targets and other non-secret knobs | **Baserow** `Gwenda Config` database (Name, Value, Env, Service), shared with the website and never copied with Ops data. Edit pour targets at `/config`. |
| Guest digital menu (names, prices, short lines, gallery) | **Sanity** (marketing site only) |

Ops does **not** store recipes in Sanity. **Publish to digital menu** copies guest-facing fields (name, prices, menu line, section, photo) from Baserow into Sanity as **drafts**. It matches by stored Sanity ID or name, creates missing sections/items, and the preview site rebuilds once edits go quiet. They go live when ops publishes them (Website → Preview → live). In local ops this writes the Gwenda Dev copy instead.

## Local

```bash
npm run ops:dev
```

- The app, with HMR: [http://127.0.0.1:5174/](http://127.0.0.1:5174/). Use this one.
- Pages Functions and `public/` (sign-in gate, icons): [http://127.0.0.1:8788/](http://127.0.0.1:8788/). Vite proxies `/api` and `/gate` here.

Secrets come from Secrets Manager (env `dev`) after `bw-unlock`, loaded in memory and mapped to ops runtime names by `ops-dev` / `with-ops-env`; Wrangler reads them through `.dev.vars`, which is only a symlink to a per-run file in RAM (`/dev/shm`) while `ops:dev` runs; the secrets never touch the repo disk. Plain settings (Sanity project/dataset, deploy webhook URL, OAuth client id, pour targets, the web origin for form resends) load from the Baserow **Gwenda Config** database with `BASEROW_CONFIG_API_KEY`. See [docs/config.md](../../docs/config.md).

```bash
bw-unlock        # if a script says the vault is locked
npm run ops:dev
```

Local ops works exactly like hosted ops, against copies: the dev Ops DB and the **Gwenda Dev** Sanity project. Save writes drafts; Update website publishes them. See the result with `npm run web:dev` (preview) or `npm run web:dev:live` (website, port 4322). Nothing reaches gwenda.co.uk, and site builds only run hosted. Refresh the copy with `npm run dev:refresh:sanity`. See [docs/sanity.md](../../docs/sanity.md).

### Debugging production locally (`ops:prod`)

```bash
npm run ops:prod
```

The same local app (HMR, stack traces in your terminal) with **production powers**: production Ops DB (Gwenda / Gwenda Ops, reached with the production token), production secrets straight from Secrets Manager, `SITE_ENV=production`. Saves, **Update website** and **Update website now** change the real Ops DB and gwenda.co.uk, exactly like hosted ops. The app shows a red **LOCAL COPY ON LIVE DATA** banner. Stop it and run plain `npm run ops:dev` to go back to the dev copy. Don't run both at once: they use the same ports.

Resending form emails from `/forms` locally sends them from this machine: notifications go to your `FORMS_NOTIFY_EMAIL`, receipts to the applicant on the dev row. No website needs to be running.

Build:

```bash
npm run build -w @gwenda/ops
```

## Deploy

```bash
npm run deploy -w @gwenda/ops
# or CI via apps.yml
```

CI (`apps.yml`):

| Push to | Deploys to | Data and secrets |
|---|---|---|
| any other branch | `<branch>.gwenda-ops-dev.pages.dev` (branch preview) | dev copies, dev secrets; no migrations |
| `main` | [gwenda-ops-dev.pages.dev](https://gwenda-ops-dev.pages.dev) | dev copies, dev secrets |
| `release` + manual dispatch (target production) | [gwenda-ops.pages.dev](https://gwenda-ops.pages.dev) | production |

Branch previews never run on `gwenda-ops`: a branch is unreviewed code, and prod ops' secrets live on its **production** environment only (`scripts/setup-ops-secrets.mjs`). To clear prod secrets left on its preview environment: `npm run setup:ops -- --clear-preview`.

## Lightspeed item list

Ops matches a **Lightspeed formatted** CSV exported by hand from Back Office (`Menu` → `Item list` → `Export`) and uploaded at `/lightspeed`. Downloading it with a headless browser does not work: the Back Office login is behind Cloudflare Turnstile. That spike lives on the `archive/lightspeed-headless-export` branch. The durable route is the K-Series Items API.
