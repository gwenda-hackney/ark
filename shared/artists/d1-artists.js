/**
 * ArtistRepository on D1 (#127): the `artists` and `guest_artists` tables of
 * the ops database (db/ops/migrations/0004_artists.sql). The only artists
 * code that knows them.
 */
import { d1Table, exportTables, importTables } from "../d1-table.js";
import {
  artistNotFound,
  artistPatch,
  artistRecord,
  emailKey,
  fail,
  guestArtistPatch,
  guestArtistRecord,
  isFilePhoto,
} from "./artist-model.js";

export const artistsTable = d1Table({
  table: "artists",
  columns: {
    id: "int",
    name: "text",
    slot: "text",
    artistName: "text",
    startMonth: "text",
    endMonth: "text",
    website: "text",
    profile: "text",
    bio: "text",
    portraitAsset: "text",
    artAssets: "json",
    gwendaAssets: "json",
  },
  orderBy: "id",
});

export const guestArtistsTable = d1Table({
  table: "guest_artists",
  columns: {
    id: "int",
    email: "text",
    decision: "text",
    artistName: "text",
    artistLink: "text",
  },
  orderBy: "id",
});

/** A row's fields → a record. */
function fromRow(row) {
  if (!row) return null;
  const { portraitAsset, artAssets, gwendaAssets, ...rest } = row;
  return artistRecord({
    ...rest,
    portrait: portraitAsset ? { asset: portraitAsset } : null,
    art: artAssets || [],
    gwenda: gwendaAssets || [],
  });
}

const assets = (list) => list.map(({ asset, label }) => ({ asset, label }));

/** Record fields → row fields. D1 holds no files: a photo still in Baserow can't come in. */
function toRow(fields, id = fields.id ?? "(new)") {
  const patch = artistPatch(fields);
  const { portrait, art, gwenda, ...row } = patch;
  for (const photo of [portrait, ...(art || []), ...(gwenda || [])]) {
    if (isFilePhoto(photo)) {
      fail(
        409,
        `Artist ${id} still has photos kept as Baserow files: run the backfill (2026-10-06-artist-images-backfill) first.`,
      );
    }
  }
  if (portrait !== undefined) row.portraitAsset = portrait?.asset || "";
  if (art !== undefined) row.artAssets = assets(art);
  if (gwenda !== undefined) row.gwendaAssets = assets(gwenda);
  return row;
}

export function d1ArtistRepository(db) {
  const listGuestArtists = () =>
    guestArtistsTable.list(db).then((rows) => rows.map(guestArtistRecord));
  return {
    async listArtists() {
      return (await artistsTable.list(db)).map(fromRow);
    },
    async getArtist(id) {
      return fromRow(await artistsTable.get(db, id));
    },
    async createArtist(fields) {
      const { id: _new, ...rest } = artistRecord(fields);
      return fromRow(await artistsTable.insert(db, toRow(rest)));
    },
    async updateArtist(id, fields) {
      const artist = fromRow(
        await artistsTable.patch(db, id, toRow(fields, id)),
      );
      if (!artist) throw artistNotFound();
      return artist;
    },
    async removeArtist(id) {
      await artistsTable.remove(db, id);
    },
    listGuestArtists,
    async saveGuestArtist(email, fields) {
      const key = emailKey(email);
      if (!key)
        fail(400, "This application has no email address to keep a record by.");
      const patch = guestArtistPatch(fields);
      // With nothing to change, the upsert returns no row for an existing email.
      const record =
        (await guestArtistsTable.upsert(db, { email: key, ...patch }, [
          "email",
        ])) ??
        (
          await guestArtistsTable.list(db, {
            where: "email = ?",
            params: [key],
          })
        )[0];
      return guestArtistRecord(record);
    },
    async exportAll() {
      const snapshot = await exportTables(db, [
        artistsTable,
        guestArtistsTable,
      ]);
      return {
        artists: snapshot.artists.map(fromRow),
        guestArtists: snapshot.guest_artists.map(guestArtistRecord),
      };
    },
    async importAll(snapshot) {
      const artists = (snapshot.artists || []).map((record) => {
        const full = artistRecord(record);
        return { id: full.id, ...toRow(full) };
      });
      const guests = (snapshot.guestArtists || []).map(guestArtistRecord);
      await importTables(db, [
        [artistsTable, artists],
        [guestArtistsTable, guests],
      ]);
    },
  };
}
