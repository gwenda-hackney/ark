# Mailchimp email template (Gwenda)

On-brand HTML for subscriber notifications. Inline styles + `bgcolor` so Gmail/Outlook keep the dark canvas. Colours from [`docs/colors.md`](../../docs/colors.md).

| File | Role |
|------|------|
| [`mailchimp-template.html`](mailchimp-template.html) | Generic notification shell |
| [`mailchimp-grand-opening.html`](mailchimp-grand-opening.html) | Grand opening · 1 August 2026 (flyer layout, solid dark bg) |

## Grand opening email

Matches the print flyer hierarchy (wordmark, gold title, date, ornament rules, features, booking CTA, address line) on a **solid `#0d0d0d` canvas**. No full-bleed photo background, so image-blocked clients still see the design.

CTA links to OpenTable (`web/src/config/booking.ts`). Flyer QR is omitted in email; use the button/link instead (QR is an image and fails when images are blocked).

Upload / refresh via API (needs `MAILCHIMP_API_KEY` in `.env`):

```bash
node scripts/with-env.mjs node scripts/upload-mailchimp-template.mjs brand/email/mailchimp-grand-opening.html "Gwenda · Grand Opening"
```

## Import and send a test to yourself

Needs Mailchimp **Standard** (or higher) to send custom-coded HTML.

1. Open Mailchimp → **Campaigns** → **Email templates** → use **Gwenda · Grand Opening** (or paste HTML via Code your own).
2. Create a campaign from that template.
3. Send a test to yourself. Confirm full-bleed dark background in Gmail.

## Design notes

- Outer table `bgcolor="#0d0d0d"` for clients that ignore `body` CSS.
- Inner card `#1a1a1a` with gold border at ~12% opacity.
- Logo: `https://gwenda.co.uk/brand/logo-email.png`.
- Type: Cormorant Garamond (eyebrows/headings), Lora (body); fallback Garamond → Baskerville → Palatino → Times.
- Gmail strips web fonts. Local fallback preview: open [`mailchimp-grand-opening.gmail-preview.html`](mailchimp-grand-opening.gmail-preview.html).

Subscriber sync (Baserow → Mailchimp Worker) is separate and not required to test this template.
