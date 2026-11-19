/**
 * SeasonRepository on D1 (#353): the `seasons` table of the ops database
 * (db/ops/migrations/0018_seasons.sql), one row a season. The only seasons
 * code that knows it.
 */
import { d1Table, exportTables, importTables } from "../../../../../../shared/d1-table.js";
import { season } from "../../season-model.js";

export const seasonsTable = d1Table({
  table: "seasons",
  columns: {
    id: "int",
    name: "text",
    line: "text",
    included: "text",
    covers: "text",
    showFrom: "text",
    showUntil: "text",
    imageAsset: "text",
    imageAlt: "text",
    updatedAt: "text",
    updatedBy: "text",
  },
  orderBy: "id",
});

/** Every table seasons live in: what a copy of them takes. */
export const SEASON_D1_TABLES = [seasonsTable.table];

function rowOf({ id, updatedAt = "", updatedBy = "", ...raw }) {
  const value = season(raw);
  return {
    ...(id != null ? { id } : {}),
    name: value.name,
    line: value.line,
    included: value.included,
    covers: value.covers,
    showFrom: value.showFrom,
    showUntil: value.showUntil,
    imageAsset: value.image?.asset || "",
    imageAlt: value.image?.alt || "",
    updatedAt: updatedAt || "",
    updatedBy: updatedBy || "",
  };
}

const seasonOf = (row) => (row ? season(row) : null);

export function d1SeasonRepository(db) {
  return {
    async list() {
      return (await seasonsTable.list(db)).map(seasonOf);
    },
    async get(id) {
      return seasonOf(await seasonsTable.get(db, Number(id)));
    },
    async create(value) {
      const { id: _ignored, ...rest } = value;
      return seasonOf(await seasonsTable.insert(db, rowOf(rest)));
    },
    async update(id, value) {
      const current = await seasonsTable.get(db, Number(id));
      if (!current) return null;
      const { id: _ignored, ...row } = rowOf(value);
      return seasonOf(await seasonsTable.patch(db, Number(id), row));
    },
    async remove(id) {
      await seasonsTable.remove(db, Number(id));
    },
    async exportAll() {
      const tables = await exportTables(db, [seasonsTable]);
      return { seasons: tables[seasonsTable.table] };
    },
    async importAll(snapshot) {
      await importTables(db, [[seasonsTable, snapshot.seasons || []]]);
    },
  };
}
