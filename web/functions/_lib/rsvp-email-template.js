// RSVP confirmation email copy and HTML. Event-specific content comes from Sanity;
// placeholders are filled at send time.

import { DEFAULT_VENUE, VENUE_MAPS_URL } from "./site-location.js";

const COLORS = {
  bg: "#0d0d0d",
  card: "#1a1a1a",
  text: "#e8e4dc",
  muted: "#8a8680",
  gold: "#c9a84c",
};

const DEFAULT_SUBJECT = "You're on the list · Gwenda";
const DEFAULT_HEADING = "You're on the list";
const DEFAULT_BODY = `{greeting}

Thanks for replying. {guests_line}

When: {date}

{venue}

View your ticket and add it to Apple Wallet: {ticket_url}

See you there.`;

export const LOGO_CID = "gwenda-logo@gwenda";

export function defaultRsvpConfirmation() {
  return {
    subject: DEFAULT_SUBJECT,
    heading: DEFAULT_HEADING,
    body: DEFAULT_BODY,
    venue: DEFAULT_VENUE,
    ticketStart: "17:00",
    ticketEnd: "23:00",
  };
}

export function mergeRsvpConfirmation(event) {
  const defaults = defaultRsvpConfirmation();
  const fromSanity = event?.rsvpConfirmation ?? {};
  return {
    subject: fromSanity.subject?.trim() || defaults.subject,
    heading: fromSanity.heading?.trim() || defaults.heading,
    body: fromSanity.body?.trim() || defaults.body,
    venue: event?.venue?.trim() || fromSanity.venue?.trim() || defaults.venue,
    ticketStart: event?.ticketStart?.trim() || defaults.ticketStart,
    ticketEnd: event?.ticketEnd?.trim() || defaults.ticketEnd,
  };
}

export function formatEventDate(date) {
  if (!date) return "";
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsed);
}

function formatTicketTime(time) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(time ?? "").trim());
  if (!match) return "";
  let hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  if (hours > 23 || minutes > 59) return "";
  const period = hours >= 12 ? "pm" : "am";
  hours %= 12;
  if (hours === 0) hours = 12;
  if (minutes === 0) return `${hours}${period}`;
  return `${hours}:${String(minutes).padStart(2, "0")}${period}`;
}

/** Date and door times for the confirmation email When line. */
export function formatEventWhen(date, startTime, endTime) {
  const datePart = formatEventDate(date);
  const start = formatTicketTime(startTime);
  const end = formatTicketTime(endTime);
  if (datePart && start && end) return `${datePart}, ${start}–${end}`;
  if (datePart && start) return `${datePart}, ${start}`;
  return datePart;
}

/** Salutation line for the email body. Uses the guest name when we have one. */
export function greetingLine(name) {
  const trimmed = String(name ?? "").trim();
  return trimmed ? `Hi ${trimmed},` : "Hello,";
}

/** Human line for the party size, matching the on-site confirmation copy. */
export function guestLine(guests) {
  if (!guests || guests <= 1) return "We've got you down.";
  if (guests >= 5) return "We've got a party of 5 or more down for you.";
  return `We've got ${guests} of you down.`;
}

export function formatRsvpContent(template, values) {
  const name = String(values.name ?? "").trim();
  const greeting = values.greeting ?? greetingLine(name);
  let text = String(template ?? "")
    .replaceAll("{greeting}", greeting)
    .replaceAll("{name}", name)
    .replaceAll("{guests_line}", values.guestsLine || guestLine(values.guests))
    .replaceAll("{guests}", String(values.guests ?? ""))
    .replaceAll("{title}", values.title || "The event")
    .replaceAll("{date}", values.date || "")
    .replaceAll("{venue}", values.venue || DEFAULT_VENUE)
    .replaceAll("{maps_url}", values.mapsUrl || VENUE_MAPS_URL)
    .replaceAll("{invite_url}", values.inviteUrl || "")
    .replaceAll("{ticket_url}", values.ticketUrl || "");

  if (!name) {
    text = text.replace(/^Hi\s*,/gm, "Hello,").replace(/^Hi there,/gm, "Hello,");
  }

  return text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function bodyToHtmlParagraphs(text) {
  return text
    .split("\n")
    .map((line) =>
      line.trim()
        ? `<p style="margin:0 0 1rem;line-height:1.65;color:${COLORS.text};">${escapeHtml(line)}</p>`
        : "",
    )
    .join("");
}

export function buildConfirmationContent({ name, guests, event, inviteUrl, ticketUrl, origin }) {
  const copy = mergeRsvpConfirmation(event);
  const values = {
    name,
    guests,
    guestsLine: guestLine(guests),
    greeting: greetingLine(name),
    title: event?.title || "The event",
    date: formatEventWhen(event?.date, copy.ticketStart, copy.ticketEnd),
    venue: copy.venue,
    mapsUrl: VENUE_MAPS_URL,
    inviteUrl,
    ticketUrl,
  };

  const bodyText = formatRsvpContent(copy.body, values);
  const base = (origin || "https://gwenda.co.uk").replace(/\/$/, "");
  const logoUrl = `${base}/brand/logo-email.png`;

  return {
    subject: formatRsvpContent(copy.subject, values),
    heading: formatRsvpContent(copy.heading, values),
    bodyText,
    bodyHtml: bodyToHtmlParagraphs(bodyText),
    logoUrl,
    logoCid: LOGO_CID,
    mapsUrl: VENUE_MAPS_URL,
    venue: copy.venue,
    ticketStart: copy.ticketStart,
    ticketEnd: copy.ticketEnd,
  };
}

export function confirmationHtml({
  heading,
  bodyHtml,
  logoUrl,
  logoCid,
  ticketUrl,
  mapsUrl,
}) {
  const logoSrc = logoCid ? `cid:${logoCid}` : logoUrl;
  const logoMarkup = logoSrc
    ? `<div style="text-align:center;margin:0 0 1.75rem;">
        <img src="${escapeHtml(logoSrc)}" alt="Gwenda" width="180" style="width:min(180px, 55vw);height:auto;margin:0 auto;display:block;" />
      </div>`
    : "";
  const ticketButton = ticketUrl
    ? `<p style="margin:1.75rem 0 0;">
        <a href="${escapeHtml(ticketUrl)}" style="display:inline-block;padding:0.85rem 1.5rem;background:${COLORS.gold};color:${COLORS.bg};text-decoration:none;letter-spacing:0.08em;text-transform:uppercase;font-size:0.8rem;">View your ticket</a>
      </p>`
    : "";
  const directionsButton = mapsUrl
    ? `<p style="margin:1rem 0 0;">
        <a href="${escapeHtml(mapsUrl)}" style="display:inline-block;padding:0.85rem 1.5rem;border:1px solid rgba(232,228,220,0.2);color:${COLORS.text};text-decoration:none;letter-spacing:0.08em;text-transform:uppercase;font-size:0.8rem;">Get directions</a>
      </p>`
    : "";

  return `<!doctype html>
<html><body style="background:${COLORS.bg};color:${COLORS.text};font-family:Georgia,serif;padding:24px;margin:0;">
  <div style="max-width:560px;margin:0 auto;background:${COLORS.card};border:1px solid rgba(232,228,220,0.08);border-radius:2px;padding:28px;">
    ${logoMarkup}
    <h1 style="margin:0 0 1.25rem;font-weight:500;font-size:1.9rem;line-height:1.15;color:${COLORS.text};">${escapeHtml(heading)}</h1>
    ${bodyHtml}
    ${ticketButton}
    ${directionsButton}
  </div>
</body></html>`;
}
