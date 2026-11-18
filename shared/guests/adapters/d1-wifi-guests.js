/**
 * WifiGuestRepository on D1 (website database, db/website/migrations).
 * Email is unique without regard to case, so an address has one record.
 */
import { first } from "../../d1.js";
import { d1Table, exportTables, importTables } from "../../d1-table.js";

export const wifiGuestsTable = d1Table({
  table: "wifi_guests",
  columns: {
    id: "int",
    email: "text",
    firstSeenOn: "date",
    lastSeenOn: "date",
  },
  orderBy: "id",
});

const COLUMNS = wifiGuestsTable.columns.map((c) => c.column).join(", ");

/** @param {object} db  a D1 binding, or anything shaped like one */
export function d1WifiGuestRepository(db) {
  return {
    async recordVisit({ email, on }) {
      // One statement, so two visits at once can't make two records.
      return wifiGuestsTable.toRecord(
        await first(
          db,
          `INSERT INTO wifi_guests (email, first_seen_on, last_seen_on) VALUES (?, ?, ?) ` +
            `ON CONFLICT(email) DO UPDATE SET last_seen_on = excluded.last_seen_on ` +
            `RETURNING ${COLUMNS}`,
          [String(email), String(on), String(on)],
        ),
      );
    },
    async getByEmail(email) {
      const [guest] = await wifiGuestsTable.list(db, {
        where: "email = ?",
        params: [String(email)],
      });
      return guest ?? null;
    },
    async remove(id) {
      await wifiGuestsTable.remove(db, id);
    },
    async count() {
      return Number(
        (await first(db, "SELECT COUNT(*) AS n FROM wifi_guests"))?.n ?? 0,
      );
    },
    async exportAll() {
      const { wifi_guests } = await exportTables(db, [wifiGuestsTable]);
      return { wifiGuests: wifi_guests };
    },
    async importAll({ wifiGuests = [] }) {
      await importTables(db, [[wifiGuestsTable, wifiGuests]]);
    },
  };
}
