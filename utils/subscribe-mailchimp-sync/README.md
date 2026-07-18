# Subscribe Mailchimp sync

Hourly Cloudflare Worker that copies unsynced Baserow production signup rows into the Mailchimp audience, then marks each row `Synced: true`.

The website `/api/subscribe` path stays Baserow-only.

## Behaviour

1. List Baserow rows where `Synced` is false (production table `1017358`, up to 100 per run)
2. Upsert each email in Mailchimp (`PUT /lists/{id}/members/{md5}`), set merge field `SIGNEDUP` from Baserow `Signed up`, and apply Baserow `Tag` when present
3. `PATCH` Baserow `Synced: true` on success
4. Leave failed rows unsynced for the next run; stop early on rate limit
5. If Mailchimp already has the member as `unsubscribed` / `cleaned` / `archived`, do **not** force resubscribe; still mark Baserow synced

Audience merge field: **Signed up** (`SIGNEDUP`, date). Create once if missing (setup does this).

## Setup

```bash
# From repo root — needs CLOUDFLARE_API_TOKEN, BASEROW_API_KEY, MAILCHIMP_API_KEY in .env
npm run setup:subscribe-mailchimp-sync
```

Optional `.env`: `MAILCHIMP_AUDIENCE_ID` (defaults to `e2c69d5d31`).

Secrets on the Worker: `BASEROW_API_KEY`, `MAILCHIMP_API_KEY`, `SYNC_SECRET`.

## Local one-shot

```bash
npm run subscribe-mailchimp-sync -- --dry-run
npm run subscribe-mailchimp-sync -- --limit 50
# Backfill everyone already Synced in Baserow (e.g. after Buttondown):
npm run subscribe-mailchimp-sync -- --all
```

Uses production table `1017358` unless `SUBSCRIBE_MAILCHIMP_BASEROW_TABLE_ID` is set.

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
