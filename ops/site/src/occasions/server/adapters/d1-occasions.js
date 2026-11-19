/**
 * OccasionRepository on D1 (#353): the `occasions` table of the ops database
 * (db/ops/migrations/0018_occasions.sql), one row an occasion. The only occasions
 * code that knows it.
 */
import { d1Table, exportTables, importTables } from "../../../../../../shared/d1-table.js";
import { occasion } from "../../occasion-model.js";

export const occasionsTable = d1Table({
  table: "occasions",
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

/** Every table occasions live in: what a copy of them takes. */
export const OCCASION_D1_TABLES = [occasionsTable.table];

function rowOf({ id, updatedAt = "", updatedBy = "", ...raw }) {
  const value = occasion(raw);
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

const occasionOf = (row) => (row ? occasion(row) : null);

export function d1OccasionRepository(db) {
  return {
    async list() {
      return (await occasionsTable.list(db)).map(occasionOf);
    },
    async get(id) {
      return occasionOf(await occasionsTable.get(db, Number(id)));
    },
    async create(value) {
      const { id: _ignored, ...rest } = value;
      return occasionOf(await occasionsTable.insert(db, rowOf(rest)));
    },
    async update(id, value) {
      const current = await occasionsTable.get(db, Number(id));
      if (!current) return null;
      const { id: _ignored, ...row } = rowOf(value);
      return occasionOf(await occasionsTable.patch(db, Number(id), row));
    },
    async remove(id) {
      await occasionsTable.remove(db, Number(id));
    },
    async exportAll() {
      const tables = await exportTables(db, [occasionsTable]);
      return { occasions: tables[occasionsTable.table] };
    },
    async importAll(snapshot) {
      await importTables(db, [[occasionsTable, snapshot.occasions || []]]);
    },
  };
}
