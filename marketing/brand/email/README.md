# Mailchimp email template (Gwenda)

On-brand HTML for subscriber notifications. Inline styles + `bgcolor` so Gmail/Outlook keep the dark canvas. Colours from [`docs/colors.md`](../../../docs/colors.md).

| File | Role |
|------|------|
| [`mailchimp-template.html`](mailchimp-template.html) | Generic notification shell |
| [`mailchimp-grand-opening.html`](mailchimp-grand-opening.html) | Grand opening · today · 1 August 2026 (schedule + booking CTA) |

## Grand opening email

Companion to the grand opening flyer, in **left-aligned editorial** layout: wordmark, cream *Grand Opening* over gold *Today*, date eyebrow, lead copy, schedule (large numeral, `pm`, gold vertical rule, gold label, DJ lineup), OpenTable CTA.

Solid `#0d0d0d` canvas with no photo background, so image-blocked clients still see the design. Type scale carries the hierarchy that the flyer gets from the photograph.

Italic is a sparing accent (brand guidelines §4.3): the two invitation lines only. What we serve, the schedule, and the lineup stay upright.

CTA uses site copy **Book a table** and links to OpenTable (`web/src/config/booking.ts`).

`mailchimp-grand-opening.gmail-preview.html` is **generated** from the template, not hand-edited. Regenerate after any change:

```bash
node -e '
const fs=require("node:fs");
let h=fs.readFileSync("brand/email/mailchimp-grand-opening.html","utf8");
h=h.replace(/^\s*<link href="https:\/\/fonts\.googleapis\.com[^\n]*\n/m,"")
   .replace(/'"'"'Cormorant Garamond'"'"',Garamond,/g,"Garamond,")
   .replace(/Lora,Garamond,/g,"Garamond,")
   .replace("<title>Grand Opening · Gwenda</title>","<title>Grand Opening · Gmail font preview (Garamond)</title>")
   .replace(/(<body[^>]*>)/,`$1\n  <div style="position:sticky;top:0;z-index:9;background:#23211b;color:#c9a84c;font-family:Garamond,serif;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;text-align:center;padding:10px 16px;border-bottom:1px solid #4a463e;">\n    Preview · Gmail fallback fonts (Garamond) · web fonts blocked\n  </div>\n`);
fs.writeFileSync("brand/email/mailchimp-grand-opening.gmail-preview.html",h);
'
```

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
