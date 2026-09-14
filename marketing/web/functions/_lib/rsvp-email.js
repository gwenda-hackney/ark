// Confirmation email sent to a guest after they RSVP "yes".
// Copy comes from Sanity; the email links to the guest's ticket page (Wallet
// pass + calendar download live there, generated on demand — see ticket.js /
// functions/api/ticket/*).

import {
  buildConfirmationContent,
  confirmationHtml,
  LOGO_CID,
} from "./rsvp-email-template.js";
import { fetchImageBuffer } from "./rsvp-tickets.js";
import {
  EVENTS_NO_REPLY_HEADERS,
  resolveSmtpFrom,
  SMTP_PURPOSE,
} from "./smtp-from.js";

/**
 * Send the RSVP confirmation. Best-effort: callers should not fail the RSVP if
 * this throws. Returns { ok, skipped } and never mutates the response payload.
 */
export async function sendRsvpConfirmationEmail(
  env,
  { to, name, guests, event, inviteUrl, ticketUrl, origin, ticketId },
) {
  const host = env.SMTP_HOST?.trim();
  const from = resolveSmtpFrom(env, SMTP_PURPOSE.EVENTS);
  const recipient = to?.trim();
  if (!host || !from || !recipient) {
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

  const nodemailer = await import("nodemailer");
  const port = Number(env.SMTP_PORT?.trim() || "587");
  const user = env.SMTP_USER?.trim() ?? "";
  const password = env.SMTP_PASSWORD?.trim() ?? "";

  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user && password ? { user, pass: password } : undefined,
  });

  await transport.sendMail({
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
