/**
 * Wall artists. One current guest, one next, and any number of previous.
 * Photos stay on the row: portrait, their art, and pictures taken at Gwenda.
 * Reading them (listArtists, mapArtist) is shared with the website: shared/artists.js.
 */
import {
  loadArtists,
  mapArtist,
  normalizeArtistMonth,
  normalizeArtistSlot,
  requireArtistsTable,
} from "../../../../../shared/artists.js";
import { normalizeWebsite } from "../../../../../shared/web-address.js";
import {
  createRow,
  deleteRow,
  getRow,
  resolveOpsTableIds,
  updateRow,
  uploadUserFile,
} from "../../../../../shared/baserow.js";

const SINGLE_SLOTS = new Set(["current", "next"]);
const IMAGE_KINDS = new Set(["portrait", "art", "gwenda"]);

const IMAGE_FIELDS = {
  portrait: "Portrait",
  art: "Art",
  gwenda: "Gwenda photos",
};

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
  const artist = mapArtist(await getRow(env, tableId, rowId));
  if (!artist) fail(404, "Artist not found.");
  return artist;
}

export async function createArtist(env, input) {
  const tableId = requireArtistsTable(await resolveOpsTableIds(env));
  const fields = fieldsFromInput(input || {});
  await releaseSlot(env, tableId, fields.Slot, "");
  const artist = mapArtist(await createRow(env, tableId, fields));
  if (!artist) fail(502, "Could not read the artist after saving.");
  return artist;
}

export async function updateArtist(env, id, input) {
  const tableId = requireArtistsTable(await resolveOpsTableIds(env));
  const rowId = String(id || "").trim();
  if (!rowId) fail(400, "Missing id.");
  const fields = fieldsFromInput(input || {});
  await releaseSlot(env, tableId, fields.Slot, rowId);
  const artist = mapArtist(await updateRow(env, tableId, rowId, fields));
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

export async function setArtistImage(env, id, bytes, { filename, contentType, kind }) {
  const image = imageKind(kind);
  const tableId = requireArtistsTable(await resolveOpsTableIds(env));
  const existing = await getArtist(env, id);
  const uploaded = await uploadUserFile(env, bytes, { filename, contentType });
  if (!uploaded?.name) fail(502, "The photo uploaded, but Baserow did not return a file name.");
  const field = IMAGE_FIELDS[image];
  const current =
    image === "portrait" ? [] : image === "art" ? existing.art : existing.gwenda;
  const names = [...namesOf(current), { name: uploaded.name }];
  const artist = mapArtist(await updateRow(env, tableId, existing.id, { [field]: names }));
  if (!artist) fail(502, "Could not read the artist after adding the photo.");
  return artist;
}

export async function clearArtistImage(env, id, { kind, name }) {
  const image = imageKind(kind);
  const tableId = requireArtistsTable(await resolveOpsTableIds(env));
  const existing = await getArtist(env, id);
  const field = IMAGE_FIELDS[image];
  const fileName = text(name);
  const current =
    image === "portrait"
      ? existing.portrait
        ? [existing.portrait]
        : []
      : image === "art"
        ? existing.art
        : existing.gwenda;
  const names =
    image === "portrait" && !fileName
      ? []
      : namesOf(current).filter((file) => file.name !== fileName);
  const artist = mapArtist(await updateRow(env, tableId, existing.id, { [field]: names }));
  if (!artist) fail(502, "Could not read the artist after removing the photo.");
  return artist;
}
