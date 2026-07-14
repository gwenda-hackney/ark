// Ticket files attached to RSVP confirmation emails.
// - .ics calendar import (always)
// - .pkpass Apple Wallet (when APPLE_WALLET_* env is configured)

const DEFAULT_LOCATION = {
  name: "Gwenda",
  address: "Unit 4003, 4 Schwartz Wharf, London, E9 5AA",
  lat: 51.541812,
  lng: -0.022465,
};

function foldIcsLine(line) {
  const max = 75;
  if (line.length <= max) return line;
  const parts = [];
  let rest = line;
  parts.push(rest.slice(0, max));
  rest = rest.slice(max);
  while (rest.length > 0) {
    parts.push(` ${rest.slice(0, max - 1)}`);
    rest = rest.slice(max - 1);
  }
  return parts.join("\r\n");
}

function escapeIcsText(value) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll("\n", "\\n");
}

function parseTimeOnDate(date, time) {
  if (!date || !time) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  if (hours > 23 || minutes > 59) return null;
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(hours, minutes, 0, 0);
  return parsed;
}

function toIcsUtc(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/**
 * Build a calendar ticket guests can import on iOS, Android, or desktop.
 */
export function buildCalendarTicket({
  ticketId,
  title,
  date,
  startTime,
  endTime,
  venue,
  guestName,
  guests,
  description,
  url,
}) {
  const uid = `${ticketId}@gwenda.co.uk`;
  const now = toIcsUtc(new Date());
  const start = parseTimeOnDate(date, startTime);
  const end = parseTimeOnDate(date, endTime);
  const summary = escapeIcsText(title || "Gwenda event");
  const location = escapeIcsText(venue || DEFAULT_LOCATION.address);
  const attendee = guestName ? `ATTENDEE;CN=${escapeIcsText(guestName)}:MAILTO:guest@gwenda.co.uk\r\n` : "";
  const details = [
    description?.trim(),
    guests > 1 ? `Party size: ${guests}` : "",
    url ? `Invitation: ${url}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const desc = escapeIcsText(details);

  let timing = "";
  if (start && end) {
    timing = `DTSTART:${toIcsUtc(start)}\r\nDTEND:${toIcsUtc(end)}\r\n`;
  } else if (date) {
    const day = date.replaceAll("-", "");
    timing = `DTSTART;VALUE=DATE:${day}\r\n`;
  }

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Gwenda//RSVP Ticket//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    timing.trimEnd(),
    `SUMMARY:${summary}`,
    `DESCRIPTION:${desc}`,
    `LOCATION:${location}`,
    attendee.trimEnd(),
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

function readAppleWalletEnv(env) {
  const passTypeId = env.APPLE_WALLET_PASS_TYPE_ID?.trim();
  const teamId = env.APPLE_WALLET_TEAM_ID?.trim();
  const signerCert = env.APPLE_WALLET_SIGNER_CERT?.trim();
  const signerKey = env.APPLE_WALLET_SIGNER_KEY?.trim();
  const wwdr = env.APPLE_WALLET_WWDR_CERT?.trim();
  if (!passTypeId || !teamId || !signerCert || !signerKey || !wwdr) return null;
  return {
    passTypeId,
    teamId,
    signerCert,
    signerKey,
    wwdr,
    signerKeyPassphrase: env.APPLE_WALLET_SIGNER_KEY_PASSPHRASE?.trim() || undefined,
  };
}

export async function fetchImageBuffer(url) {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Build a signed Apple Wallet pass when certificates are configured.
 * Returns null when Apple Wallet is not set up yet.
 */
export async function buildAppleWalletPass(env, options) {
  const config = readAppleWalletEnv(env);
  if (!config) return null;

  const {
    ticketId,
    title,
    date,
    startTime,
    venue,
    guestName,
    guests,
    logoUrl,
    origin,
  } = options;

  const start = parseTimeOnDate(date, startTime);

  const { PKPass } = await import("passkit-generator");
  const logo = (await fetchImageBuffer(logoUrl)) || (await fetchImageBuffer(`${origin}/favicon.png`));
  const buffers = logo ? { "logo.png": logo, "icon.png": logo } : {};

  const pass = new PKPass(
    buffers,
    {
      wwdr: config.wwdr,
      signerCert: config.signerCert,
      signerKey: config.signerKey,
      signerKeyPassphrase: config.signerKeyPassphrase,
    },
    {
      formatVersion: 1,
      passTypeIdentifier: config.passTypeId,
      teamIdentifier: config.teamId,
      organizationName: "Gwenda",
      description: title || "Gwenda event ticket",
      serialNumber: ticketId,
      logoText: "Gwenda",
      foregroundColor: "rgb(232, 228, 220)",
      backgroundColor: "rgb(13, 13, 13)",
      labelColor: "rgb(201, 168, 76)",
    },
  );

  pass.type = "eventTicket";
  if (start) pass.setRelevantDate(start);
  pass.setLocations({
    latitude: DEFAULT_LOCATION.lat,
    longitude: DEFAULT_LOCATION.lng,
    relevantText: venue || DEFAULT_LOCATION.name,
  });
  pass.setBarcodes({
    message: ticketId,
    format: "PKBarcodeFormatQR",
    messageEncoding: "iso-8859-1",
  });

  pass.headerFields.push({
    key: "guest",
    label: "GUEST",
    value: guestName || "Guest",
  });
  pass.primaryFields.push({
    key: "event",
    label: "EVENT",
    value: title || "Gwenda",
  });
  pass.secondaryFields.push({
    key: "when",
    label: "DATE",
    value: date || "",
  });
  pass.auxiliaryFields.push({
    key: "party",
    label: "PARTY",
    value: guests > 1 ? `${guests} guests` : "1 guest",
  });
  if (venue) {
    pass.auxiliaryFields.push({
      key: "venue",
      label: "VENUE",
      value: venue,
    });
  }

  return pass.getAsBuffer();
}

export function ticketAttachmentBaseName(eventSlug) {
  const slug = eventSlug?.trim() || "event";
  return slug.replace(/^private-/, "");
}

export async function buildRsvpTicketAttachments(env, options) {
  const ticketId = options.ticketId || `gwenda-${options.eventSlug || "event"}-${Date.now()}`;
  const attachmentBase = ticketAttachmentBaseName(options.eventSlug);
  const ics = buildCalendarTicket({
    ticketId,
    title: options.title,
    date: options.date,
    startTime: options.startTime,
    endTime: options.endTime,
    venue: options.venue,
    guestName: options.guestName,
    guests: options.guests,
    description: options.description,
    url: options.inviteUrl,
  });

  const attachments = [
    {
      filename: `${attachmentBase}.ics`,
      content: ics,
      contentType: "text/calendar; charset=utf-8",
    },
  ];

  let appleWalletPass = null;
  try {
    appleWalletPass = await buildAppleWalletPass(env, {
      ...options,
      ticketId,
    });
  } catch (error) {
    console.warn(
      "Apple Wallet pass generation failed:",
      error instanceof Error ? error.message : error,
    );
  }

  if (appleWalletPass) {
    attachments.push({
      filename: `${attachmentBase}.pkpass`,
      content: appleWalletPass,
      contentType: "application/vnd.apple.pkpass",
    });
  }

  return { ticketId, attachments, hasAppleWallet: Boolean(appleWalletPass) };
}
