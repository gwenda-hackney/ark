/**
 * Wall artists, as ops stores them in the Gwenda Ops database: one current
 * guest, one next, any number of previous. Ops edits them
 * (ops/site/src/artists/server/artist-store.js); the website reads them.
 */
import { TABLE_ARTISTS, listAllRows, resolveOpsTableIds } from "./baserow.js";
import { parseProductUrl } from "./web-address.js";

export const ARTIST_SLOTS = ["current", "next", "previous"];
const SLOT_RANK = { current: 0, next: 1, previous: 2 };

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function text(value) {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  if (typeof value === "object" && value.value != null) {
    return String(value.value).trim();
  }
  return String(value).trim();
}

export function requireArtistsTable(tables) {
  if (!tables.artists) {
    fail(
      503,
      `Baserow table "${TABLE_ARTISTS}" was not found. Run npm run setup:baserow-ops.`,
    );
  }
  return tables.artists;
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
  if (Number.isInteger(number) && number >= 1 && number <= 12) return String(number);
  const index = MONTH_NAMES.findIndex(
    (name) => name.startsWith(raw) && raw.length >= 3,
  );
  return index >= 0 ? String(index + 1) : "";
}

function mapFile(entry) {
  const name = text(entry?.name);
  const label = text(entry?.visible_name) || name;
  const url = text(entry?.url);
  const thumb = text(
    entry?.thumbnails?.small?.url || entry?.thumbnails?.tiny?.url || url,
  );
  if (!name && !url) return null;
  return { name, label, url, thumb };
}

function filesFrom(value) {
  if (!Array.isArray(value)) return [];
  return value.map(mapFile).filter(Boolean);
}

export function mapArtist(row) {
  if (!row || row.id == null) return null;
  const slot = normalizeArtistSlot(row.Slot);
  if (!slot) return null;
  const portrait = filesFrom(row.Portrait)[0] || null;
  return {
    id: String(row.id),
    slot,
    name: text(row.Name),
    artistName: text(row["Artist name"]),
    website: parseProductUrl(text(row.Website)) || "",
    profile: text(row.Profile),
    bio: text(row.Bio),
    startMonth: normalizeArtistMonth(row["Start month"]),
    endMonth: normalizeArtistMonth(row["End month"]),
    portrait,
    art: filesFrom(row.Art),
    gwenda: filesFrom(row["Gwenda photos"]),
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

export async function loadArtists(env, tableId) {
  const rows = await listAllRows(env, tableId);
  return orderArtists(rows.map(mapArtist));
}

export async function listArtists(env) {
  const tableId = requireArtistsTable(await resolveOpsTableIds(env));
  return loadArtists(env, tableId);
}
