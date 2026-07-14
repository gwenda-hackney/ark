// Confirmation email sent to a guest after they RSVP "yes".
// Copy comes from Sanity; ticket files are attached for calendar / wallet import.

import {
  buildConfirmationContent,
  confirmationHtml,
} from "./rsvp-email-template.js";
import { buildRsvpTicketAttachments } from "./rsvp-tickets.js";
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
  { to, name, guests, event, inviteUrl, origin, ticketId },
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
    origin,
  });

  const { attachments } = await buildRsvpTicketAttachments(env, {
    ticketId,
    eventSlug: event?.slug,
    title: event?.title,
    date: event?.date,
    startTime: content.ticketStart,
    endTime: content.ticketEnd,
    venue: content.venue,
    guestName: name,
    guests,
    description: event?.description,
    inviteUrl,
    logoUrl: content.logoUrl,
    origin: (origin || "https://gwenda.co.uk").replace(/\/$/, ""),
  });

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
      heading: content.heading,
      bodyHtml: content.bodyHtml,
      logoUrl: content.logoUrl,
      inviteUrl,
      googleWalletUrl: null,
    }),
    headers: EVENTS_NO_REPLY_HEADERS,
    attachments,
  });

  return { ok: true };
}
