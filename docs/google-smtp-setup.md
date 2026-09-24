# Gwenda outbound email — Google SMTP setup

Use this when wiring **RSVP confirmation emails** and **form mail** through **one Google Workspace account**.

Check boxes in your editor (`- [ ]` → `- [x]`), or print this page.

**Related:** repo-root `.env` · `web/functions/_lib/smtp-from.js` · Sanity `form` From / Reply-To

---

## Recommended account name

Use **one paid Workspace user** as the SMTP login (`SMTP_USER`). Add **free aliases** or a **Google Group** for each public “From” address.

### Primary login: `notifications@gwenda.co.uk`

| Role | Address |
|------|---------|
| **SMTP login** (`SMTP_USER`) | `notifications@gwenda.co.uk` (wrangler `[vars]`, not a secret) |
| **App Password** (`SMTP_PASSWORD`) | Created on this account (2FA required). **Only this value is a secret.** |
| **RSVP From** (guests see) | `events@gwenda.co.uk` (alias on this user) |
| **Form From / Reply-To / notify** | `play@gwenda.co.uk` (Google Group; set on each Sanity form) |
| **Ops alerts** (`ALERT_EMAIL`) | `alerts@gwenda.co.uk` (Google Group; health + form infrastructure) |

**Aliases / group:**

| Address | Used for |
|---------|----------|
| `events@gwenda.co.uk` | RSVP confirmations (no-reply). Wrangler `SMTP_FROM_EVENTS` or code default. |
| `play@gwenda.co.uk` | Play / collaborate forms. Sanity `notifyEmail`, `fromEmail`, `replyToEmail`. |
| `alerts@gwenda.co.uk` | Site health and form infrastructure alerts. Wrangler `ALERT_EMAIL`. |

You pay for **one** user (`notifications@`). Aliases and groups do not add seats.

`SMTP_USER` is always the **primary mailbox** you sign into. Form From addresses come from Sanity, not Secrets Manager.

### Alternatives


| Login                        | When to use                                                    |
| ---------------------------- | -------------------------------------------------------------- |
| `notifications@gwenda.co.uk` | If the mailbox is only for automated outbound mail             |
| `admin@gwenda.co.uk`         | Solo operator and you already think of it as “the admin login” |


Avoid using `events@` or `hello@` as the **primary login** if those are public-facing. Keep login (`SMTP_USER`) separate from what guests see.

---

## How the site uses SMTP


| Use case                | From address                                     | Config |
| ----------------------- | ------------------------------------------------ | ------ |
| RSVP “yes” confirmation | `Gwenda Events <events@gwenda.co.uk>` (no-reply) | Wrangler `SMTP_FROM_EVENTS` |
| Form notify + verify    | Sanity `fromEmail` / `replyToEmail` (e.g. `play@`) | Sanity form document |
| Manual invite pipeline  | Optional `SMTP_FROM` in local `.env`             | Local / invite CLI only |


All mail authenticates with the **same** `SMTP_USER` + App Password.

Event confirmations include:

- On-brand HTML with logo
- Calendar ticket (`.ics`)
- Apple Wallet pass (`.pkpass`) when Apple certificates are configured

Copy for RSVP emails is edited in **Sanity** on each event (`RSVP confirmation email`).

---

## A. Google Workspace (one-time)

- [ ] **One user created**, e.g. `notifications@gwenda.co.uk`

- [ ] **Aliases added** on that user in Admin (for RSVP From):
  ```
  Admin → Directory → Users → notifications@ → User information → Email aliases → Add
  ```
  Add at least:
  - `events@gwenda.co.uk`

- [ ] **Google Group** `play@gwenda.co.uk` for form mail:
  - Members who should receive submissions
  - Allow `notifications@` to **send as** the group (Group settings → Posting / Sending)

- [ ] **Google Group** `alerts@gwenda.co.uk` for ops alerts:
  - Members who should receive site health and form infrastructure mail
  - Who can post: anyone in the organisation, or add `notifications@` as a posting member
  - Do **not** allow posting from the public internet. Mail comes from `notifications@`, not as the group

- [ ] **Skip “Send mail as” in Gmail** unless SMTP fails (see troubleshooting). That Gmail screen is for adding *other* accounts or addresses that are not already aliases on the user. If `events@` is an Admin alias on `notifications@`, you are done after adding it in Admin.

- [ ] **2-Step Verification** enabled on `notifications@`:
  ```
  https://myaccount.google.com/security
  ```

- [ ] **App Password** created:
  1. Security → **2-Step Verification** → **App passwords**
  2. Name: `Gwenda SMTP`
  3. Copy the 16-character password (shown once)

Do **not** put your normal Google password in `.env`. Use the App Password only.

---

## B. Secrets vs config

| Value | Where |
|-------|--------|
| `SMTP_PASSWORD` | Secrets Manager → `.env.secrets` / Pages secret (`npm run env:web:push`) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` | Wrangler `[vars]` (and local `.env` for overrides) |
| Form From / Reply-To / notify | Sanity form fields (`play@gwenda.co.uk`) |
| Ops alerts | Wrangler `ALERT_EMAIL` (`alerts@gwenda.co.uk`) |
| RSVP From | Wrangler `SMTP_FROM_EVENTS` |

In Secrets Manager (pulled to `.env.secrets`), only the password needs to be filled for Secrets Manager:

```bash
SMTP_PASSWORD=your-16-char-app-password
```

Local SMTP user (if not relying on wrangler vars during `npm run dev`):

```bash
SMTP_USER=notifications@gwenda.co.uk
```

Restart the dev server after saving:

```bash
npm run dev
```

Push the password only:

```bash
npm run env:web:push
```

---

## C. Test locally

- [ ] Open a valid invite: `/events/<slug>?event-password=<three-word-password>`
- [ ] RSVP **Yes**, enter name + email + party size
- [ ] Click **Send my reply**
- [ ] Check inbox (and spam) for:
  - From: **Gwenda Events** / `events@gwenda.co.uk`
  - Logo + confirmation copy
  - Attachment: `gwenda-ticket.ics`

- [ ] Submit `/contact/play` and confirm From / Reply-To show `play@gwenda.co.uk`

The RSVP is saved even if email fails (best-effort). Check the terminal for `RSVP confirmation email failed` if nothing arrives.

---

## D. Staging and production

Secrets are synced to Cloudflare Pages via `web/scripts/ci/sync-pages-secrets.mjs` (only `SMTP_PASSWORD` among SMTP keys).

```bash
npm run env:web:push
gh workflow run web-secrets.yml -f profile=staging
gh workflow run web-secrets.yml -f profile=production
```

Redeploy staging or production so Pages Functions pick up the new secret. Wrangler `[vars]` (host/user) update on deploy.

---

## E. Deliverability (recommended)

So confirmations do not land in spam:

- [ ] **DKIM** enabled for `gwenda.co.uk` in Google Admin → Apps → Google Workspace → Gmail → Authenticate email. Add the DNS records Google provides.

- [ ] **SPF** includes Google, e.g.:
  ```
  v=spf1 include:_spf.google.com ~all
  ```

---

## F. Troubleshooting


| Problem                       | Check                                                                                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No email at all               | `SMTP_PASSWORD` set? `SMTP_USER` in wrangler / local env? Dev server restarted?                                                                                          |
| “Invalid login”               | App Password (not normal password). 2FA on `SMTP_USER`.                                                                                                                   |
| “Sender address rejected”     | Confirm `events@` is an **Admin alias**, or `play@` group allows send-as from `notifications@`.                                                                         |
| App Passwords missing         | 2FA not enabled, or admin disabled App Passwords for the org.                                                                                                             |
| Works locally, not on staging | SM + `web-secrets` workflow + redeploy.                                                                                                                                   |


### App Passwords disabled by admin?

Use **Google SMTP relay** (`smtp-relay.gmail.com`, port 587) with IP allowlisting in Admin. Same env vars except `SMTP_HOST`. Ask if you need relay-specific steps.

---

## G. Optional: Apple Wallet (`.pkpass`)

Calendar `.ics` works without extra setup. For Apple Wallet attachments:

```bash
npm run setup:apple-wallet:csr
```

Upload `.apple-wallet/signing.csr` when Apple asks for a CSR (no Mac required).

After Apple issues the certificate:

```bash
export APPLE_WALLET_PASS_TYPE_ID=pass.co.uk.gwenda.event
export APPLE_WALLET_TEAM_ID=XXXXXXXXXX
npm run setup:apple-wallet:import -- ~/Downloads/pass.cer
```

Restart `npm run dev`. RSVP Yes should attach `gwenda-ticket.pkpass` alongside the calendar file.

For staging/production, sync secrets after `.env` is populated:

```bash
node web/scripts/ci/sync-pages-secrets.mjs --project gwenda-staging --profile staging
```

Requires an Apple Developer Pass Type ID and signing certificate.

---

## Quick reference

```
Login (SMTP_USER):     notifications@gwenda.co.uk   (wrangler vars)
Secret:                SMTP_PASSWORD only           (Secrets Manager)
RSVP From:             Gwenda Events <events@gwenda.co.uk>
Form From / Reply-To:  play@gwenda.co.uk            (Sanity form)
Form notify:           play@gwenda.co.uk            (Sanity form)
Ops alerts:            alerts@gwenda.co.uk           (wrangler ALERT_EMAIL)
SMTP host:             smtp.gmail.com
SMTP port:             587
```
