# Subscribe Mailchimp sync

Hourly Cloudflare Worker that copies unsynced Baserow production signup rows into the Mailchimp audience, then marks each row `Synced: true`.

Failures go to Sentry (project `mailchimp-sync`, #35), which emails alerts@ when one is new or comes back.

The website `/api/subscribe` path stays Baserow-only.

## Behaviour

1. List Baserow rows where `Synced` is false (production `Subscribers` table, up to 100 per run)
2. Upsert each email in Mailchimp (`PUT /lists/{id}/members/{md5}`), set merge field `SIGNEDUP` from Baserow `Signed up`, and apply Baserow `Tag` when present
3. `PATCH` Baserow `Synced: true` on success
4. Leave failed rows unsynced for the next run; stop early on rate limit
5. If Mailchimp already has the member as `unsubscribed` / `cleaned` / `archived`, do **not** force resubscribe; still mark Baserow synced
6. If Mailchimp rejects the address for good (400 "Invalid Resource", e.g. it looks fake), mark Baserow synced so it isn't retried every hour, and send a Sentry warning (no alert email)

Audience merge field: **Signed up** (`SIGNEDUP`, date). Create once if missing (setup does this).

## Setup (Worker secrets / first deploy)

```bash
# From repo root, after bw-unlock. Reads CLOUDFLARE_API_TOKEN, the production Website token,
# MAILCHIMP_API_KEY__PRODUCTION and SUBSCRIBE_MAILCHIMP_SYNC_SECRET__PRODUCTION (Ark/Web) from Secrets Manager.
npm run setup:subscribe-mailchimp-sync
```

Optional in the shell: `MAILCHIMP_AUDIENCE_ID` (defaults to `e2c69d5d31`). CI (`workers.yml`) redeploys the Worker with the same Secrets Manager keys.

Secrets on the Worker: `BASEROW_API_KEY`, `MAILCHIMP_API_KEY`, `SYNC_SECRET`.

## Local one-shot

```bash
npm run subscribe-mailchimp-sync -- --dry-run
npm run subscribe-mailchimp-sync -- --limit 50
# Backfill everyone already Synced in Baserow (e.g. after Buttondown):
npm run subscribe-mailchimp-sync -- --all
```

Resolves the production `Subscribers` table by name (token scoped to Gwenda / Website). Optional `BASEROW_DATABASE_ID` / `BASEROW_SUBSCRIBE_TABLE_NAME` only if the token can see more than one match.

## Manual trigger

```bash
curl -X POST "https://gwenda-subscribe-mailchimp-sync.<account>.workers.dev/" \
  -H "Authorization: Bearer $SUBSCRIBE_MAILCHIMP_SYNC_SECRET"
```

Optional: `?dryRun=true&limit=20`

## Develop

```bash
npm test -w @gwenda/subscribe-mailchimp-sync
npm run typecheck -w @gwenda/subscribe-mailchimp-sync
npm run deploy -w @gwenda/subscribe-mailchimp-sync
```
