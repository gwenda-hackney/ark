// Confirmation email sent to a guest after they RSVP "yes".
// Copy comes from Sanity; the email links to the guest's ticket page (Wallet
// pass + calendar download live there, generated on demand — see ticket.js /
// functions/api/ticket/*).

import {
  buildConfirmationContent,
  confirmationHtml,
} from "./rsvp-email-template.js";
import { fetchImageBuffer, LOGO_CID } from "../../../../shared/email-image.js";
import { isGmailConfigured, sendGmail } from "../../../../shared/gmail-send.js";
import {
  EVENTS_NO_REPLY_HEADERS,
  resolveSmtpFrom,
  SMTP_PURPOSE,
} from "../../../../shared/smtp-from.js";

/**
 * Send the RSVP confirmation. Best-effort: callers should not fail the RSVP if
 * this throws. Returns { ok, skipped } and never mutates the response payload.
 */
export async function sendRsvpConfirmationEmail(
  env,
  { to, name, guests, event, inviteUrl, ticketUrl, origin, ticketId },
) {
  const from = resolveSmtpFrom(env, SMTP_PURPOSE.EVENTS);
  const recipient = to?.trim();
  if (!from || !recipient || !isGmailConfigured(env)) {
    return { ok: false, skipped: true };
  }

  const content = buildConfirmationContent({
    name,
    guests,
    event,
    inviteUrl,
    ticketUrl,
    origin,
  });

  const base = (origin || "https://gwenda.co.uk").replace(/\/$/, "");
  const logoBuffer =
    (await fetchImageBuffer(content.logoUrl)) ||
    (await fetchImageBuffer(`${base}/favicon.png`));

  const attachments = [];
  if (logoBuffer) {
    attachments.push({
      filename: "gwenda-logo.png",
      content: logoBuffer,
      cid: LOGO_CID,
    });
  }

  await sendGmail(env, {
    from,
    to: recipient,
    subject: content.subject,
    text: content.bodyText,
    html: confirmationHtml({
      eyebrow: content.eyebrow,
      heading: content.heading,
      bodyHtml: content.bodyHtml,
      eventBlockHtml: content.eventBlockHtml,
      logoUrl: content.logoUrl,
      logoCid: logoBuffer ? LOGO_CID : null,
      ticketUrl,
      modifyUrl: content.modifyUrl,
    }),
    headers: EVENTS_NO_REPLY_HEADERS,
    attachments,
  });

  return { ok: true };
}
