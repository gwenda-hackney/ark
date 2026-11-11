/**
 * VenueRepository on D1 (#240). The opening hours are the `opening_hours`
 * table of the ops database (db/ops/migrations/0010_opening_hours.sql), one
 * row per day, Monday id 1 to Sunday id 7; the party facts are the one row
 * (id 1) of `venue_parties` (0011_venue_parties.sql). The only venue code
 * that knows them. A save writes all seven days in one batch, so the week
 * is never half saved; the party facts are one row, written whole.
 */
import { batch } from "../../../../../../shared/d1.js";
import { d1Table, exportTables, importTables } from "../../../../../../shared/d1-table.js";
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

/** The party facts are one row. */
const PARTIES_ID = 1;

/** Every table the venue's details live in: what a copy of them takes (scripts/lib/d1-rehearsal.mjs). */
export const VENUE_D1_TABLES = [hoursTable.table, partiesTable.table];

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

export function d1VenueRepository(db) {
  const getOpeningHours = async () => weekOf(await hoursTable.list(db));
  const getParties = async () => partiesOf(await partiesTable.get(db, PARTIES_ID));
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
    async exportAll() {
      const tables = await exportTables(db, [hoursTable, partiesTable]);
      return { openingHours: tables[hoursTable.table], parties: tables[partiesTable.table] };
    },
    async importAll(snapshot) {
      await importTables(db, [
        [hoursTable, snapshot.openingHours || []],
        [partiesTable, snapshot.parties || []],
      ]);
    },
  };
}
