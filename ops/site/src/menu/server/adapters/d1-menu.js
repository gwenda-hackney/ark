/**
 * MenuRepository on D1 (#127): the menu and inventory tables of the ops
 * database (db/ops/migrations/0005_menu.sql). The only menu code that knows
 * them. A drink's POS menus live in the menu_item_pos_menus junction; the
 * foreign keys do what removing a record takes with it (menu-model.js
 * CASCADES).
 *
 * write() puts its changes in batches (one transaction each, COPY_BATCH
 * statements), so a save stays inside the free plan's 50 queries a request.
 */
import { batch, insertRows, statement } from "../../../../../../shared/d1.js";
import {
  COPY_BATCH,
  d1Table,
  importTables,
} from "../../../../../../shared/d1-table.js";
import {
  MENU_COLLECTIONS,
  MENU_COLLECTION_NAMES,
  fieldSpec,
  menuFields,
  menuRecord,
  notFound,
  parentsFirst,
  whereLinks,
} from "../menu-model.js";

const D1_TYPES = {
  text: "text",
  number: "int",
  bool: "bool",
  link: "int",
  json: "json",
};

/** d1Table columns from a collection's fields: snake_case, `order` as sort_order. */
function columnsOf(collection) {
  const columns = { id: "int" };
  for (const [key, spec] of Object.entries(MENU_COLLECTIONS[collection])) {
    const { kind } = fieldSpec(spec);
    if (kind === "links") continue;
    columns[key] =
      key === "order"
        ? { column: "sort_order", type: D1_TYPES[kind] }
        : D1_TYPES[kind];
  }
  return columns;
}

export const menuTables = Object.fromEntries(
  MENU_COLLECTION_NAMES.map((name) => [
    name,
    d1Table({ table: name, columns: columnsOf(name), orderBy: "id" }),
  ]),
);

const JUNCTION = "menu_item_pos_menus";

/** The junction as importTables takes a table. */
const junctionTable = {
  table: JUNCTION,
  importStatements: (db, rows) => [
    statement(db, `DELETE FROM ${JUNCTION}`),
    ...insertRows(db, JUNCTION, ["item_id", "pos_menu_id"], rows),
  ],
};

function columnOf(collection, key) {
  return menuTables[collection].columns.find((spec) => spec.key === key).column;
}

/** A row as stored → a record; text columns may be NULL in rows written by hand. */
function recordOf(collection, row, posMenuIds) {
  if (!row) return null;
  const record = menuRecord(collection, menuTables[collection].toRecord(row));
  if (collection === "menu_items") record.posMenuIds = posMenuIds ?? [];
  return record;
}

/** Fields → the row values to write: cleaned, with "" kept as "" (NOT NULL text columns). */
function rowFields(collection, fields) {
  const { posMenuIds: _links, ...clean } = menuFields(collection, fields);
  return clean;
}

export function d1MenuRepository(db) {
  async function posMenusOf(itemIds) {
    const rows =
      (
        await statement(
          db,
          `SELECT item_id, pos_menu_id FROM ${JUNCTION}${itemIds ? " WHERE item_id IN (SELECT value FROM json_each(?))" : ""} ORDER BY item_id, pos_menu_id`,
          itemIds ? [JSON.stringify(itemIds)] : [],
        ).all()
      ).results || [];
    const byItem = new Map();
    for (const row of rows) {
      const list = byItem.get(Number(row.item_id)) ?? [];
      list.push(Number(row.pos_menu_id));
      byItem.set(Number(row.item_id), list);
    }
    return byItem;
  }

  async function list(collection, where) {
    const links = whereLinks(collection, where);
    const keys = Object.keys(links);
    const rows = await menuTables[collection].list(db, {
      where: keys
        .map((key) =>
          links[key] == null
            ? `${columnOf(collection, key)} IS NULL`
            : `${columnOf(collection, key)} = ?`,
        )
        .join(" AND "),
      params: keys.filter((key) => links[key] != null).map((key) => links[key]),
    });
    if (collection !== "menu_items")
      return rows.map((row) => menuRecord(collection, row));
    const posMenus = await posMenusOf(
      keys.length ? rows.map((row) => row.id) : null,
    );
    return rows.map((row) => ({
      ...menuRecord(collection, row),
      posMenuIds: posMenus.get(row.id) ?? [],
    }));
  }

  async function get(collection, id) {
    const row = await menuTables[collection].get(db, id);
    if (!row) return null;
    const record = menuRecord(collection, row);
    if (collection === "menu_items")
      record.posMenuIds = (await posMenusOf([row.id])).get(row.id) ?? [];
    return record;
  }

  const selectRow = (collection, id) =>
    statement(db, `SELECT * FROM ${collection} WHERE id = ?`, [Number(id)]);
  const selectPosMenus = (id) =>
    statement(
      db,
      `SELECT pos_menu_id FROM ${JUNCTION} WHERE item_id = ? ORDER BY pos_menu_id`,
      [Number(id)],
    );
  const setPosMenus = (id, posMenuIds) => [
    statement(db, `DELETE FROM ${JUNCTION} WHERE item_id = ?`, [Number(id)]),
    ...insertRows(
      db,
      JUNCTION,
      ["item_id", "pos_menu_id"],
      posMenuIds.map((posMenuId) => ({
        item_id: Number(id),
        pos_menu_id: posMenuId,
      })),
    ),
  ];

  /**
   * Apply changes in order. Each becomes statements whose results are read
   * back into its record; a new drink with POS menus is inserted first, on
   * its own, since the junction needs its id.
   */
  async function write(changes) {
    const list = changes || [];
    const out = new Array(list.length).fill(null);
    let queued = [];
    let readers = [];
    const enqueue = (stmt) => {
      const slot = { stmt, results: [] };
      queued.push(slot);
      return () => slot.results;
    };
    const flush = async () => {
      for (let i = 0; i < queued.length; i += COPY_BATCH) {
        const chunk = queued.slice(i, i + COPY_BATCH);
        const results = await batch(
          db,
          chunk.map((slot) => slot.stmt),
        );
        chunk.forEach(
          (slot, offset) => (slot.results = results[offset]?.results ?? []),
        );
      }
      const pending = readers;
      queued = [];
      readers = [];
      for (const read of pending) read();
    };

    for (const [index, change] of list.entries()) {
      const { op, collection } = change;
      const table = menuTables[collection];
      if (!table) throw new Error(`Unknown menu collection "${collection}".`);
      if (op === "remove") {
        enqueue(table.removeStatement(db, change.id));
        continue;
      }
      const fields = rowFields(collection, change.fields);
      const posMenuIds =
        collection === "menu_items"
          ? menuFields(collection, change.fields).posMenuIds
          : undefined;
      if (op === "create") {
        const row = menuRecord(collection, fields);
        delete row.id;
        if (posMenuIds?.length) {
          await flush();
          const created = await table.insertStatement(db, row).first();
          await batch(db, setPosMenus(created.id, posMenuIds));
          out[index] = recordOf(collection, created, posMenuIds);
          continue;
        }
        const rows = enqueue(table.insertStatement(db, row));
        readers.push(() => (out[index] = recordOf(collection, rows()[0], [])));
        continue;
      }
      if (op !== "update") throw new Error(`Unknown change "${op}".`);
      const rows = enqueue(
        table.patchStatement(db, change.id, fields) ??
          selectRow(collection, change.id),
      );
      if (posMenuIds)
        for (const stmt of setPosMenus(change.id, posMenuIds)) enqueue(stmt);
      const links =
        collection === "menu_items" ? enqueue(selectPosMenus(change.id)) : null;
      readers.push(() => {
        const row = rows()[0];
        if (!row) throw notFound(collection);
        out[index] = recordOf(
          collection,
          row,
          links?.().map((link) => Number(link.pos_menu_id)),
        );
      });
    }
    await flush();
    return out;
  }

  return {
    list,
    get,
    async create(collection, fields) {
      return (await write([{ op: "create", collection, fields }]))[0];
    },
    async update(collection, id, fields) {
      return (await write([{ op: "update", collection, id, fields }]))[0];
    },
    async remove(collection, id) {
      await write([{ op: "remove", collection, id }]);
    },
    write,
    async exportAll() {
      const out = {};
      for (const name of MENU_COLLECTION_NAMES) out[name] = await list(name);
      return out;
    },
    async importAll(snapshot) {
      const records = (name) =>
        (snapshot?.[name] || []).map((record) => menuRecord(name, record));
      const items = records("menu_items");
      const pairs = MENU_COLLECTION_NAMES.map((name) => {
        const rows =
          name === "menu_sections"
            ? parentsFirst(records(name))
            : records(name);
        return [
          menuTables[name],
          rows.map((record) => ({ id: record.id, ...rowFields(name, record) })),
        ];
      });
      // The junction after both of its tables.
      pairs.splice(MENU_COLLECTION_NAMES.indexOf("menu_items") + 1, 0, [
        junctionTable,
        items.flatMap((item) =>
          item.posMenuIds.map((posMenuId) => ({
            item_id: item.id,
            pos_menu_id: posMenuId,
          })),
        ),
      ]);
      await importTables(db, pairs);
    },
  };
}
