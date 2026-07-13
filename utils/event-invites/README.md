# Private event invites

End-to-end flow for private events:

1. **ClickUp** — guest list (Name, Username/Email, Channel)
2. **Sync** — guests upserted to Baserow for RSVP tokens
3. **Sanity** — event copy + hero image on invite page and in email/DM
4. **Send** — email (SMTP) or Instagram DM with personal link
5. **RSVP** — guest opens `/invite/{token}` and confirms headcount

## ClickUp list model

| Field | ClickUp source | Values |
|-------|----------------|--------|
| **Name** | Task title | Guest name |
| **Username/Email** | Custom field | Email address or Instagram handle |
| **Channel** | Custom field | `Email` or `Instagram` |

Env: `CLICKUP_INVITE_LIST_ID`, `CLICKUP_API_KEY` (repo-root `.env`).

Override field names with `CLICKUP_INVITE_CONTACT_FIELD` and `CLICKUP_INVITE_CHANNEL_FIELD`.

## Baserow

Runtime RSVP storage — table **Event Invites** (see main README section). ClickUp sync creates/updates rows filtered by **Event Slug**.

## Commands

```bash
# Staging E2E (ClickUp → Baserow → preview send)
npm run event-invites -- \
  --event-slug private-launch-party \
  --source clickup \
  --invite-base-url https://gwenda-staging.pages.dev \
  --dry-run

# Live send (needs SMTP_* and/or Instagram tokens in .env)
npm run event-invites -- \
  --event-slug private-launch-party \
  --source clickup \
  --invite-base-url https://gwenda-staging.pages.dev \
  --send
```

`--source baserow` skips ClickUp and reads guests already in Baserow.

Hero image comes from the Sanity **event** document (`heroImage`); falls back to `INVITE_IMAGE_URL`.

## Staging Sanity

The development dataset is private. Staging Pages needs `SANITY_API_TOKEN` (Viewer) synced as a Cloudflare secret — handled by deploy workflows.

## Website

- `/invite/{token}` — RSVP page (event hero from Sanity when token is set)
- `GET/POST /api/rsvp` — guest lookup + save
- `/api/event-admin/*` — Studio admin API
