# Gwenda outbound email

All Gwenda email (RSVP confirmations, form mail, ops and site-health alerts) goes out through the **Gmail API over HTTPS** as one Google Workspace mailbox. There is no SMTP: Cloudflare Workers and Pages Functions can't hold SMTP connections reliably.

**Code:** `shared/gmail-send.js` (sending) · `shared/mail-from.js` (addresses, constants) · Sanity `form` From / Reply-To

---

## How it works

| Piece | Value | Where |
|-------|-------|-------|
| Sending mailbox | `notifications@gwenda.co.uk` | `MAIL_SENDER` in `shared/mail-from.js` |
| Credential | Google service account with domain-wide delegation for `gmail.send` | Secrets Manager `GOOGLE_SERVICE_ACCOUNT_JSON` (Ark/Ops); apps read it as `GMAIL_SERVICE_ACCOUNT_JSON` |
| RSVP From | `Gwenda Events <events@gwenda.co.uk>` (no-reply) | `EVENTS_FROM` in `shared/mail-from.js` |
| Staff notifications, alerts From | `Gwenda <notifications@gwenda.co.uk>` | `NOTIFICATIONS_FROM` |
| Form From / Reply-To / notify | e.g. `play@gwenda.co.uk` | Sanity form document (falls back to the events address) |
| Alert recipient | `alerts@gwenda.co.uk` | Wrangler `ALERT_EMAIL` |

The service account impersonates `notifications@` and sends as it, or as an alias or group that mailbox may send as. The addresses are the same in every environment, so they are code constants, not config.

You pay for **one** Workspace user (`notifications@`). Aliases and groups do not add seats.

**Outside production nothing reaches a real inbox.** `sendGmail` is the only way to send, and on dev or a developer's machine it replaces To, Cc and Bcc with the safe address: the `forms.notify_email` setting, which is `alerts@` on hosted dev and `FORMS_NOTIFY_EMAIL` (your git email) locally. The subject starts `[dev, for guest@example.com]` and the header `X-Gwenda-Original-To` names the real recipient. With no safe address it doesn't send at all. Copied data is full of real guests' addresses, so callers can't opt out.

Event confirmations include on-brand HTML with the logo, a calendar ticket (`.ics`) and, when Apple certificates are configured, an Apple Wallet pass (`.pkpass`). RSVP email copy is edited in **Sanity** on each event.

---

## A. Google Workspace (one-time)

- [ ] **One user**: `notifications@gwenda.co.uk`
- [ ] **Alias** on that user (Admin → Directory → Users → notifications@ → User information → Email aliases): `events@gwenda.co.uk`
- [ ] **Google Group** `play@gwenda.co.uk` for form mail: members who should receive submissions; allow `notifications@` to send as the group.
- [ ] **Google Group** `alerts@gwenda.co.uk` for ops alerts: members who should get site health and form infrastructure mail. Only the organisation (or `notifications@` as a member) may post, never the public internet.
- [ ] **Service account** in Google Cloud, with its JSON key stored in Secrets Manager as `GOOGLE_SERVICE_ACCOUNT_JSON`.
- [ ] **Domain-wide delegation** in Admin → Security → Access and data control → API controls → Domain-wide delegation: add the service account's client ID with the scope `https://www.googleapis.com/auth/gmail.send`.

---

## B. Where it is configured

| Value | Where |
|-------|-------|
| Service account JSON | Secrets Manager `GOOGLE_SERVICE_ACCOUNT_JSON`; Pages secrets via `web-secrets.yml` / `ops-secrets.yml`; the `site-health` Worker secret via `workers.yml` |
| Sender and From addresses | `shared/mail-from.js` |
| Form From / Reply-To / notify | Sanity form fields |
| Alert recipient | Wrangler `ALERT_EMAIL` |

After rotating the service account key:

```bash
GOOGLE_SERVICE_ACCOUNT_JSON="$(cat key.json)" npm run env:ops:push -- GOOGLE_SERVICE_ACCOUNT_JSON
gh workflow run web-secrets.yml -f profile=production
gh workflow run web-secrets.yml -f profile=dev
gh workflow run ops-secrets.yml
gh workflow run workers.yml -f worker=site-health
```

Pages snapshots secrets per deployment, so redeploy the sites afterwards.

---

## C. Test

Every website deploy runs a smoke check that logs in to Gmail (`checkEmail` in `marketing/web/functions/_lib/deep-health.js`). `GET https://health.gwenda.co.uk/health` reports `emailConfigured` for site-health.

By hand, locally:

- [ ] Open a valid invite: `/events/<slug>?event-password=<three-word-password>`
- [ ] RSVP **Yes** with your email, then check the inbox (and spam) for From **Gwenda Events** / `events@gwenda.co.uk`, the logo, and `gwenda-ticket.ics`
- [ ] Submit `/contact/play`: From / Reply-To show `play@gwenda.co.uk`, and the notification arrives at `FORMS_NOTIFY_EMAIL` from your `.env`

The RSVP is saved even if email fails (best-effort). Check the terminal for `RSVP confirmation email failed` if nothing arrives.

---

## D. Deliverability

- [ ] **DKIM** for `gwenda.co.uk`: Google Admin → Apps → Google Workspace → Gmail → Authenticate email, then add the DNS records Google gives you.
- [ ] **SPF** includes Google: `v=spf1 include:_spf.google.com ~all`

---

## E. Troubleshooting

| Problem | Check |
|---------|-------|
| No email at all | `GMAIL_SERVICE_ACCOUNT_JSON` present? Locally: `npm run env:status`. Hosted: secrets synced and the site redeployed? |
| `Gmail token failed (401/403)` | Domain-wide delegation missing, or the scope isn't exactly `gmail.send`. |
| “Sender address rejected” / wrong From | `events@` must be an Admin alias of `notifications@`; `play@` must let `notifications@` send as the group. |

---

## F. Optional: Apple Wallet (`.pkpass`)

Calendar `.ics` works without extra setup. For Apple Wallet attachments:

```bash
npm run setup:apple-wallet:csr
```

Upload `.apple-wallet/signing.csr` when Apple asks for a CSR (no Mac required). After Apple issues the certificate:

```bash
export APPLE_WALLET_PASS_TYPE_ID=pass.co.uk.gwenda.event
export APPLE_WALLET_TEAM_ID=XXXXXXXXXX
npm run setup:apple-wallet:import -- ~/Downloads/pass.cer
```

Restart `npm run web:dev`; RSVP Yes then attaches `gwenda-ticket.pkpass` too. For the hosted sites, sync secrets with `gh workflow run web-secrets.yml -f profile=production`. Requires an Apple Developer Pass Type ID and signing certificate.
