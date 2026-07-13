# Private event invites

Send **private event invitations** from a **Baserow guest list**. Each guest gets a personal link:

`https://gwenda.co.uk/invite/{token}`

The website greets them by name, loads event copy from Sanity at runtime, and collects RSVP headcount.

## Architecture

| Store | Role |
|-------|------|
| **Sanity** | Event title, description, date, hero — public + invite pages |
| **Baserow** | Guest list, tokens, RSVP counts |
| **Studio → Event invites** | Headcount dashboard + send (via site admin API) |

## Baserow

Local dev and **gwenda-staging** share one Baserow database (`465058`). The **Event Invites** table is found by name at runtime — no table id in `.env`.

| Table | Lookup |
|-------|--------|
| Subscribe | `BASEROW_TABLE_ID` (or dev/staging default `1024006`) |
| Event invites | table name `Event Invites` (override with `BASEROW_RSVP_TABLE_NAME`) |

Create the RSVP table once for dev/staging (`npm run setup:baserow-rsvp`), then duplicate to production when you promote. The database token must have CRUD access on **Event Invites**.

RSVP table columns (one table for all events; filter by **Event Slug**):

| Field | Set by |
|-------|--------|
| Event Slug | Ops |
| Name | Ops |
| Channel | Ops (`Email` or `Instagram`) |
| Contact | Ops |
| Token | Send flow |
| RSVP Guests | Guest via website |
| RSVP Updated | Guest via website |

## Setup

```bash
npm install
npm run setup:baserow-rsvp   # creates Event Invites table (JWT auth — see below)
npm run setup:event-admin    # generates EVENT_ADMIN_SECRET
```

### Baserow table (JWT vs database token)

Baserow has two token types:

| Token | How to get it | Can do |
|-------|---------------|--------|
| **Database token** | Settings → Database tokens | Row CRUD only (`BASEROW_API_KEY`) |
| **JWT** | Your Baserow login via `POST /api/user/token-auth/` | Create tables/fields (schema) |

`npm run setup:baserow-rsvp` prompts for your Baserow email and password (not saved), obtains a short-lived JWT, creates the **Event Invites** table in the dev/staging database, and adds fields.

After that, create a **database token** with create/read/update/delete on that table and set `BASEROW_API_KEY` for the site and CLI.

Copy invite vars into repo-root `.env` (see `.env.example`).

Local Studio reads the same file via `with-env`:

```
EVENT_ADMIN_URL=http://localhost:4321
EVENT_ADMIN_SECRET=<from npm run setup:event-admin>
BASEROW_RSVP_GRID_URL=https://baserow.io/.../table/...
```

## Workflow

1. **Create event** in Sanity Studio (Events).
2. **Add guests** in Baserow grid filtered to `Event Slug = your-slug`.
3. **Event invites** tool in Studio — headcount, dry run, send.
4. Guests RSVP at `/invite/{token}`; counts update in Baserow + Studio.

## CLI

```bash
npm run event-invites -- --dry-run --event-slug private-launch-party
npm run event-invites -- --send --event-slug private-launch-party
npm run event-invites -- --export-manual-instagram guests.csv
```

## Website

- `/events` — live event list from Sanity (`GET /api/events`)
- `/invite/{token}` — RSVP page
- `GET/POST /api/rsvp` — guest lookup + save
- `/api/event-admin/*` — Studio admin API (Bearer `EVENT_ADMIN_SECRET`)

## Development

```bash
npm test -w @gwenda/event-invites
npm test -w @gwenda/web -- functions/_lib/event-guests.test.js
```
