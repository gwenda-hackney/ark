// RSVP confirmation email copy and HTML. Event-specific content comes from Sanity;
// placeholders are filled at send time.

import {
  DEFAULT_VENUE,
  SITE_ADDRESS,
  SITE_DOMAIN,
  SITE_INSTAGRAM,
  VENUE_MAPS_URL,
} from "../../../../shared/site-location.js";
import { LOGO_CID } from "../../../../shared/email-image.js";

const COLORS = {
  bg: "#0d0d0d",
  card: "#1a1a1a",
  text: "#e8e4dc",
  muted: "#8a8680",
  gold: "#c9a84c",
};

const FONT_DISPLAY = "'Cormorant Garamond', Georgia, serif";
const FONT_BODY = "'Lora', Georgia, serif";
const GOLD_BORDER = "rgba(201, 168, 76, 0.1)";
const GOLD_UNDERLINE = "rgba(201, 168, 76, 0.45)";

const DEFAULT_SUBJECT = "You're on the list · Gwenda";
const DEFAULT_EYEBROW = "You're on the list";
const DEFAULT_HEADING = "See you there";
const DEFAULT_BODY = `{greeting}

Thanks for replying. {guests_line}

{event_block}

Open your ticket link below to view your pass, add it to Apple Wallet, or save the date to your calendar.

Need to change your reply? {modify_url}`;

export function defaultRsvpConfirmation() {
  return {
    subject: DEFAULT_SUBJECT,
    eyebrow: DEFAULT_EYEBROW,
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

  let eyebrow = fromSanity.eyebrow?.trim() || defaults.eyebrow;
  let heading = fromSanity.heading?.trim() || defaults.heading;

  if (!fromSanity.eyebrow?.trim() && heading === DEFAULT_EYEBROW) {
    eyebrow = heading;
    heading = defaults.heading;
  }

  return {
    subject: fromSanity.subject?.trim() || defaults.subject,
    eyebrow,
    heading,
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
  const clock = parseClock(match[1], match[2]);
  return clock ? formatClock(clock) : "";
}

function parseClock(hoursText, minutesText) {
  const hours = Number.parseInt(hoursText, 10);
  const minutes = Number.parseInt(minutesText, 10);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

function formatClock(clock) {
  const period = clock.hours >= 12 ? "pm" : "am";
  let hours = clock.hours % 12;
  if (hours === 0) hours = 12;
  if (clock.minutes === 0) return `${hours}${period}`;
  return `${hours}:${String(clock.minutes).padStart(2, "0")}${period}`;
}

function formatClockRange(start, end) {
  const samePeriod = start.hours >= 12 === end.hours >= 12;
  if (!samePeriod) return `${formatClock(start)}–${formatClock(end)}`;
  return `${formatClock(start).replace(/(am|pm)$/, "")}–${formatClock(end)}`;
}

function formatTimePart(part) {
  const range =
    /^(\d{1,2})[:.](\d{2})\s*(?:[–—-]|to)\s*(\d{1,2})[:.](\d{2})$/i.exec(
      part.trim(),
    );
  if (range) {
    const start = parseClock(range[1], range[2]);
    const end = parseClock(range[3], range[4]);
    if (!start || !end) return "";
    return formatClockRange(start, end);
  }
  const single = /^(\d{1,2})[:.](\d{2})$/.exec(part.trim());
  if (!single) return "";
  const clock = parseClock(single[1], single[2]);
  return clock ? formatClock(clock) : "";
}

function joinTimes(parts) {
  if (parts.length <= 1) return parts[0] || "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function formatPublicTime(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const parts = raw
    .split(/\s*(?:\||\/|\band\b|\bthen\b|,)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
  const formatted = parts.map(formatTimePart);
  if (parts.length && formatted.every(Boolean)) return joinTimes(formatted);
  return raw;
}

function timeParts(value) {
  return String(value ?? "")
    .trim()
    .split(/\s*(?:\||\/|\band\b|\bthen\b|,)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function formatEventSpan(start, end, legacy) {
  const startText = String(start || "").trim();
  const endText = String(end || "").trim();
  if (startText && endText) return formatPublicTime(`${startText}–${endText}`);
  if (startText) return formatPublicTime(startText);
  const raw = String(legacy || "").trim();
  if (!raw || timeParts(raw).length > 1) return "";
  return formatPublicTime(raw);
}

/** Date and door times for the confirmation email When line. */
export function formatEventWhen(date, startTime, endTime, time) {
  const datePart = formatEventDate(date);
  const span = formatEventSpan(startTime, endTime, time);
  if (datePart && span) return `${datePart}, ${span}`;
  return datePart;
}

/** Salutation line for the email body. Uses the guest name when we have one. */
export function greetingLine(name) {
  const trimmed = String(name ?? "").trim();
  return trimmed ? `Hi ${trimmed},` : "Hello,";
}

/** Human line for the party size, matching the RSVP pill labels. */
export function guestLine(guests) {
  if (!guests || guests <= 1) return "We've got you down.";
  if (guests >= 6) return "We've got you down for 5+.";
  return `We've got you down for ${guests}.`;
}

export function formatRsvpContent(template, values) {
  const name = String(values.name ?? "").trim();
  const greeting = values.greeting ?? greetingLine(name);
  const eventBlock = values.eventBlock || "";
  const modifyUrl = values.modifyUrl || values.inviteUrl || "";
  let text = String(template ?? "")
    .replaceAll("{greeting}", greeting)
    .replaceAll("{name}", name)
    .replaceAll("{guests_line}", values.guestsLine || guestLine(values.guests))
    .replaceAll("{guests}", String(values.guests ?? ""))
    .replaceAll("{title}", values.title || "The event")
    .replaceAll("{date}", values.date || "")
    .replaceAll("{event_block}", eventBlock)
    .replaceAll("{venue}", values.venue || DEFAULT_VENUE)
    .replaceAll("{maps_url}", values.mapsUrl || VENUE_MAPS_URL)
    .replaceAll("{invite_url}", values.inviteUrl || "")
    .replaceAll("{modify_url}", modifyUrl)
    .replaceAll("{ticket_url}", values.ticketUrl || "");

  if (!name) {
    text = text
      .replace(/^Hi\s*,/gm, "Hello,")
      .replace(/^Hi there,/gm, "Hello,");
  }

  return text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function eventBlockText(title, when, offer) {
  const lines = [];
  if (title) lines.push(title);
  if (offer) lines.push(offer);
  if (when) lines.push(`When: ${when}`);
  return lines.join("\n");
}

function isSkippableBodyLine(line, { ticketUrl, modifyUrl }) {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (ticketUrl && trimmed === ticketUrl) return true;
  if (ticketUrl && trimmed.includes(ticketUrl)) return true;
  if (modifyUrl && trimmed === modifyUrl) return true;
  if (modifyUrl && trimmed.includes(modifyUrl)) return true;
  if (/^https?:\/\/www\.google\.com\/maps/i.test(trimmed)) return true;
  if (/^when:\s/i.test(trimmed)) return true;
  if (trimmed === DEFAULT_VENUE) return true;
  return false;
}

function renderBodyLine(line) {
  const trimmed = line.trim();
  const baseStyle = `margin:0 0 1rem;font-family:${FONT_BODY};font-size:1.05rem;line-height:1.65;color:${COLORS.text};`;
  return `<p style="${baseStyle}">${escapeHtml(trimmed)}</p>`;
}

function bodyToHtmlParagraphs(text, { ticketUrl, modifyUrl }) {
  return text
    .split("\n")
    .filter((line) => !isSkippableBodyLine(line, { ticketUrl, modifyUrl }))
    .map((line) => renderBodyLine(line))
    .join("");
}

function eventBlockHtml(title, when, offer) {
  if (!title && !when && !offer) return "";
  const titleMarkup = title
    ? `<p style="margin:0 0 0.35rem;font-family:${FONT_DISPLAY};font-size:1.35rem;font-weight:500;letter-spacing:0.03em;line-height:1.25;color:${COLORS.text};">${escapeHtml(title)}</p>`
    : "";
  const whenMarkup = when
    ? `<p style="margin:0;font-family:${FONT_BODY};font-size:1.05rem;line-height:1.65;color:${COLORS.muted};">${escapeHtml(when)}</p>`
    : "";
  const offerMarkup = offer
    ? `<p style="margin:0 0 0.35rem;font-family:${FONT_BODY};font-size:0.95rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${COLORS.gold};">${escapeHtml(offer)}</p>`
    : "";
  return `<div style="margin:0 0 1.25rem;padding:1rem 1.1rem;border:1px solid ${GOLD_BORDER};border-radius:2px;background:rgba(13,13,13,0.35);">${titleMarkup}${offerMarkup}${whenMarkup}</div>`;
}

function emailFooterHtml({ year = new Date().getFullYear() } = {}) {
  return `<div style="margin:2rem 0 0;padding-top:1.5rem;border-top:1px solid ${GOLD_BORDER};">
    <p style="margin:0 0 0.85rem;font-family:${FONT_DISPLAY};font-size:11px;font-weight:600;letter-spacing:0.28em;text-transform:uppercase;color:${COLORS.gold};">Connect</p>
    <p style="margin:0 0 0.65rem;font-family:${FONT_BODY};font-size:0.95rem;line-height:1.6;">
      <a href="${escapeHtml(VENUE_MAPS_URL)}" style="color:${COLORS.muted};text-decoration:underline;text-decoration-color:${GOLD_UNDERLINE};">${escapeHtml(SITE_ADDRESS)}</a>
    </p>
    <p style="margin:0 0 0.65rem;font-family:${FONT_BODY};font-size:0.95rem;line-height:1.6;">
      <a href="${escapeHtml(SITE_INSTAGRAM)}" style="color:${COLORS.muted};text-decoration:underline;text-decoration-color:${GOLD_UNDERLINE};">Instagram</a>
      <span style="color:${COLORS.muted};"> · </span>
      <a href="${escapeHtml(SITE_DOMAIN)}" style="color:${COLORS.muted};text-decoration:underline;text-decoration-color:${GOLD_UNDERLINE};">gwenda.co.uk</a>
    </p>
    <p style="margin:0;font-family:${FONT_BODY};font-size:0.85rem;line-height:1.5;color:${COLORS.muted};">© ${year} Gwenda</p>
  </div>`;
}

export function buildConfirmationContent({
  name,
  guests,
  event,
  inviteUrl,
  ticketUrl,
  origin,
}) {
  const copy = mergeRsvpConfirmation(event);
  const when = formatEventWhen(
    event?.date,
    copy.ticketStart,
    copy.ticketEnd,
    event?.time,
  );
  const title = event?.title || "The event";
  const offer = event?.offer?.trim() || "";
  const eventBlock = eventBlockText(title, when, offer);
  const values = {
    name,
    guests,
    guestsLine: guestLine(guests),
    greeting: greetingLine(name),
    title,
    date: when,
    eventBlock,
    venue: copy.venue,
    mapsUrl: VENUE_MAPS_URL,
    inviteUrl,
    modifyUrl: inviteUrl,
    ticketUrl,
  };

  const bodyText = formatRsvpContent(copy.body, values);
  const base = (origin || SITE_DOMAIN).replace(/\/$/, "");
  const logoUrl = `${base}/brand/logo-email.png`;

  return {
    subject: formatRsvpContent(copy.subject, values),
    eyebrow: formatRsvpContent(copy.eyebrow, values),
    heading: formatRsvpContent(copy.heading, values),
    eventTitle: title,
    eventWhen: when,
    bodyText,
    bodyHtml: bodyToHtmlParagraphs(bodyText, {
      ticketUrl,
      modifyUrl: inviteUrl,
    }),
    eventBlockHtml: eventBlockHtml(title, when, offer),
    logoUrl,
    logoCid: LOGO_CID,
    mapsUrl: VENUE_MAPS_URL,
    venue: copy.venue,
    ticketStart: copy.ticketStart,
    ticketEnd: copy.ticketEnd,
    modifyUrl: inviteUrl,
  };
}

export function confirmationHtml({
  eyebrow,
  heading,
  bodyHtml,
  eventBlockHtml: eventBlockMarkup,
  logoUrl,
  logoCid,
  ticketUrl,
  modifyUrl,
}) {
  const logoSrc = logoCid ? `cid:${logoCid}` : logoUrl;
  const logoMarkup = logoSrc
    ? `<div style="text-align:center;margin:0 0 2rem;">
        <img src="${escapeHtml(logoSrc)}" alt="Gwenda" width="180" style="width:min(180px, 55vw);height:auto;margin:0 auto;display:block;" />
      </div>`
    : "";
  const ticketButton = ticketUrl
    ? `<p style="margin:1.75rem 0 0;">
        <a href="${escapeHtml(ticketUrl)}" style="display:inline-block;padding:0.9rem 2.2rem;background:${COLORS.gold};color:${COLORS.bg};text-decoration:none;font-family:${FONT_DISPLAY};font-weight:600;letter-spacing:0.08em;text-transform:uppercase;font-size:0.95rem;border-radius:2px;border:1px solid ${COLORS.gold};">Open your ticket</a>
      </p>
      <p style="margin:0.85rem 0 0;font-family:${FONT_BODY};font-size:0.95rem;line-height:1.6;color:${COLORS.muted};">View your pass, add it to Apple Wallet, or download a calendar file from your ticket page.</p>`
    : "";
  const modifyLink = modifyUrl
    ? `<p style="margin:1.25rem 0 0;font-family:${FONT_BODY};font-size:0.95rem;line-height:1.6;">
        <a href="${escapeHtml(modifyUrl)}" style="color:${COLORS.gold};text-decoration:underline;text-decoration-color:${GOLD_UNDERLINE};">Change your reply</a>
      </p>`
    : "";

  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&amp;family=Lora:wght@400&amp;display=swap" rel="stylesheet" />
  <title>${escapeHtml(heading)}</title>
</head>
<body style="background:${COLORS.bg};color:${COLORS.text};font-family:${FONT_BODY};padding:24px;margin:0;-webkit-font-smoothing:antialiased;">
  <div style="max-width:560px;margin:0 auto;">
    <div style="background:${COLORS.card};border:1px solid ${GOLD_BORDER};border-radius:2px;padding:32px 28px;text-align:left;">
      ${logoMarkup}
      <p style="margin:0 0 0.85rem;font-family:${FONT_DISPLAY};font-size:11px;font-weight:600;letter-spacing:0.28em;text-transform:uppercase;color:${COLORS.gold};">${escapeHtml(eyebrow)}</p>
      <h1 style="margin:0;font-family:${FONT_DISPLAY};font-weight:500;font-size:2.25rem;letter-spacing:0.03em;line-height:1.2;color:${COLORS.text};">${escapeHtml(heading)}</h1>
      <div style="width:2rem;height:1px;margin:1.15rem 0 1.25rem;background:linear-gradient(90deg, ${COLORS.gold}, transparent);"></div>
      ${eventBlockMarkup || ""}
      ${bodyHtml}
      ${ticketButton}
      ${modifyLink}
      ${emailFooterHtml()}
    </div>
  </div>
</body></html>`;
}
