/**
 * VenueRepository on D1 (#240). The opening hours are the `opening_hours`
 * table of the ops database (db/ops/migrations/0010_opening_hours.sql), one
 * row per day, Monday id 1 to Sunday id 7; the party facts are the one row
 * (id 1) of `venue_parties` (0011_venue_parties.sql); the gallery is
 * `venue_gallery` (0013_venue_gallery.sql, #291), one row a photo, in
 * `position` order. The only venue code that knows them. A save writes all
 * seven days in one batch, so the week is never half saved; the party facts
 * are one row, written whole. Adding photos is one batch and putting the
 * gallery in a new order one statement, so the order is never half changed.
 */
import { batch, run, statement } from "../../../../../../shared/d1.js";
import { d1Table, exportTables, importTables } from "../../../../../../shared/d1-table.js";
import { galleryPhoto } from "../../gallery-model.js";
import { DAYS, openingDay } from "../../hours-model.js";
import { partyFacts } from "../../parties-model.js";

export const hoursTable = d1Table({
  table: "opening_hours",
  columns: {
    id: "int",
    day: "text",
    closed: "bool",
    opens: "text",
    closes: "text",
    updatedAt: "text",
    updatedBy: "text",
  },
  orderBy: "id",
});

export const partiesTable = d1Table({
  table: "venue_parties",
  columns: {
    id: "int",
    standing: "int",
    seated: "int",
    included: "text",
    replyWithin: "text",
    updatedAt: "text",
    updatedBy: "text",
  },
});

export const galleryTable = d1Table({
  table: "venue_gallery",
  columns: {
    id: "int",
    key: { column: "photo_key", type: "text" },
    asset: "text",
    description: "text",
    menu: "text",
    position: "int",
    added: { column: "added_at", type: "text" },
    addedBy: "text",
  },
  orderBy: "position, id",
});

/** The party facts are one row. */
const PARTIES_ID = 1;

/** Every table the venue's details live in: what a copy of them takes (scripts/lib/d1-rehearsal.mjs). */
export const VENUE_D1_TABLES = [hoursTable.table, partiesTable.table, galleryTable.table];

function hoursRows({ days = [], updatedAt = "", updatedBy = "" }) {
  return days.map((raw) => {
    const day = openingDay(raw);
    return { id: DAYS.indexOf(day.day) + 1, ...day, updatedAt: updatedAt || "", updatedBy: updatedBy || "" };
  });
}

/** Seven rows → the week; anything else (never saved) → null. */
function weekOf(rows) {
  if (rows.length !== DAYS.length) return null;
  return {
    days: rows.map((row) => openingDay(row)),
    updatedAt: rows[0].updatedAt || "",
    updatedBy: rows[0].updatedBy || "",
  };
}

/** The row → the facts with who and when; no row (never saved) → null. */
function partiesOf(row) {
  if (!row) return null;
  return { ...partyFacts(row), updatedAt: row.updatedAt || "", updatedBy: row.updatedBy || "" };
}

/** Gallery rows → the photos; a row that isn't one is left out. */
const photosOf = (rows) => rows.map(galleryPhoto).filter(Boolean);

export function d1VenueRepository(db) {
  const getOpeningHours = async () => weekOf(await hoursTable.list(db));
  const getParties = async () => partiesOf(await partiesTable.get(db, PARTIES_ID));
  const listGallery = async () => photosOf(await galleryTable.list(db));
  const galleryRow = async (key) =>
    (await galleryTable.list(db, { where: "photo_key = ?", params: [String(key ?? "")] }))[0] || null;
  return {
    getOpeningHours,
    async saveOpeningHours(week) {
      await batch(
        db,
        hoursRows(week).map((row) => hoursTable.upsertStatement(db, row, ["id"])),
      );
      return getOpeningHours();
    },
    getParties,
    async saveParties({ updatedAt = "", updatedBy = "", ...facts }) {
      const row = { id: PARTIES_ID, ...partyFacts(facts), updatedAt: updatedAt || "", updatedBy: updatedBy || "" };
      return partiesOf(await partiesTable.upsert(db, row, ["id"]));
    },
    listGallery,
    async addGalleryPhotos(photos) {
      const assets = new Set((await galleryTable.list(db)).map((row) => row.asset));
      const fresh = [];
      for (const photo of (photos || []).map(galleryPhoto)) {
        if (!photo || assets.has(photo.asset)) continue;
        assets.add(photo.asset);
        fresh.push(photo);
      }
      if (fresh.length) {
        // The photos there move down to make room at the top.
        await batch(db, [
          statement(db, `UPDATE ${galleryTable.table} SET position = position + ?`, [fresh.length]),
          ...fresh.map((photo, index) => galleryTable.insertStatement(db, { ...photo, position: index })),
        ]);
      }
      return listGallery();
    },
    async updateGalleryPhoto(key, changes = {}) {
      const row = await galleryRow(key);
      if (!row) return null;
      const fields = {
        ...(changes.description !== undefined ? { description: changes.description } : {}),
        ...(changes.menu !== undefined ? { menu: changes.menu } : {}),
      };
      return galleryPhoto(await galleryTable.patch(db, row.id, fields));
    },
    async orderGallery(keys) {
      // One statement: a photo's place is its key's index in the list (one
      // parameter, however long the gallery); any it leaves out go after.
      const order = (keys || []).map(String);
      await run(
        db,
        `UPDATE ${galleryTable.table} SET position = COALESCE(` +
          "(SELECT CAST(list.key AS INTEGER) FROM json_each(?) AS list WHERE list.value = photo_key), " +
          "? + position)",
        [JSON.stringify(order), order.length],
      );
      return listGallery();
    },
    async removeGalleryPhoto(key) {
      await run(db, `DELETE FROM ${galleryTable.table} WHERE photo_key = ?`, [String(key ?? "")]);
      return listGallery();
    },
    async exportAll() {
      const tables = await exportTables(db, [hoursTable, partiesTable, galleryTable]);
      return {
        openingHours: tables[hoursTable.table],
        parties: tables[partiesTable.table],
        gallery: tables[galleryTable.table],
      };
    },
    async importAll(snapshot) {
      await importTables(db, [
        [hoursTable, snapshot.openingHours || []],
        [partiesTable, snapshot.parties || []],
        [galleryTable, snapshot.gallery || []],
      ]);
    },
  };
}
