/** OccasionRepository in memory (#353), for tests: the same behaviour as d1-occasions.js. */
import { occasion } from "../../occasion-model.js";

export function memoryOccasionRepository() {
  /** Rows as D1 keeps them: every field a column, a picture as two. */
  let rows = [];
  let nextId = 1;
  const toRow = (id, { updatedAt = "", updatedBy = "", ...raw }) => {
    const value = occasion(raw);
    return {
      id,
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
  };
  const occasionOf = (row) => (row ? occasion(row) : null);
  const find = (id) => rows.find((row) => row.id === Number(id));
  return {
    async list() {
      return [...rows].sort((a, b) => a.id - b.id).map(occasionOf);
    },
    async get(id) {
      return occasionOf(find(id));
    },
    async create(value) {
      const row = toRow(nextId++, value);
      rows.push(row);
      return occasionOf(row);
    },
    async update(id, value) {
      const current = find(id);
      if (!current) return null;
      const row = toRow(current.id, value);
      rows = rows.map((item) => (item.id === current.id ? row : item));
      return occasionOf(row);
    },
    async remove(id) {
      rows = rows.filter((row) => row.id !== Number(id));
    },
    async exportAll() {
      return { occasions: [...rows].sort((a, b) => a.id - b.id).map((row) => ({ ...row })) };
    },
    async importAll(snapshot) {
      rows = (snapshot.occasions || []).map((row) => ({ ...row }));
      nextId = Math.max(0, ...rows.map((row) => row.id)) + 1;
    },
  };
}
