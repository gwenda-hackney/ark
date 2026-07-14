// RSVP confirmation email copy and HTML. Event-specific content comes from Sanity;
// placeholders are filled at send time.

const COLORS = {
  bg: "#0d0d0d",
  card: "#1a1a1a",
  text: "#e8e4dc",
  muted: "#8a8680",
  gold: "#c9a84c",
};

const DEFAULT_SUBJECT = "You're on the list · Gwenda";
const DEFAULT_HEADING = "You're on the list";
const DEFAULT_BODY = `Hi {name},

Thanks for replying. {guests_line}

{title} is on {date} at {venue}.

Your ticket is attached. Add it to Apple Wallet or import the calendar file on your phone.

See you there.`;

const DEFAULT_VENUE = "Schwartz Wharf, Hackney Wick, London E9 5AA";

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

/** Human line for the party size, matching the on-site confirmation copy. */
export function guestLine(guests) {
  if (!guests || guests <= 1) return "We've got you down.";
  if (guests >= 5) return "We've got a party of 5 or more down for you.";
  return `We've got ${guests} of you down.`;
}

export function formatRsvpContent(template, values) {
  return String(template ?? "")
    .replaceAll("{name}", values.name || "there")
    .replaceAll("{guests_line}", values.guestsLine || guestLine(values.guests))
    .replaceAll("{guests}", String(values.guests ?? ""))
    .replaceAll("{title}", values.title || "The event")
    .replaceAll("{date}", values.date || "")
    .replaceAll("{venue}", values.venue || DEFAULT_VENUE)
    .replaceAll("{invite_url}", values.inviteUrl || "");
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

export function buildConfirmationContent({ name, guests, event, inviteUrl, origin }) {
  const copy = mergeRsvpConfirmation(event);
  const values = {
    name,
    guests,
    guestsLine: guestLine(guests),
    title: event?.title || "The event",
    date: formatEventDate(event?.date),
    venue: copy.venue,
    inviteUrl,
  };

  const bodyText = formatRsvpContent(copy.body, values);
  const base = (origin || "https://gwenda.co.uk").replace(/\/$/, "");
  const logoUrl = `${base}/brand/logo-organization.png`;

  return {
    subject: formatRsvpContent(copy.subject, values),
    heading: formatRsvpContent(copy.heading, values),
    bodyText,
    bodyHtml: bodyToHtmlParagraphs(bodyText),
    logoUrl,
    venue: copy.venue,
    ticketStart: copy.ticketStart,
    ticketEnd: copy.ticketEnd,
  };
}

export function confirmationHtml({
  heading,
  bodyHtml,
  logoUrl,
  inviteUrl,
  googleWalletUrl,
}) {
  const inviteButton = inviteUrl
    ? `<p style="margin:1.75rem 0 0;">
        <a href="${escapeHtml(inviteUrl)}" style="display:inline-block;padding:0.85rem 1.5rem;background:${COLORS.gold};color:${COLORS.bg};text-decoration:none;letter-spacing:0.08em;text-transform:uppercase;font-size:0.8rem;">View your invitation</a>
      </p>`
    : "";
  const walletButton = googleWalletUrl
    ? `<p style="margin:1rem 0 0;">
        <a href="${escapeHtml(googleWalletUrl)}" style="display:inline-block;padding:0.85rem 1.5rem;border:1px solid ${COLORS.gold};color:${COLORS.gold};text-decoration:none;letter-spacing:0.08em;text-transform:uppercase;font-size:0.8rem;">Add to Google Wallet</a>
      </p>`
    : "";

  return `<!doctype html>
<html><body style="background:${COLORS.bg};color:${COLORS.text};font-family:Georgia,serif;padding:24px;margin:0;">
  <div style="max-width:560px;margin:0 auto;background:${COLORS.card};border:1px solid rgba(232,228,220,0.08);border-radius:2px;padding:28px;">
    <img src="${escapeHtml(logoUrl)}" alt="Gwenda" width="180" style="width:min(180px, 55vw);height:auto;margin:0 0 1.75rem;display:block;" />
    <h1 style="margin:0 0 1.25rem;font-weight:500;font-size:1.9rem;line-height:1.15;color:${COLORS.text};">${escapeHtml(heading)}</h1>
    ${bodyHtml}
    ${inviteButton}
    ${walletButton}
  </div>
</body></html>`;
}
