/**
 * The artists domain (#186): wall artists and guest artists as records, the
 * rules every adapter keeps them by, and how ops and the website show them.
 * No storage here: adapters (d1-artists.js, memory-artists.js) turn
 * records into rows.
 *
 * ArtistRecord: { id, name, slot, artistName, website, profile, bio,
 *   startMonth, endMonth, portrait, art, gwenda }
 * - id: number
 * - slot: "current" | "next" | "previous", or "" for a row that isn't one
 * - startMonth / endMonth: "1"–"12" or ""
 * - portrait: Photo or null; art, gwenda: Photo[]
 * Photo: { asset, label }, a Sanity image asset (#183).
 *
 * GuestArtistRecord: { id, email, decision, artistName, artistLink }, one per
 * email (lower case). decision: "Approved", "Declined" or "".
 */
import { parseImageAssetId, sanityImageUrl } from "../sanity-image.js";
import { REAL_SANITY_PROJECT_ID } from "../sanity-projects.js";
import { parseProductUrl } from "../web-address.js";

export const ARTIST_SLOTS = ["current", "next", "previous"];
const SLOT_RANK = { current: 0, next: 1, previous: 2 };
export const DECISIONS = ["Approved", "Declined"];

export function text(value) {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  if (typeof value === "object" && value.value != null) {
    return String(value.value).trim();
  }
  return String(value).trim();
}

export function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

export function artistNotFound() {
  const error = new Error("Artist not found.");
  error.status = 404;
  return error;
}

export function normalizeArtistSlot(value) {
  const raw = text(value).toLowerCase();
  return ARTIST_SLOTS.includes(raw) ? raw : "";
}

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/** Store a month as "1"–"12". Blank stays blank. */
export function normalizeArtistMonth(value) {
  const raw = text(value).toLowerCase();
  if (!raw) return "";
  const number = Number(raw);
  if (Number.isInteger(number) && number >= 1 && number <= 12)
    return String(number);
  const index = MONTH_NAMES.findIndex(
    (name) => name.startsWith(raw) && raw.length >= 3,
  );
  return index >= 0 ? String(index + 1) : "";
}

/** A Sanity photo as kept: { asset, label }, or null when it isn't one. */
export function sanityPhoto(entry) {
  const asset = text(entry?.asset);
  if (!parseImageAssetId(asset)) return null;
  return { asset, label: text(entry?.label) };
}

/** A portrait keeps no label of its own. */
function portraitPhoto(entry) {
  const photo = sanityPhoto(entry);
  return photo ? { asset: photo.asset, label: "" } : null;
}

function photos(list) {
  return Array.isArray(list) ? list.map(sanityPhoto).filter(Boolean) : [];
}

/** A full ArtistRecord from any fields, cleaned the way every adapter keeps them. */
export function artistRecord(fields = {}) {
  return {
    id: fields.id == null || fields.id === "" ? null : Number(fields.id),
    name: text(fields.name),
    slot: normalizeArtistSlot(fields.slot),
    artistName: text(fields.artistName),
    website: text(fields.website),
    profile: text(fields.profile),
    bio: text(fields.bio),
    startMonth: normalizeArtistMonth(fields.startMonth),
    endMonth: normalizeArtistMonth(fields.endMonth),
    portrait: portraitPhoto(fields.portrait),
    art: photos(fields.art),
    gwenda: photos(fields.gwenda),
  };
}

/**
 * True for a record with nothing in it at all. A
 * row with no slot but anything else is kept: it may be an artist being
 * prepared.
 */
export function isBlankArtist(record) {
  const r = artistRecord(record);
  return (
    !r.name &&
    !r.slot &&
    !r.artistName &&
    !r.website &&
    !r.profile &&
    !r.bio &&
    !r.startMonth &&
    !r.endMonth &&
    !r.portrait &&
    !r.art.length &&
    !r.gwenda.length
  );
}

/** Only the given fields of an ArtistRecord, cleaned (for update). */
export function artistPatch(fields = {}) {
  const full = artistRecord(fields);
  return Object.fromEntries(
    Object.keys(full)
      .filter((key) => key !== "id" && fields[key] !== undefined)
      .map((key) => [key, full[key]]),
  );
}

export function emailKey(value) {
  return text(value).toLowerCase();
}

/** A full GuestArtistRecord, cleaned. */
export function guestArtistRecord(fields = {}) {
  const decision = text(fields.decision);
  return {
    id: fields.id == null || fields.id === "" ? null : Number(fields.id),
    email: emailKey(fields.email),
    decision: DECISIONS.includes(decision) ? decision : "",
    artistName: text(fields.artistName),
    artistLink: text(fields.artistLink),
  };
}

/** Only the given guest artist fields (decision, artistName, artistLink), cleaned. */
export function guestArtistPatch(fields = {}) {
  const full = guestArtistRecord(fields);
  return Object.fromEntries(
    ["decision", "artistName", "artistLink"]
      .filter((key) => fields[key] !== undefined)
      .map((key) => [key, full[key]]),
  );
}

// ------------------------------------------------------------------ views

/** The Sanity project the photos are in: the one this runtime reads and writes. */
export function artistImageProject(env = {}) {
  return text(env.SANITY_PROJECT_ID) || REAL_SANITY_PROJECT_ID;
}

/** Sizes the website and ops ask the CDN for; never larger than the upload. */
const FULL = { w: 2000, fit: "max", auto: "format" };
const THUMB = { w: 400, fit: "max", auto: "format" };

/**
 * A Sanity photo as ops and the website show it. `name` is the asset id: ops
 * removes a photo by it.
 */
export function artistImage(asset, label, projectId) {
  if (!parseImageAssetId(asset)) return null;
  return {
    name: asset,
    asset,
    label: text(label),
    url: sanityImageUrl(projectId, asset, FULL),
    thumb: sanityImageUrl(projectId, asset, THUMB),
  };
}

/** A photo as shown: from the Sanity CDN. */
function photoView(photo, projectId) {
  if (!photo) return null;
  return artistImage(photo.asset, photo.label, projectId);
}

/** An artist as ops and the website show them; null for a row with no slot. */
export function artistView(
  record,
  { projectId = REAL_SANITY_PROJECT_ID } = {},
) {
  if (!record || record.id == null || !record.slot) return null;
  return {
    id: String(record.id),
    slot: record.slot,
    name: record.name,
    artistName: record.artistName,
    website: parseProductUrl(record.website) || "",
    profile: record.profile,
    bio: record.bio,
    startMonth: record.startMonth,
    endMonth: record.endMonth,
    portrait: photoView(record.portrait, projectId),
    art: record.art.map((photo) => photoView(photo, projectId)).filter(Boolean),
    gwenda: record.gwenda
      .map((photo) => photoView(photo, projectId))
      .filter(Boolean),
  };
}

/** Current, then next, then previous by name. */
export function orderArtists(artists) {
  return [...(artists || [])].filter(Boolean).sort((a, b) => {
    const rank = (SLOT_RANK[a.slot] ?? 9) - (SLOT_RANK[b.slot] ?? 9);
    if (rank) return rank;
    const name = String(a.name).localeCompare(String(b.name), undefined, {
      sensitivity: "base",
    });
    if (name) return name;
    return Number(a.id) - Number(b.id);
  });
}
