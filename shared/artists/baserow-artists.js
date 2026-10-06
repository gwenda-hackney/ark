/**
 * ArtistRepository on Baserow (#186): the "Artists" and "Guest artists"
 * tables of the ops database. The only artists code that knows their columns.
 *
 * Photos (#183): "Portrait asset" holds the portrait's Sanity asset id, and
 * "Art assets" / "Gwenda assets" JSON lists of { asset, label }. A list
 * column left empty hasn't moved yet: its photos are still the Baserow files
 * in Portrait, Art and Gwenda photos, until the backfill.
 */
import {
  TABLE_ARTISTS,
  TABLE_GUEST_ARTISTS,
  createRow,
  deleteRow,
  getRow,
  listAllRows,
  resolveOpsTableIds,
  updateRow,
} from "../baserow.js";
import {
  artistNotFound,
  artistPatch,
  artistRecord,
  emailKey,
  fail,
  guestArtistPatch,
  guestArtistRecord,
  isFilePhoto,
  sanityPhoto,
  text,
} from "./artist-model.js";

/** Where each kind of photo is kept: its Sanity asset ids, and the Baserow files from before. */
const PHOTO_COLUMNS = {
  art: { assets: "Art assets", files: "Art" },
  gwenda: { assets: "Gwenda assets", files: "Gwenda photos" },
};

export function requireArtistsTable(tables) {
  if (!tables.artists) {
    fail(
      503,
      `Baserow table "${TABLE_ARTISTS}" was not found. Run npm run setup:baserow-ops.`,
    );
  }
  return tables.artists;
}

/**
 * A stored list of photos ("Art assets", "Gwenda assets"): [] or more once
 * they are in Sanity, null while they are still Baserow files.
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
  return Array.isArray(list) ? list.map(sanityPhoto).filter(Boolean) : null;
}

/** A Baserow file → a photo from before #183. */
function filePhoto(entry) {
  const name = text(entry?.name);
  const url = text(entry?.url);
  if (!name && !url) return null;
  return {
    name,
    label: text(entry?.visible_name) || name,
    url,
    thumb: text(
      entry?.thumbnails?.small?.url || entry?.thumbnails?.tiny?.url || url,
    ),
  };
}

function filePhotos(value) {
  return Array.isArray(value) ? value.map(filePhoto).filter(Boolean) : [];
}

/** An Artists row → a record. */
export function artistFromRow(row) {
  const portraitAsset = text(row["Portrait asset"]);
  const photos = (kind) =>
    parseArtistAssets(row[PHOTO_COLUMNS[kind].assets]) ??
    filePhotos(row[PHOTO_COLUMNS[kind].files]);
  return artistRecord({
    id: row.id,
    name: row.Name,
    slot: row.Slot,
    artistName: row["Artist name"],
    website: row.Website,
    profile: row.Profile,
    bio: row.Bio,
    startMonth: row["Start month"],
    endMonth: row["End month"],
    portrait: portraitAsset
      ? { asset: portraitAsset }
      : filePhotos(row.Portrait)[0] || null,
    art: photos("art"),
    gwenda: photos("gwenda"),
  });
}

/**
 * Record fields → Artists columns. A photo list goes to the asset column,
 * or, while it still holds files from before, back to the file column.
 */
function rowFromFields(fields) {
  const patch = artistPatch(fields);
  const row = {};
  const columns = {
    name: "Name",
    slot: "Slot",
    artistName: "Artist name",
    website: "Website",
    profile: "Profile",
    bio: "Bio",
    startMonth: "Start month",
    endMonth: "End month",
  };
  for (const [key, column] of Object.entries(columns)) {
    if (patch[key] !== undefined)
      row[column] = key === "slot" ? patch[key] || null : patch[key];
  }
  if (patch.portrait !== undefined) {
    const portrait = patch.portrait;
    if (isFilePhoto(portrait)) row.Portrait = [{ name: portrait.name }];
    else {
      row["Portrait asset"] = portrait?.asset || "";
      // Taking the portrait off takes the file from before with it.
      if (!portrait) row.Portrait = [];
    }
  }
  for (const [kind, { assets, files }] of Object.entries(PHOTO_COLUMNS)) {
    const list = patch[kind];
    if (list === undefined) continue;
    if (list.some(isFilePhoto))
      row[files] = list
        .filter(isFilePhoto)
        .map((photo) => ({ name: photo.name }));
    else
      row[assets] = JSON.stringify(
        list.map(({ asset, label }) => ({ asset, label })),
      );
  }
  return row;
}

/** A Guest artists row → a record. */
export function guestArtistFromRow(row) {
  return guestArtistRecord({
    id: row.id,
    email: row.Email,
    decision: row.Decision,
    artistName: row["Artist name"],
    artistLink: row["Artist link"],
  });
}

function guestRowFromFields(fields) {
  const patch = guestArtistPatch(fields);
  const row = {};
  if (patch.decision !== undefined) row.Decision = patch.decision || null;
  if (patch.artistName !== undefined) row["Artist name"] = patch.artistName;
  if (patch.artistLink !== undefined) row["Artist link"] = patch.artistLink;
  return row;
}

async function guarded404(work) {
  try {
    return await work();
  } catch (error) {
    if (error?.status === 404) throw artistNotFound();
    throw error;
  }
}

export function baserowArtistRepository(env) {
  const tables = () => resolveOpsTableIds(env);
  const artistsTable = async () => requireArtistsTable(await tables());
  const guestTable = async () => {
    const id = (await tables()).guestArtists;
    if (!id)
      fail(
        503,
        `Baserow table "${TABLE_GUEST_ARTISTS}" was not found. Run the deploy migrations.`,
      );
    return id;
  };

  async function listArtists() {
    const rows = await listAllRows(env, await artistsTable());
    return rows.map(artistFromRow).sort((a, b) => a.id - b.id);
  }

  /** One per email, the first row wins (as ops has always read them). A missing table reads as none. */
  async function listGuestArtists() {
    const id = (await tables()).guestArtists;
    if (!id) return [];
    const seen = new Set();
    const out = [];
    for (const record of (await listAllRows(env, id))
      .map(guestArtistFromRow)
      .sort((a, b) => a.id - b.id)) {
      if (!record.email || seen.has(record.email)) continue;
      seen.add(record.email);
      out.push(record);
    }
    return out;
  }

  return {
    listArtists,
    async getArtist(id) {
      const table = await artistsTable();
      try {
        return artistFromRow(await getRow(env, table, Number(id)));
      } catch (error) {
        if (error?.status === 404) return null;
        throw error;
      }
    },
    async createArtist(fields) {
      const { id: _new, ...rest } = artistRecord(fields);
      return artistFromRow(
        await createRow(env, await artistsTable(), rowFromFields(rest)),
      );
    },
    async updateArtist(id, fields) {
      const table = await artistsTable();
      const row = rowFromFields(fields);
      return guarded404(async () =>
        artistFromRow(
          Object.keys(row).length
            ? await updateRow(env, table, Number(id), row)
            : await getRow(env, table, Number(id)),
        ),
      );
    },
    async removeArtist(id) {
      const table = await artistsTable();
      try {
        await deleteRow(env, table, Number(id));
      } catch (error) {
        if (error?.status !== 404) throw error;
      }
    },
    listGuestArtists,
    async saveGuestArtist(email, fields) {
      const key = emailKey(email);
      if (!key)
        fail(400, "This application has no email address to keep a record by.");
      const table = await guestTable();
      const row = guestRowFromFields(fields);
      const existing = (await listGuestArtists()).find(
        (record) => record.email === key,
      );
      return guestArtistFromRow(
        existing
          ? await updateRow(env, table, existing.id, row)
          : await createRow(env, table, { Email: key, ...row }),
      );
    },
    async exportAll() {
      return {
        artists: await listArtists(),
        guestArtists: await listGuestArtists(),
      };
    },
  };
}
