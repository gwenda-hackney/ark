# Ark — Gwenda monorepo

Marketing site, brand guidelines, Sanity Studio, ops tools, and Cloudflare Workers for [gwenda.co.uk](https://gwenda.co.uk).

```
ark/
├── marketing/
│   ├── web/                      ← marketing site (Astro → Cloudflare Pages)
│   ├── brand/                    ← brand guidelines (→ brand.gwenda.co.uk)
│   ├── studio/                   ← Sanity CMS (guest-facing website content)
│   ├── site-deploy-webhook/      ← Studio → site rebuild Worker
│   ├── subscribe-mailchimp-sync/ ← Baserow → Mailchimp sync Worker
│   └── wifi-captive-portal/      ← UniFi captive portal Worker
├── ops/                          ← internal ops Pages app
├── docs/
├── scripts/
└── .github/
```

## Quick start

```bash
npm install
bw-unlock                 # the login; npm scripts then load secrets in memory (docs/env.md)
git config user.email you@gwenda.co.uk   # your local form emails go here too; no .env needed
npm run dev:refresh           # copy real data into your dev copies (Sanity + Baserow)
npm run web:dev               # website, dev copy → http://localhost:4321 (web:dev:live → :4322)
npm run ops:dev               # ops, dev copy → http://localhost:5174
npm run studio:dev            # Sanity Studio, dev copy → http://localhost:3333
```

Commands say which environment they touch: `dev` is your copy, `prod` is the real thing (`ops:prod` runs ops locally on real data). See [docs/sanity.md](docs/sanity.md#environments).

## Making a change

Work is tracked as [GitHub issues](https://github.com/gwenda-hackney/ark/issues), grouped into [milestones](https://github.com/gwenda-hackney/ark/milestones).

1. Branch from `main`: `feat/<issue>-<slug>` (or `fix/`, `chore/`, `refactor/`, `test/`). Pushing deploys branch previews on dev data: the website (`<branch>.gwenda-web-dev.pages.dev`) and, for ops changes, ops (`<branch>.gwenda-ops-dev.pages.dev`). The PR's **Previews** comment links to each one, updated on every push.
2. Open a pull request into `main` and fill in the template. [PR checks](.github/workflows/pr.yml) run lint and tests; merge when they're green, then delete the branch.
3. `main` deploys dev. Production goes `main` → `release` → promote, and only on purpose:
   - `npm run release:pr` opens (or updates) a PR from `main` into `release`, titled "Release: #a #b …" and listing the PRs going out (`-- --dry-run` only prints it).
   - The owner merges it. The push to `release` deploys production ops and prod's preview. `release` takes nothing but such PRs, merged with a merge commit once **Release checks** passes ([ruleset](.github/rulesets/release.json), applied with `npm run rulesets:apply`).
   - [Web promote](.github/workflows/web-promote.yml) then puts the website live.

   Each production release of the website or ops with code changes becomes a [GitHub Release](https://github.com/gwenda-hackney/ark/releases) that links its release PR and lists its PRs, so write PR titles for someone who runs Gwenda; the branch prefix picks the group (`feat/` New, `fix/` Fixes, others Behind the scenes; label `skip-changelog` to leave one out).

Before pushing: `npm run lint` and `npm test` (website), `npm test -w @gwenda/ops` (ops).

## Environments

There are two environments, built the same way. Each is a complete, separate copy: its own ops app, website, CMS (one Sanity dataset) and databases.

- **Prod** is the real thing. Guests see it.
- **Dev** is for testing. Nothing done there can reach gwenda.co.uk.

**Live and preview.** Each environment's website comes in two versions:

- **Live**: what visitors see.
- **Preview**: the same site showing changes saved in ops or Studio (Sanity drafts) but not yet published with **Update website**. Password-protected. Otherwise it is the live environment: forms on prod's preview are real submissions.

**Code** on `main` runs in dev. Code on `release` runs prod's preview, and goes live with Web promote. GitHub enforces this: its `production` environment accepts deploys from `release` only, `dev` from `main` only, and `preview` (branch previews) from any branch. **Data** only moves by copying: `npm run dev:refresh` copies prod into dev.

### Prod

**Websites**
- Live: [gwenda.co.uk](https://gwenda.co.uk)
- Preview: [preview.gwenda-blue.pages.dev](https://preview.gwenda-blue.pages.dev) (ribbon says "Preview"): the `release` code on drafts

**Ops:** [gwenda-ops.pages.dev](https://gwenda-ops.pages.dev)

**CMS:** Sanity project "Gwenda Web" (`pn5yjro6`), [manage](https://www.sanity.io/manage/project/pn5yjro6)
- Studio: [gwenda.sanity.studio](https://gwenda.sanity.studio). It saves drafts only; ops publishes.

**Databases:** Baserow workspace "Gwenda", [dashboard](https://baserow.io/dashboard): "Gwenda Ops" and "Website" (found by name; no ids are configured, see [docs/config.md](docs/config.md#baserow-no-ids))

**Other:** [brand.gwenda.co.uk](https://brand.gwenda.co.uk) (brand guidelines), [health.gwenda.co.uk](https://health.gwenda.co.uk) (site health)

**Automatic rollback:** every production deploy (website, ops, brand, and the ops secrets redeploy) records the live Cloudflare Pages deployment first. If any check after the deploy fails, the workflow puts that deployment back (with its own secrets) before the post migrations could run, and says so in the job summary (`scripts/pages-rollback.mjs`). To roll back by hand: Cloudflare dashboard → Pages → the project → Deployments → "Rollback to this deployment".

**Uptime, from outside Cloudflare:** [UptimeRobot](https://dashboard.uptimerobot.com) (free plan, login alerts@gwenda.co.uk) checks gwenda.co.uk, `/robots.txt`, `/health` (keyword `"service":"gwenda"`) and the ops sign-in page every 5 minutes, and emails **alerts@gwenda.co.uk**. alerts@ is a Google Group, so it must accept mail from outside the organisation. `npm run setup:uptime` creates any missing monitor and makes sure each alerts alerts@ (UptimeRobot v3 API; `-- --dry-run` only reports).

### Dev

**Websites**
- Live: [gwenda-web-dev.pages.dev](https://gwenda-web-dev.pages.dev) (ribbon says "Dev")
- Preview: [preview.gwenda-web-dev.pages.dev](https://preview.gwenda-web-dev.pages.dev) (ribbon says "Dev · preview")

**Ops:** [gwenda-ops-dev.pages.dev](https://gwenda-ops-dev.pages.dev) (Update website here only changes the dev websites)

**CMS:** Sanity project "Gwenda Dev" (`gwscpagy`), [manage](https://www.sanity.io/manage/project/gwscpagy). Studio: `npm run studio:dev`.

**Databases:** Baserow workspace "Gwenda Dev", [dashboard](https://baserow.io/dashboard): copies of "Gwenda Ops" and "Website"

### Dev on your machine

The same dev copies, run locally:

| Command | What | Address |
|---------|------|---------|
| `npm run web:dev` | Website, preview (ribbon says "Local") | http://localhost:4321 |
| `npm run web:dev:live` | Website, live (ribbon says "Local · live") | http://localhost:4322 |
| `npm run ops:dev` | Ops | http://localhost:5174 |
| `npm run studio:dev` | Studio | http://localhost:3333 |

`npm run ops:prod` is the exception: ops on your machine with **real prod data** (red banner).

### Dev container

Open the repo in VS Code and choose "Reopen in Container" ([.devcontainer/](.devcontainer/)): the toolchain, `bw` and the Claude Code extension come with it. Claude's chats, sign-in and settings are kept in a volume, so a rebuild doesn't lose them.

**Claude Remote Control.** The container shows up in [claude.ai/code](https://claude.ai/code) (and the phone app) as **ark**, so a session started there runs inside the container, beside the VS Code ones, with the same tools and secrets. It comes from your own dotfiles, not this repo: VS Code installs them into the container when its user settings have `"dotfiles.repository"` (and `"dotfiles.installCommand": "devcontainer.sh"`), and they bring the `claude-remote` command. Without those dotfiles there is no Remote Control and nothing else changes.

- **Check it:** `claude-remote status` (running, signed in, the name, the end of its log). Log: `~/.cache/claude-remote-control.log`.
- **Start or stop it:** `claude-remote`, `claude-remote stop`. It starts by itself with the container and with every new terminal, and restarts if it exits.
- **Once, in a terminal:** it asks you to sign the container in to Claude and to trust `/src` from the CLI (the VS Code extension's trust doesn't count). Say yes to both; for the trust question it opens `claude`, you accept, then type `/exit`.
- **After a rebuild:** nothing; the sign-in and the trust are in the volume. If `claude-remote status` says it is waiting, run `claude-remote` in a terminal and answer its question.

### Shared by both

- **Settings:** the "Gwenda Config" Baserow database, one per environment (Gwenda for production, Gwenda Dev for dev).
- **Secrets:** Bitwarden Secrets Manager. Dev (your machine and the dev sites) uses the `__DEV` versions.
- **Builds:** the deploy webhook Worker sends each ops app's builds to its own website.

More detail: [docs/sanity.md](docs/sanity.md#environments).

See **[docs/monorepo.md](docs/monorepo.md)** for workspaces, deploy triggers, and colour sync.

### Marketing — [`marketing/`](marketing/)

| Package | Role |
|---------|------|
| [`marketing/web/`](marketing/web/) | Guest site |
| [`marketing/studio/`](marketing/studio/) | Sanity Studio for website content |
| [`marketing/brand/`](marketing/brand/) | Brand guidelines site |
| Workers under `marketing/` | Deploy webhook, Mailchimp sync, Wi‑Fi portal |

### Ops — [`ops/`](ops/)

Internal tools and ops-facing Workers. Guest menu marketing content is published from ops into Sanity; ops data does not live in the CMS.

→ **[ops/README.md](ops/README.md)**

### Docs — [`docs/`](docs/)

Environment, Sanity, colours, Instagram invites, and more.
