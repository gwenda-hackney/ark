# Gwenda outbound email — Google SMTP setup

Use this when wiring **RSVP confirmation emails** (and other site mail) through **one Google Workspace account**.

Check boxes in your editor (`- [ ]` → `- [x]`), or print this page.

**Related:** repo-root `.env` · `web/functions/_lib/smtp-from.js` · `npm run setup:event-ops`

---

## Recommended account name

Use **one paid Workspace user** as the SMTP login (`SMTP_USER`). Add **free aliases** for each public “From” address (`events@`, `hello@`, etc.).

### Primary login: `notifications@gwenda.co.uk`

| Role | Address |
|------|---------|
| **SMTP login** (`SMTP_USER`) | `notifications@gwenda.co.uk` |
| **App Password** | Created on this account (2FA required) |
| **RSVP From** (guests see) | `events@gwenda.co.uk` (alias on this user) |

**Aliases on the same user** (Admin → Directory → Users → notifications@ → Email aliases):

| Alias | Used for |
|-------|----------|
| `events@gwenda.co.uk` | RSVP confirmations (no-reply). Set via `SMTP_FROM_EVENTS` or code default. |
| `hello@gwenda.co.uk` | Optional. General mail (`SMTP_FROM`) if needed |

You pay for **one** user (`notifications@`). Aliases do not add seats.

`SMTP_USER` is always the **primary mailbox** you sign into. `SMTP_FROM_EVENTS` is the **alias** shown to guests. They are not the same variable even when both sit on one Google account.

### Alternatives


| Login                        | When to use                                                    |
| ---------------------------- | -------------------------------------------------------------- |
| `notifications@gwenda.co.uk` | If the mailbox is only for automated outbound mail             |
| `admin@gwenda.co.uk`         | Solo operator and you already think of it as “the admin login” |


Avoid using `events@` or `hello@` as the **primary login** if those are public-facing. Keep login (`SMTP_USER`) separate from what guests see (`SMTP_FROM_EVENTS`).

---

## How the site uses SMTP


| Use case                | From address                                     | Env var                                |
| ----------------------- | ------------------------------------------------ | -------------------------------------- |
| RSVP “yes” confirmation | `Gwenda Events <events@gwenda.co.uk>` (no-reply) | `SMTP_FROM_EVENTS` (optional override) |
| Manual invite pipeline  | Your choice, e.g. `Gwenda <hello@gwenda.co.uk>`  | `SMTP_FROM`                            |


All mail authenticates with the **same** `SMTP_USER` + App Password.

Event confirmations include:

- On-brand HTML with logo
- Calendar ticket (`.ics`)
- Apple Wallet pass (`.pkpass`) when Apple certificates are configured

Copy for RSVP emails is edited in **Sanity** on each event (`RSVP confirmation email`).

---

## A. Google Workspace (one-time)

- [ ] **One user created**, e.g. `notifications@gwenda.co.uk`

- [ ] **Aliases added** on that user in Admin (this is the important step):
  ```
  Admin → Directory → Users → notifications@ → User information → Email aliases → Add
  ```
  Add at least:
  - `events@gwenda.co.uk`
  - `hello@gwenda.co.uk` (optional)
  Aliases on the **same user** can be used as the SMTP `From` address automatically. You do **not** need to repeat this in Gmail settings.

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

## B. Local `.env`

In repo-root `.env`, uncomment and set:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=notifications@gwenda.co.uk
SMTP_PASSWORD=your-16-char-app-password
SMTP_FROM_EVENTS=Gwenda Events <events@gwenda.co.uk>
```


| Variable           | Meaning                                                              |
| ------------------ | -------------------------------------------------------------------- |
| `SMTP_USER`        | Workspace login that owns the App Password                           |
| `SMTP_PASSWORD`    | App Password (not your normal password)                              |
| `SMTP_FROM_EVENTS` | What guests see on RSVP confirmations. No-reply: no Reply-To header. |
| `SMTP_FROM`        | Optional. Other outbound mail (e.g. invite CLI).                     |


Restart the dev server after saving:

```bash
npm run dev
```

---

## C. Test locally

- [ ] Open a valid invite: `/events/<slug>?key=<code>`
- [ ] RSVP **Yes**, enter name + email + party size
- [ ] Click **Send my reply**
- [ ] Check inbox (and spam) for:
  - From: **Gwenda Events** / `events@gwenda.co.uk`
  - Logo + confirmation copy
  - Attachment: `gwenda-ticket.ics`

The RSVP is saved even if email fails (best-effort). Check the terminal for `RSVP confirmation email failed` if nothing arrives.

---

## D. Staging and production

Secrets are synced to Cloudflare Pages on deploy via `web/scripts/ci/sync-pages-secrets.mjs`.

Set GitHub secrets (from repo root, with `gh` authenticated):

```bash
gh secret set SMTP_HOST --body "smtp.gmail.com"
gh secret set SMTP_PORT --body "587"
gh secret set SMTP_USER --body "notifications@gwenda.co.uk"
gh secret set SMTP_PASSWORD --body "your-16-char-app-password"
gh secret set SMTP_FROM_EVENTS --body "Gwenda Events <events@gwenda.co.uk>"
gh secret set SMTP_FROM --body "Gwenda <hello@gwenda.co.uk>"
```

Or run:

```bash
npm run setup:event-ops
```

(when those values are already in `.env` and the script is configured to push them).

Redeploy staging or production so Pages Functions pick up the new secrets.

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
| No email at all               | All `SMTP_*` set? Dev server restarted?                                                                                                                                   |
| “Invalid login”               | App Password (not normal password). 2FA on `SMTP_USER`.                                                                                                                   |
| “Sender address rejected”     | Confirm `events@` is an **Admin alias** on the `SMTP_USER` account (not a separate user, not a Group). If it still fails, try Gmail → Settings → Accounts → Send mail as. |
| App Passwords missing         | 2FA not enabled, or admin disabled App Passwords for the org.                                                                                                             |
| Works locally, not on staging | GitHub secrets + redeploy.                                                                                                                                                |


### App Passwords disabled by admin?

Use **Google SMTP relay** (`smtp-relay.gmail.com`, port 587) with IP allowlisting in Admin. Same env vars except `SMTP_HOST`. Ask if you need relay-specific steps.

---

## G. Optional: Apple Wallet (`.pkpass`)

Calendar `.ics` works without extra setup. For Apple Wallet attachments, add to `.env` / Cloudflare secrets:

```bash
APPLE_WALLET_PASS_TYPE_ID=pass.co.uk.gwenda.event
APPLE_WALLET_TEAM_ID=...
APPLE_WALLET_SIGNER_CERT=...
APPLE_WALLET_SIGNER_KEY=...
APPLE_WALLET_WWDR_CERT=...
```

Requires an Apple Developer Pass Type ID and signing certificate.

---

## Quick reference

```
Login (SMTP_USER):     notifications@gwenda.co.uk
RSVP From (guests):    Gwenda Events <events@gwenda.co.uk>  (no-reply)
SMTP host:             smtp.gmail.com
SMTP port:             587
Sends when:            Guest RSVPs Yes with a valid email
```

