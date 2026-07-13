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

## Instagram DMs (@gwendahackney)

Instagram invites use the **Meta Instagram Messaging API**. DMs are sent **from your connected Instagram professional account** — in production that is [@gwendahackney](https://www.instagram.com/gwendahackney).

### What you need

| Env var | What it is |
|---------|------------|
| `INSTAGRAM_ACCESS_TOKEN` | Long-lived token with `instagram_manage_messages` (and related Page permissions) |
| `INSTAGRAM_BUSINESS_ACCOUNT_ID` | Instagram professional account ID (numeric — **not** the @handle) |

Add both to repo-root `.env` for local sends. For staging/production site sends, also set them as GitHub secrets and re-deploy (or run `npm run setup:event-ops`).

### One-time Meta setup

1. **Instagram** — @gwendahackney must be a **Professional** account (Business or Creator).
2. **Facebook Page** — connect the Instagram account to a Facebook Page (Meta Business Suite).
3. **Meta app** — [developers.facebook.com](https://developers.facebook.com/) → Create app → add **Instagram** product.
4. **Permissions** — request / grant at minimum:
   - `instagram_basic`
   - `instagram_manage_messages`
   - `pages_show_list`, `pages_read_engagement` (to reach the linked Page)
5. **Access token** — Graph API Explorer or Business Suite:
   - Select your app + Page
   - Generate a token with the permissions above
   - Prefer a **long-lived** Page token (60 days; refresh via Meta)
6. **Instagram account ID** — with a valid token:

```bash
# Replace TOKEN with your Page/user token
curl "https://graph.facebook.com/v21.0/me/accounts?access_token=TOKEN"
# Then for your Page id:
curl "https://graph.facebook.com/v21.0/PAGE_ID?fields=instagram_business_account&access_token=TOKEN"
# instagram_business_account.id → INSTAGRAM_BUSINESS_ACCOUNT_ID
```

### Important limitation

Meta only lets you DM users who have **already messaged** @gwendahackney (an open conversation). The CLI indexes your inbox to match handles. If you have not DM'd the account before, message @gwendahackney once from your personal Instagram first, then re-run send.

### Send Instagram test

```bash
npm run event-invites -- \
  --event-slug private-launch-party \
  --source clickup \
  --invite-base-url https://gwenda-staging.pages.dev \
  --send
```

Dry run first to confirm ClickUp → Baserow sync and handle match:

```bash
npm run event-invites -- --event-slug private-launch-party --source clickup --dry-run
```


The development dataset is private. Staging Pages needs `SANITY_API_TOKEN` (Viewer) synced as a Cloudflare secret — handled by deploy workflows.

## Website

- `/invite/{token}` — RSVP page (event hero from Sanity when token is set)
- `GET/POST /api/rsvp` — guest lookup + save
- `/api/event-admin/*` — Studio admin API
