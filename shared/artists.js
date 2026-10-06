/**
 * Wall artists, as ops stores them in the Gwenda Ops database: one current
 * guest, one next, any number of previous. Ops edits them
 * (ops/site/src/artists/server/artist-store.js); the website reads them.
 *
 * Their photos live in Sanity (#183): the row keeps asset ids ("Portrait
 * asset", and JSON lists in "Art assets" and "Gwenda assets"), and both ops
 * and the website show them from cdn.sanity.io. A row whose photos are still
 * Baserow files (Portrait, Art, Gwenda photos) shows those until the backfill
 * moves them.
 */
import { TABLE_ARTISTS, listAllRows, resolveOpsTableIds } from "./baserow.js";
import { parseImageAssetId, sanityImageUrl } from "./sanity-image.js";
import { REAL_SANITY_PROJECT_ID } from "./sanity-projects.js";
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

/** The Sanity project the photos are in: the one this runtime reads and writes. */
export function artistImageProject(env = {}) {
  return text(env.SANITY_PROJECT_ID) || REAL_SANITY_PROJECT_ID;
}

/** Sizes the website and ops ask the CDN for; never larger than the upload. */
const FULL = { w: 2000, fit: "max", auto: "format" };
const THUMB = { w: 400, fit: "max", auto: "format" };

/** A photo from before #183: a Baserow file. */
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

/** One stored photo of a list: { asset, label }, or null when it isn't one. */
export function storedArtistAsset(entry) {
  const asset = text(entry?.asset);
  if (!parseImageAssetId(asset)) return null;
  return { asset, label: text(entry?.label) };
}

/**
 * A stored list of photos ("Art assets", "Gwenda assets"): [] or more once
 * the photos are in Sanity, null while they are still Baserow files.
 */
export function parseArtistAssets(value) {
  const raw = text(value);
  if (!raw) return null;
  let list;
  try {
    list = JSON.parse(raw);
  } catch {
    return null;
  }
  return Array.isArray(list) ? list.map(storedArtistAsset).filter(Boolean) : null;
}

function imagesFrom(assets, files, projectId) {
  if (!assets) return filesFrom(files);
  return assets.map((entry) => artistImage(entry.asset, entry.label, projectId)).filter(Boolean);
}

export function mapArtist(row, { projectId = REAL_SANITY_PROJECT_ID } = {}) {
  if (!row || row.id == null) return null;
  const slot = normalizeArtistSlot(row.Slot);
  if (!slot) return null;
  const portraitAsset = text(row["Portrait asset"]);
  const portrait = parseImageAssetId(portraitAsset)
    ? artistImage(portraitAsset, "", projectId)
    : filesFrom(row.Portrait)[0] || null;
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
    art: imagesFrom(parseArtistAssets(row["Art assets"]), row.Art, projectId),
    gwenda: imagesFrom(parseArtistAssets(row["Gwenda assets"]), row["Gwenda photos"], projectId),
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
  const options = { projectId: artistImageProject(env) };
  return orderArtists(rows.map((row) => mapArtist(row, options)));
}

export async function listArtists(env) {
  const tableId = requireArtistsTable(await resolveOpsTableIds(env));
  return loadArtists(env, tableId);
}
