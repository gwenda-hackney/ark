// Ticket files attached to RSVP confirmation emails.
// - .ics calendar import (always)
// - .pkpass Apple Wallet (when APPLE_WALLET_* env is configured)

import { formatEventWhen } from "./rsvp-email-template.js";
import { fetchImageBuffer } from "../../../../shared/email-image.js";
import { WALLET_BRAND_ASSETS } from "./wallet-brand-assets.generated.js";

const DEFAULT_LOCATION = {
  name: "Gwenda",
  address: "Unit 4003, 4 Schwartz Wharf, London, E9 5AA",
  lat: 51.541812,
  lng: -0.022465,
};

/** Display name for calendar and Wallet tickets, e.g. "Gwenda Launch Party". */
export function formatTicketTitle(title) {
  const trimmed = String(title ?? "").trim();
  if (!trimmed) return "Gwenda Launch Party";
  if (/^gwenda\b/i.test(trimmed)) return trimmed;
  return `Gwenda ${trimmed}`;
}

/** Decode a bundled wallet brand image (see wallet-brand-assets.generated.js). */
function brandAssetBuffer(file) {
  const base64 = WALLET_BRAND_ASSETS[file];
  return base64 ? Buffer.from(base64, "base64") : null;
}

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
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
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
  if (start && end && end <= start) end.setDate(end.getDate() + 1);
  const summary = escapeIcsText(formatTicketTitle(title));
  const location = escapeIcsText(venue || DEFAULT_LOCATION.address);
  const attendee = guestName
    ? `ATTENDEE;CN=${escapeIcsText(guestName)}:MAILTO:guest@gwenda.co.uk\r\n`
    : "";
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
    signerKeyPassphrase:
      env.APPLE_WALLET_SIGNER_KEY_PASSPHRASE?.trim() || undefined,
  };
}

/** Apple Wallet event-ticket strip sizes (see Wallet Human Interface Guidelines). */
export const WALLET_STRIP_SIZES = [
  { file: "strip.png", width: 375, height: 98, fallback: "strip-fallback.png" },
  {
    file: "strip@2x.png",
    width: 750,
    height: 196,
    fallback: "strip-fallback@2x.png",
  },
  {
    file: "strip@3x.png",
    width: 1125,
    height: 294,
    fallback: "strip-fallback@3x.png",
  },
];

const WALLET_BRAND_FILES = [
  "logo.png",
  "logo@2x.png",
  "logo@3x.png",
  "icon.png",
  "icon@2x.png",
  "icon@3x.png",
];

/** Build a cropped hero URL sized for the Wallet strip image. */
export function walletStripImageUrl(heroImageUrl, width, height) {
  const url = heroImageUrl?.trim();
  if (!url || !width || !height) return null;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}w=${width}&h=${height}&fit=crop&auto=format`;
}

async function buildPassImageBuffers({ heroImageUrl }) {
  const buffers = {};

  for (const file of WALLET_BRAND_FILES) {
    const buffer = brandAssetBuffer(file);
    if (buffer) buffers[file] = buffer;
  }

  let hasStrip = false;
  if (heroImageUrl) {
    const strips = await Promise.all(
      WALLET_STRIP_SIZES.map(async ({ file, width, height }) => {
        const buffer = await fetchImageBuffer(
          walletStripImageUrl(heroImageUrl, width, height),
        );
        return buffer ? [file, buffer] : null;
      }),
    );
    for (const entry of strips) {
      if (entry) {
        const [file, buffer] = entry;
        buffers[file] = buffer;
        hasStrip = true;
      }
    }
  }

  if (!hasStrip) {
    for (const { file, fallback } of WALLET_STRIP_SIZES) {
      const buffer = brandAssetBuffer(fallback);
      if (buffer) buffers[file] = buffer;
    }
  }

  return buffers;
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
    endTime,
    venue,
    guestName,
    guests,
    heroImageUrl,
  } = options;

  const eventTitle = formatTicketTitle(title);
  const start = parseTimeOnDate(date, startTime);
  const whenLabel = formatEventWhen(date, startTime, endTime);

  const buffers = await buildPassImageBuffers({ heroImageUrl });

  // The brand icon/logo are bundled at build time (wallet-brand-assets.generated.js),
  // so this should never be missing. Guard anyway rather than ship a pass Apple
  // will refuse to render on-device — the calendar .ics ticket still goes out.
  if (!buffers["icon.png"]) {
    console.warn(
      "Apple Wallet pass skipped: bundled icon.png is missing. Run npm run generate:brand-assets.",
    );
    return null;
  }

  try {
    const { PKPass } = await import("passkit-generator");
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
        description: eventTitle,
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

    pass.headerFields.push({
      key: "guest",
      label: "GUEST",
      value: guestName || "Guest",
    });
    pass.primaryFields.push({
      key: "event",
      label: "EVENT",
      value: eventTitle,
    });
    pass.secondaryFields.push({
      key: "when",
      label: "WHEN",
      value: whenLabel || date || "",
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

    return await pass.getAsBuffer();
  } catch (error) {
    console.warn(
      "Apple Wallet pass generation failed:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

export function ticketAttachmentBaseName(eventSlug) {
  const slug = eventSlug?.trim() || "event";
  return slug.replace(/^private-/, "");
}

export async function buildRsvpTicketAttachments(env, options) {
  const ticketId =
    options.ticketId || `gwenda-${options.eventSlug || "event"}-${Date.now()}`;
  const attachmentBase = ticketAttachmentBaseName(options.eventSlug);
  const ics = buildCalendarTicket({
    ticketId,
    title: formatTicketTitle(options.title),
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
