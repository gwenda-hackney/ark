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

### Connect Instagram (OAuth)

Same mechanism as Canva: **you authorize our Meta app**, we store the token.

**Checklist:** [`docs/instagram-invites-setup.md`](../../docs/instagram-invites-setup.md)

1. **Meta app** — [developers.facebook.com](https://developers.facebook.com/) → Create app → add **Facebook Login** + **Instagram**.
2. **OAuth redirect** — in the app, add valid redirect URI: `http://localhost:8765/callback`
3. **App credentials** — add to repo-root `.env`:
   ```
   META_APP_ID=...
   META_APP_SECRET=...
   ```
4. **Connect** — run:
   ```bash
   npm run setup:instagram
   ```
   Opens Meta login (like Canva’s “Connect Instagram”), then writes `INSTAGRAM_ACCESS_TOKEN` and `INSTAGRAM_BUSINESS_ACCOUNT_ID` to `.env`.

Manual alternative (Graph API Explorer) is still documented below if you prefer.

<details>
<summary>Manual token setup (Graph API Explorer)</summary>

1. **Instagram** — @gwendahackney must be a **Professional** account linked to a Facebook Page.
2. **Permissions** — `instagram_basic`, `instagram_manage_messages`, `pages_show_list`, `pages_read_engagement`.
3. **Access token** — generate long-lived Page token in Graph API Explorer.
4. **Instagram account ID**:

```bash
curl "https://graph.facebook.com/v21.0/me/accounts?access_token=TOKEN"
curl "https://graph.facebook.com/v21.0/PAGE_ID?fields=instagram_business_account&access_token=TOKEN"
```

</details>

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
