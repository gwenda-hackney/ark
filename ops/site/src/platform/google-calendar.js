/**
 * Google Calendar client for publishing ops nights.
 * Auth reuses GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON with the calendar events scope.
 */
import { parseDriveServiceAccount } from "./google-drive.js";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export const CALENDAR_TIME_ZONE = "Europe/London";
export const DEFAULT_START_TIME = "17:00";
export const DEFAULT_END_TIME = "23:00";
export const CALENDAR_LOCATION =
  "Schwartz Wharf, Hackney Wick, London E9 5AA";
export const PUBLIC_SITE_ORIGIN = "https://gwenda.co.uk";
export const CALENDAR_SYNC_LIMIT = 120;

/** @type {{ token: string, exp: number, key: string } | null} */
let cachedToken = null;

function bufferToBase64Url(buf) {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function textToBase64Url(text) {
  return bufferToBase64Url(new TextEncoder().encode(text));
}

function pemToArrayBuffer(pem) {
  const b64 = String(pem || "")
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  if (!b64) throw new Error("Service account private key is empty.");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function addDays(iso, days) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!match) return "";
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  date.setUTCDate(date.getUTCDate() + days);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fnv1a(value) {
  let hash = 0x811c9dc5;
  const text = String(value || "");
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Calendar settings URLs base64-encode the calendar id.
 * Group calendars keep the c_ prefix. That prefix is part of the id.
 */
export function normalizeCalendarId(value) {
  let id = String(value || "").trim();
  if (!id) return "";
  if (id.includes("calendar.google.com/")) {
    try {
      const url = new URL(id);
      const parts = url.pathname.split("/").filter(Boolean);
      const token = parts.at(-1) || "";
      if (token && token !== "settings" && token !== "calendar") id = token;
    } catch {
      /* keep the raw value */
    }
  }
  if (!id.includes("@")) {
    try {
      const padded = id.replace(/-/g, "+").replace(/_/g, "/");
      const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
      const decoded = atob(`${padded}${pad}`);
      if (decoded.includes("@")) id = decoded;
    } catch {
      /* not base64 */
    }
  }
  return id;
}

export function parseCalendarLink(value) {
  const raw = String(value || "").trim();
  if (!raw) return { id: "", hash: "" };
  const pipe = raw.indexOf("|");
  if (pipe === -1) return { id: "", hash: "" };
  const id = raw.slice(0, pipe);
  const hash = raw.slice(pipe + 1);
  if (!/^[A-Za-z0-9_-]+$/.test(id) || !/^[0-9a-f]{8}$/.test(hash)) {
    return { id: "", hash: "" };
  }
  return { id, hash };
}

/** A Notes value that is one of our stored calendar links, not free text. */
export function calendarLinkValue(value) {
  const parsed = parseCalendarLink(value);
  if (!parsed.id) return "";
  return formatCalendarLink(parsed.id, parsed.hash);
}

export function formatCalendarLink(id, hash) {
  const eventId = String(id || "").trim();
  if (!eventId) return "";
  const digest = String(hash || "").trim();
  return digest ? `${eventId}|${digest}` : eventId;
}

export function calendarSummary(title, artist) {
  const name = String(title || "").trim() || "Gwenda";
  const guest = String(artist || "").trim();
  if (!guest || name.toLowerCase().includes(guest.toLowerCase())) return name;
  return `${name} · ${guest}`;
}

function slotLine(slot) {
  const label = String(slot?.label || "").trim();
  if (!label) return "";
  const start = String(slot?.startTime || "").trim();
  const end = String(slot?.endTime || "").trim();
  if (start && end) return `${start}-${end} ${label}`;
  if (start) return `${start} ${label}`;
  return label;
}

export function calendarDescription({
  offer = "",
  description = "",
  nightSchedule = [],
  seriesSlug = "",
} = {}) {
  const lines = [];
  const offerText = String(offer || "").trim();
  const descriptionText = String(description || "").trim();
  if (offerText) lines.push(offerText);
  if (descriptionText) lines.push(descriptionText);
  const slots = (Array.isArray(nightSchedule) ? nightSchedule : [])
    .map(slotLine)
    .filter(Boolean);
  if (slots.length) lines.push(slots.join("\n"));
  const slug = String(seriesSlug || "").trim();
  if (slug && !/\s/.test(slug)) {
    lines.push(`${PUBLIC_SITE_ORIGIN}/whats-on/${slug}`);
  }
  return lines.join("\n\n").slice(0, 8000);
}

export function buildCalendarEvent({
  occurrenceId,
  title,
  artist,
  offer,
  description,
  nightSchedule,
  date,
  startTime,
  endTime,
  seriesSlug,
}) {
  const summary = calendarSummary(title, artist);
  const start = String(startTime || "").trim() || DEFAULT_START_TIME;
  const end = String(endTime || "").trim() || DEFAULT_END_TIME;
  const endDate = end <= start ? addDays(date, 1) : date;
  const body = {
    summary,
    location: CALENDAR_LOCATION,
    description: calendarDescription({
      offer,
      description,
      nightSchedule,
      seriesSlug,
    }),
    start: {
      dateTime: `${date}T${start}:00`,
      timeZone: CALENDAR_TIME_ZONE,
    },
    end: {
      dateTime: `${endDate}T${end}:00`,
      timeZone: CALENDAR_TIME_ZONE,
    },
  };
  const hash = fnv1a(JSON.stringify(body));
  return {
    ...body,
    extendedProperties: {
      private: {
        gwendaOccurrenceId: String(occurrenceId || ""),
        gwendaHash: hash,
      },
    },
  };
}

export function calendarEventHash(event) {
  return String(event?.extendedProperties?.private?.gwendaHash || "");
}

export function eventFallsOnDate(event, isoDate) {
  const start = event?.start || {};
  if (start.date) return start.date === isoDate;
  if (!start.dateTime) return false;
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: start.timeZone || CALENDAR_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(start.dateTime));
  return formatted === isoDate;
}

function summaryMatches(existing, summary, seriesName) {
  const value = String(existing || "").trim();
  if (!value) return false;
  if (value === summary) return true;
  const series = String(seriesName || "").trim();
  if (!series) return false;
  return value === series || value.startsWith(`${series} ·`);
}

/**
 * Adopt one existing event on that day, or insert.
 * Several title matches are left alone and a new event is inserted.
 */
export function chooseCalendarEvent(
  events,
  { summary, seriesName, occurrenceId, usedIds } = {},
) {
  const taken = usedIds instanceof Set ? usedIds : new Set();
  const list = (events || []).filter(
    (event) => event?.status !== "cancelled" && event?.id && !taken.has(event.id),
  );
  const owned = list.filter(
    (event) =>
      event.extendedProperties?.private?.gwendaOccurrenceId ===
      String(occurrenceId || ""),
  );
  if (owned.length) return { action: "adopt", event: owned[0], ambiguous: false };
  const titled = list.filter((event) => {
    if (event.extendedProperties?.private?.gwendaOccurrenceId) return false;
    return summaryMatches(event.summary, summary, seriesName);
  });
  if (titled.length === 1) {
    return { action: "adopt", event: titled[0], ambiguous: false };
  }
  return { action: "insert", event: null, ambiguous: titled.length > 1 };
}

async function mintAccessToken(account) {
  const now = Math.floor(Date.now() / 1000);
  const header = textToBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = textToBase64Url(
    JSON.stringify({
      iss: account.client_email,
      scope: CALENDAR_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${claim}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(account.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const assertion = `${unsigned}.${bufferToBase64Url(signature)}`;
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    const error = new Error(
      payload.error_description ||
        payload.error ||
        `Google token failed (${response.status}).`,
    );
    error.status = 502;
    throw error;
  }
  return {
    token: String(payload.access_token),
    exp: now + Math.max(60, Number(payload.expires_in) || 3600) - 60,
  };
}

export async function calendarAccessToken(env = {}) {
  const account = parseDriveServiceAccount(env);
  if (!account) {
    const error = new Error(
      "GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON is not configured.",
    );
    error.status = 503;
    throw error;
  }
  const cacheKey = `${account.client_email}|${CALENDAR_SCOPE}`;
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.key === cacheKey && cachedToken.exp > now) {
    return cachedToken.token;
  }
  const minted = await mintAccessToken(account);
  cachedToken = { ...minted, key: cacheKey };
  return minted.token;
}

async function calendarFetch(env, path, { method = "GET", body, query } = {}) {
  const token = await calendarAccessToken(env);
  const url = new URL(`${CALENDAR_API}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value != null && value !== "") url.searchParams.set(key, String(value));
    }
  }
  const response = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      payload.error?.message ||
        payload.error_description ||
        `Google Calendar failed (${response.status}).`,
    );
    error.status = response.status;
    throw error;
  }
  return payload;
}

export async function listCalendarEvents(env, calendarId, { timeMin, timeMax }) {
  const events = [];
  let pageToken = "";
  let pages = 0;
  do {
    const payload = await calendarFetch(
      env,
      `/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        query: {
          timeMin,
          timeMax,
          singleEvents: "true",
          orderBy: "startTime",
          maxResults: "250",
          showDeleted: "false",
          pageToken,
        },
      },
    );
    events.push(...(payload?.items || []));
    pageToken = payload?.nextPageToken || "";
    pages += 1;
  } while (pageToken && pages < 10);
  return events;
}

export async function insertCalendarEvent(env, calendarId, event) {
  return calendarFetch(
    env,
    `/calendars/${encodeURIComponent(calendarId)}/events`,
    { method: "POST", body: event },
  );
}

export async function patchCalendarEvent(env, calendarId, eventId, event) {
  return calendarFetch(
    env,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "PATCH", body: event },
  );
}

export async function deleteCalendarEvent(env, calendarId, eventId) {
  try {
    await calendarFetch(
      env,
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { method: "DELETE" },
    );
  } catch (error) {
    if (error?.status === 404 || error?.status === 410) return;
    throw error;
  }
}
