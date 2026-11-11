/**
 * VenueRepository on D1 (#240). The opening hours are the `opening_hours`
 * table of the ops database (db/ops/migrations/0010_opening_hours.sql), one
 * row per day, Monday id 1 to Sunday id 7. The only venue code that knows
 * it. A save writes all seven rows in one batch, so the week is never half
 * saved.
 */
import { batch } from "../../../../../../shared/d1.js";
import { d1Table, exportTables, importTables } from "../../../../../../shared/d1-table.js";
import { DAYS, openingDay } from "../../hours-model.js";

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

/** Every table the venue's details live in: what a copy of them takes (scripts/lib/d1-rehearsal.mjs). */
export const VENUE_D1_TABLES = [hoursTable.table];

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

export function d1VenueRepository(db) {
  const getOpeningHours = async () => weekOf(await hoursTable.list(db));
  return {
    getOpeningHours,
    async saveOpeningHours(week) {
      await batch(
        db,
        hoursRows(week).map((row) => hoursTable.upsertStatement(db, row, ["id"])),
      );
      return getOpeningHours();
    },
    async exportAll() {
      return { openingHours: (await exportTables(db, [hoursTable]))[hoursTable.table] };
    },
    async importAll(snapshot) {
      await importTables(db, [[hoursTable, snapshot.openingHours || []]]);
    },
  };
}
