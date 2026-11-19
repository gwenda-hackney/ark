# Subscribe Mailchimp sync

Hourly Cloudflare Worker that copies unsynced production subscribers into the Mailchimp audience, then marks each one synced. It reads them through the guests repository (`shared/guests`), in the website D1 database (#127).

Failures go to Sentry (project `mailchimp-sync`, #35), which emails alerts@ when one is new or comes back.

## Behaviour

1. Bring unsubscribes back: read the audience's `unsubscribed` members changed since the latest
   `marketing_off_on` we have (every one, the first time; paged, 1000 a page), and take those
   subscribers off our list (`marketing` 0, `marketing_off_on` the day they left). Only synced
   ones: an unsynced one has signed up again since. A dry run skips this
2. List unsynced subscribers on the mailing list (`marketing` 1; up to 100 per run). Wi‑Fi
   guests who didn't tick the box (`marketing` 0) are never listed, so never sent
3. Upsert each email in Mailchimp (`PUT /lists/{id}/members/{md5}`), set merge field `SIGNEDUP` from its sign-up date, and apply its tags when present:
   - new or `subscribed`: `subscribed`
   - `unsubscribed` (they signed up again): `pending`, so Mailchimp emails them a link to
     confirm; Mailchimp won't subscribe them directly
   - `pending`: left pending until they confirm
   - `cleaned` (bounced) or `archived`: never re-added; marked synced, with the reason in the run's results
4. Mark it synced on success
5. Leave failed rows unsynced for the next run; stop early on rate limit
6. If Mailchimp rejects the address for good (400 "Invalid Resource", e.g. it looks fake; "Member In Compliance State"; "Forgotten Email Not Subscribed"), mark it synced so it isn't retried every hour, and send a Sentry warning (no alert email)

Audience merge field: **Signed up** (`SIGNEDUP`, date). Create once if missing (setup does this).

## Setup (Worker secrets / first deploy)

```bash
# From repo root, after bw-unlock. Reads CLOUDFLARE_API_TOKEN,
# MAILCHIMP_API_KEY__PRODUCTION and SUBSCRIBE_MAILCHIMP_SYNC_SECRET__PRODUCTION (Ark/Web) from Secrets Manager.
npm run setup:subscribe-mailchimp-sync
```

Optional in the shell: `MAILCHIMP_AUDIENCE_ID` (defaults to `e2c69d5d31`). CI (`workers.yml`) redeploys the Worker with the same Secrets Manager keys.

Secrets on the Worker: `MAILCHIMP_API_KEY`, `SYNC_SECRET`. Subscribers come through the `WEBSITE_DB` binding.

## Local one-shot

```bash
npm run subscribe-mailchimp-sync -- --dry-run
npm run subscribe-mailchimp-sync -- --limit 50
# Backfill everyone already synced (e.g. after Buttondown):
npm run subscribe-mailchimp-sync -- --all
```

Reads the production website D1 database over the API, with production's Cloudflare token.

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
