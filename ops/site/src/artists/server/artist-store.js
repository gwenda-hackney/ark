/**
 * Wall artists. One current guest, one next, and any number of previous.
 * Photos: a portrait, their art, and pictures taken at Gwenda. They upload
 * straight to Sanity (#183) and the artist keeps their asset ids.
 * Use cases over the ArtistRepository (shared/artists/artist-repository.js);
 * listing them (listArtists) is shared with the website: shared/artists.js.
 */
import {
  artistImageProject,
  artistRepository,
  artistView,
  normalizeArtistMonth,
  normalizeArtistSlot,
} from "../../../../../shared/artists.js";
import { fail, isFilePhoto, text } from "../../../../../shared/artists/artist-model.js";
import { parseImageAssetId } from "../../../../../shared/sanity-image.js";
import { normalizeWebsite } from "../../../../../shared/web-address.js";
import { sanityUploadImage } from "../../platform/sanity.js";

const SINGLE_SLOTS = new Set(["current", "next"]);
const IMAGE_KINDS = new Set(["portrait", "art", "gwenda"]);

/** An artist as ops shows them: photos from the Sanity project ops writes to. */
function view(env, record, message = "Artist not found.") {
  const artist = artistView(record, { projectId: artistImageProject(env) });
  if (!artist) fail(record ? 502 : 404, message);
  return artist;
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
    name,
    artistName,
    slot,
    website,
    profile: text(input?.profile),
    bio: text(input?.bio),
    startMonth,
    endMonth,
  };
}

/** Current and next are singular. The artist who held the badge moves to previous. */
async function releaseSlot(artists, slot, exceptId) {
  if (!SINGLE_SLOTS.has(slot)) return;
  const except = String(exceptId || "");
  for (const artist of await artists.listArtists()) {
    if (artist.slot !== slot || String(artist.id) === except) continue;
    await artists.updateArtist(artist.id, { slot: "previous" });
  }
}

function artistId(id) {
  const rowId = String(id || "").trim();
  if (!rowId) fail(400, "Missing id.");
  return rowId;
}

/** The stored record (photos as kept, not as shown); a 404 for a row that isn't an artist. */
async function artistRecordOf(artists, id) {
  const record = await artists.getArtist(artistId(id));
  if (!record?.slot) fail(404, "Artist not found.");
  return record;
}

export async function getArtist(env, id) {
  return view(env, await artistRecordOf(artistRepository(env), id));
}

export async function createArtist(env, input) {
  const artists = artistRepository(env);
  const fields = fieldsFromInput(input || {});
  await releaseSlot(artists, fields.slot, "");
  return view(env, await artists.createArtist(fields), "Could not read the artist after saving.");
}

export async function updateArtist(env, id, input) {
  const artists = artistRepository(env);
  const rowId = artistId(id);
  const fields = fieldsFromInput(input || {});
  await releaseSlot(artists, fields.slot, rowId);
  return view(env, await artists.updateArtist(rowId, fields), "Could not read the artist after saving.");
}

export async function deleteArtist(env, id) {
  const artists = artistRepository(env);
  const rowId = artistId(id);
  await artistRecordOf(artists, rowId);
  await artists.removeArtist(rowId);
  return { ok: true, id: rowId };
}

function imageKind(value) {
  const kind = text(value).toLowerCase();
  if (!IMAGE_KINDS.has(kind)) fail(400, "Choose portrait, art, or Gwenda photos.");
  return kind;
}

/** Upload a photo to Sanity; the asset is the photo's only copy (#183). */
async function uploadArtistPhoto(env, bytes, { filename, contentType }) {
  const asset = await sanityUploadImage(env, bytes, { filename, contentType });
  if (!parseImageAssetId(asset?._id)) fail(502, "The photo didn't upload to Sanity.");
  return asset._id;
}

/**
 * Add a photo: a new portrait replaces the old one, art and Gwenda photos
 * add to the list. A list still in Baserow files waits for the backfill.
 */
export async function setArtistImage(env, id, bytes, { filename, contentType, kind }) {
  const image = imageKind(kind);
  const artists = artistRepository(env);
  const record = await artistRecordOf(artists, id);
  if (image !== "portrait" && record[image].some(isFilePhoto)) {
    fail(409, "These photos are still being moved to Sanity. Try again after the next deploy.");
  }
  const asset = await uploadArtistPhoto(env, bytes, { filename, contentType });
  const fields =
    image === "portrait"
      ? { portrait: { asset } }
      : {
          [image]: [...record[image].filter((photo) => photo.asset !== asset), { asset, label: text(filename) }],
        };
  return view(env, await artists.updateArtist(record.id, fields), "Could not read the artist after adding the photo.");
}

/**
 * Take a photo off the artist (`name`: its asset id, or a file name from
 * before). The Sanity asset stays: the live site may still show it.
 */
export async function clearArtistImage(env, id, { kind, name }) {
  const image = imageKind(kind);
  const artists = artistRepository(env);
  const record = await artistRecordOf(artists, id);
  const key = text(name);
  const fields =
    image === "portrait"
      ? { portrait: null }
      : { [image]: record[image].filter((photo) => (photo.asset || photo.name) !== key) };
  return view(env, await artists.updateArtist(record.id, fields), "Could not read the artist after removing the photo.");
}
