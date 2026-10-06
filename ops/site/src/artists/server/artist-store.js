/**
 * Wall artists. One current guest, one next, and any number of previous.
 * Photos: a portrait, their art, and pictures taken at Gwenda. They upload
 * straight to Sanity (#183) and the row keeps their asset ids.
 * Reading them (listArtists, mapArtist) is shared with the website: shared/artists.js.
 */
import {
  artistImageProject,
  loadArtists,
  mapArtist,
  normalizeArtistMonth,
  normalizeArtistSlot,
  parseArtistAssets,
  requireArtistsTable,
} from "../../../../../shared/artists.js";
import { parseImageAssetId } from "../../../../../shared/sanity-image.js";
import { normalizeWebsite } from "../../../../../shared/web-address.js";
import {
  createRow,
  deleteRow,
  getRow,
  resolveOpsTableIds,
  updateRow,
} from "../../../../../shared/baserow.js";
import { sanityUploadImage } from "../../platform/sanity.js";

const SINGLE_SLOTS = new Set(["current", "next"]);
const IMAGE_KINDS = new Set(["portrait", "art", "gwenda"]);

/** Where each kind of photo is kept: its Sanity asset ids, and the Baserow files from before. */
const IMAGE_FIELDS = {
  portrait: { assets: "Portrait asset", files: "Portrait" },
  art: { assets: "Art assets", files: "Art" },
  gwenda: { assets: "Gwenda assets", files: "Gwenda photos" },
};

/** Artists as ops shows them: photos from the Sanity project ops writes to. */
function mapRow(env, row) {
  return mapArtist(row, { projectId: artistImageProject(env) });
}

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

function fieldsFromInput(input, { slotRequired = true } = {}) {
  const name = text(input?.name);
  if (!name) fail(400, "Enter the artist's name.");
  if (name.length > 200) fail(400, "Name must be 200 characters or fewer.");
  const artistName = text(input?.artistName);
  if (artistName.length > 80) {
    fail(400, "Artist name must be 80 characters or fewer.");
  }
  const websiteRaw = text(input?.website);
  const website = normalizeWebsite(websiteRaw);
  if (websiteRaw && !website) {
    fail(400, "Enter a website address, or leave it blank.");
  }
  const slot = normalizeArtistSlot(input?.slot) || (slotRequired ? "previous" : "");
  if (!slot) fail(400, "Choose current, next, or previous.");
  const startRaw = text(input?.startMonth);
  const endRaw = text(input?.endMonth);
  const startMonth = normalizeArtistMonth(startRaw);
  const endMonth = normalizeArtistMonth(endRaw);
  if (startRaw && !startMonth) fail(400, "Choose a start month, or leave it blank.");
  if (endRaw && !endMonth) fail(400, "Choose an end month, or leave it blank.");
  return {
    Name: name,
    "Artist name": artistName,
    Slot: slot,
    Website: website,
    Profile: text(input?.profile),
    Bio: text(input?.bio),
    "Start month": startMonth,
    "End month": endMonth,
  };
}

/** Current and next are singular. The artist who held the badge moves to previous. */
async function releaseSlot(env, tableId, slot, exceptId) {
  if (!SINGLE_SLOTS.has(slot)) return;
  const artists = await loadArtists(env, tableId);
  const except = String(exceptId || "");
  for (const artist of artists) {
    if (artist.slot !== slot || artist.id === except) continue;
    await updateRow(env, tableId, artist.id, { Slot: "previous" });
  }
}

export async function getArtist(env, id) {
  const tableId = requireArtistsTable(await resolveOpsTableIds(env));
  const rowId = String(id || "").trim();
  if (!rowId) fail(400, "Missing id.");
  const artist = mapRow(env, await getRow(env, tableId, rowId));
  if (!artist) fail(404, "Artist not found.");
  return artist;
}

export async function createArtist(env, input) {
  const tableId = requireArtistsTable(await resolveOpsTableIds(env));
  const fields = fieldsFromInput(input || {});
  await releaseSlot(env, tableId, fields.Slot, "");
  const artist = mapRow(env, await createRow(env, tableId, fields));
  if (!artist) fail(502, "Could not read the artist after saving.");
  return artist;
}

export async function updateArtist(env, id, input) {
  const tableId = requireArtistsTable(await resolveOpsTableIds(env));
  const rowId = String(id || "").trim();
  if (!rowId) fail(400, "Missing id.");
  const fields = fieldsFromInput(input || {});
  await releaseSlot(env, tableId, fields.Slot, rowId);
  const artist = mapRow(env, await updateRow(env, tableId, rowId, fields));
  if (!artist) fail(502, "Could not read the artist after saving.");
  return artist;
}

export async function deleteArtist(env, id) {
  const tableId = requireArtistsTable(await resolveOpsTableIds(env));
  const rowId = String(id || "").trim();
  if (!rowId) fail(400, "Missing id.");
  await getArtist(env, rowId);
  await deleteRow(env, tableId, rowId);
  return { ok: true, id: rowId };
}

function imageKind(value) {
  const kind = text(value).toLowerCase();
  if (!IMAGE_KINDS.has(kind)) fail(400, "Choose portrait, art, or Gwenda photos.");
  return kind;
}

function namesOf(files) {
  return (files || [])
    .map((file) => ({ name: text(file?.name) }))
    .filter((file) => file.name);
}

/** Upload a photo to Sanity; the asset is the photo's only copy (#183). */
async function uploadArtistPhoto(env, bytes, { filename, contentType }) {
  const asset = await sanityUploadImage(env, bytes, { filename, contentType });
  if (!parseImageAssetId(asset?._id)) fail(502, "The photo didn't upload to Sanity.");
  return asset._id;
}

/** The stored row: the image columns are read as kept, not as shown. */
async function artistRow(env, tableId, id) {
  const rowId = String(id || "").trim();
  if (!rowId) fail(400, "Missing id.");
  const row = await getRow(env, tableId, rowId);
  if (!mapRow(env, row)) fail(404, "Artist not found.");
  return row;
}

async function writeImages(env, tableId, id, fields, message) {
  const artist = mapRow(env, await updateRow(env, tableId, id, fields));
  if (!artist) fail(502, message);
  return artist;
}

/**
 * Add a photo: a new portrait replaces the old one, art and Gwenda photos
 * add to the list. A list still in Baserow files waits for the backfill.
 */
export async function setArtistImage(env, id, bytes, { filename, contentType, kind }) {
  const image = imageKind(kind);
  const tableId = requireArtistsTable(await resolveOpsTableIds(env));
  const row = await artistRow(env, tableId, id);
  const field = IMAGE_FIELDS[image];
  let stored = null;
  if (image !== "portrait") {
    stored = parseArtistAssets(row[field.assets]);
    if (!stored && namesOf(row[field.files]).length) {
      fail(409, "These photos are still being moved to Sanity. Try again after the next deploy.");
    }
  }
  const asset = await uploadArtistPhoto(env, bytes, { filename, contentType });
  const value =
    image === "portrait"
      ? asset
      : JSON.stringify([
          ...(stored || []).filter((entry) => entry.asset !== asset),
          { asset, label: text(filename) },
        ]);
  return writeImages(env, tableId, row.id, { [field.assets]: value }, "Could not read the artist after adding the photo.");
}

/**
 * Take a photo off the artist (`name`: its asset id, or a file name from
 * before). The Sanity asset stays: the live site may still show it.
 */
export async function clearArtistImage(env, id, { kind, name }) {
  const image = imageKind(kind);
  const tableId = requireArtistsTable(await resolveOpsTableIds(env));
  const row = await artistRow(env, tableId, id);
  const field = IMAGE_FIELDS[image];
  const key = text(name);
  let fields;
  if (image === "portrait") {
    fields = { [field.assets]: "", [field.files]: [] };
  } else {
    const stored = parseArtistAssets(row[field.assets]);
    fields = stored
      ? { [field.assets]: JSON.stringify(stored.filter((entry) => entry.asset !== key)) }
      : { [field.files]: namesOf(row[field.files]).filter((file) => file.name !== key) };
  }
  return writeImages(env, tableId, row.id, fields, "Could not read the artist after removing the photo.");
}
