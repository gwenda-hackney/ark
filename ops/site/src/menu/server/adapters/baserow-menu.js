/**
 * MenuRepository on Baserow (#186): the ops database's Menu Sections, POS
 * Menus, Menu Items, Menu placements, Inventory, Ingredients, Suppliers and
 * Inventory suppliers tables. The only menu code that knows their columns.
 *
 * Writes leave out a column the table doesn't have yet (a migration adds it),
 * so a save before the migration keeps working. write() sends each run of
 * same-kind changes to one table as one batch request.
 *
 * Photos from before #183 are Baserow files: a drink whose photo hasn't been
 * moved to Sanity yet reads with `legacyPhotoUrl`. That is Baserow's alone,
 * never copied: exportAll refuses while any are left (run the photos
 * backfill), unless asked to leave them out.
 */
import {
  baserowFetch,
  fileUrl,
  getRow,
  linkHasQuery,
  listAllRows,
  resolveOpsTableIds,
} from "../../../../../../shared/baserow.js";
import { parseImageAssetId } from "../../../../../../shared/sanity-image.js";
import {
  CASCADES,
  MENU_COLLECTION_NAMES,
  matchesWhere,
  menuFields,
  menuRecord,
  notFound,
  whereLinks,
} from "../menu-model.js";

/** Collection → its table (a resolveOpsTableIds key) and each field's column and kind there. */
export const BASEROW_MENU_TABLES = {
  menu_sections: {
    table: "sections",
    columns: {
      name: ["Name", "text"],
      slug: ["Slug", "text"],
      subtitle: ["Subtitle", "text"],
      parentId: ["Parent", "link"],
      order: ["Order", "number"],
      sanityId: ["Sanity ID", "text"],
    },
  },
  pos_menus: {
    table: "posMenus",
    columns: {
      name: ["Name", "text"],
      order: ["Order", "number"],
      isDefault: ["Default", "bool"],
    },
  },
  menu_items: {
    table: "items",
    columns: {
      name: ["Name", "text"],
      sectionId: ["Section", "link"],
      menuLine: ["Menu line", "text"],
      lockMenuLine: ["Lock menu line", "bool"],
      price: ["Price", "text"],
      altPrice: ["Alt price", "text"],
      prices: ["Prices", "json"],
      drinkType: ["Drink type", "select"],
      cocktailType: ["Cocktail type", "select"],
      notes: ["Type", "text"],
      glassware: ["Glassware", "text"],
      garnish: ["Garnish", "text"],
      ice: ["Ice", "text"],
      method: ["Method", "text"],
      signature: ["Signature", "bool"],
      abv: ["ABV", "text"],
      volume: ["Volume", "text"],
      abvOverride: ["ABV override", "bool"],
      volumeOverride: ["Volume override", "bool"],
      producer: ["Producer", "text"],
      photoAsset: ["Photo asset", "text"],
      order: ["Order", "number"],
      sanityId: ["Sanity ID", "text"],
      onDigitalMenu: ["On digital menu", "bool"],
      onPrintMenu: ["On print menu", "bool"],
      publishSnapshots: ["Publish snapshots", "json"],
      analysisNote: ["AI reading", "text"],
      lightspeedSku: ["Lightspeed SKU", "text"],
      lightspeedSkuAlt: ["Lightspeed SKU alt", "text"],
      lightspeedName: ["Lightspeed name", "text"],
      lightspeedMenuScreen: ["Lightspeed menu/screen", "text"],
      lightspeedStatus: ["Lightspeed status", "select"],
      posMenuIds: ["POS menus", "links"],
    },
  },
  menu_placements: {
    table: "menuPlacements",
    columns: {
      itemId: ["Menu item", "link"],
      channel: ["Channel", "select"],
      sectionId: ["Section", "link"],
      posMenuId: ["POS menu", "link"],
      posScreen: ["POS screen", "text"],
      order: ["Order", "number"],
    },
  },
  inventory: {
    table: "inventory",
    columns: {
      name: ["Name", "text"],
      fullName: ["Full name", "text"],
      kind: ["Kind", "select"],
      abv: ["ABV", "text"],
      defaultUnit: ["Default unit", "select"],
      estimatedCost: ["Estimated cost", "number"],
      notes: ["Notes", "text"],
      active: ["Active", "bool"],
      lightspeedSku: ["Lightspeed SKU", "text"],
      actualQty: ["Actual qty", "number"],
      actualUnit: ["Actual unit", "text"],
      countedAt: ["Counted at", "date"],
    },
  },
  ingredients: {
    table: "ingredients",
    columns: {
      name: ["Name", "text"],
      itemId: ["Menu Item", "link"],
      inventoryId: ["Inventory", "link"],
      quantity: ["Qty", "number"],
      unit: ["Unit", "select"],
      note: ["Note", "text"],
      abv: ["ABV", "text"],
      order: ["Order", "number"],
    },
  },
  suppliers: {
    table: "suppliers",
    columns: {
      name: ["Name", "text"],
      website: ["Website", "text"],
      notes: ["Notes", "text"],
    },
  },
  inventory_suppliers: {
    table: "inventorySuppliers",
    columns: {
      name: ["Name", "text"],
      inventoryId: ["Inventory", "link"],
      supplierId: ["Supplier", "link"],
      productUrl: ["Product URL", "text"],
      sku: ["SKU", "text"],
      pack: ["Pack", "text"],
      price: ["Price", "number"],
    },
  },
};

/** Rows per batch request (Baserow takes up to 200). */
const BATCH_SIZE = 200;

function spec(collection) {
  const found = BASEROW_MENU_TABLES[collection];
  if (!found) throw new Error(`Unknown menu collection "${collection}".`);
  return found;
}

/** A Baserow row → a record. */
export function recordFromRow(collection, row) {
  if (!row) return null;
  const fields = { id: row.id };
  for (const [key, [column, kind]] of Object.entries(
    spec(collection).columns,
  )) {
    const value = row[column];
    if (value === undefined) continue;
    if (kind === "links")
      fields[key] = Array.isArray(value)
        ? value.map((entry) => entry?.id ?? entry)
        : [];
    else if (kind === "link")
      fields[key] = Array.isArray(value)
        ? (value[0]?.id ?? value[0] ?? null)
        : value;
    else fields[key] = value;
  }
  const record = menuRecord(collection, fields);
  if (collection === "menu_items" && !parseImageAssetId(record.photoAsset)) {
    const url = fileUrl(row.Photo);
    if (url) record.legacyPhotoUrl = url;
  }
  return record;
}

/** Record fields → Baserow fields, leaving out columns the table doesn't have (`has`). */
export function rowFromFields(collection, fields, has = () => true) {
  const clean = menuFields(collection, fields);
  const row = {};
  for (const [key, value] of Object.entries(clean)) {
    const [column, kind] = spec(collection).columns[key];
    if (!has(column)) continue;
    if (kind === "link") row[column] = value == null ? [] : [value];
    else if (kind === "links") row[column] = value;
    else if (kind === "select" || kind === "date")
      row[column] = value === "" ? null : value;
    else if (kind === "json")
      row[column] = value == null ? "" : JSON.stringify(value);
    else row[column] = value;
  }
  // A photo set or taken off in ops replaces the Baserow file from before (#183).
  if (collection === "menu_items" && "photoAsset" in clean && has("Photo"))
    row.Photo = [];
  return row;
}

function withoutId({ id: _id, ...fields }) {
  return fields;
}

function notSetUp(collection) {
  const error = new Error(
    `Baserow has no table for ${collection}. Run npm run setup:baserow-ops.`,
  );
  error.status = 503;
  return error;
}

/**
 * @param {Record<string, any>} env
 * @param {{ leaveOutLegacyPhotos?: boolean }} [options]  exportAll without the
 *   check for photos still in Baserow (a dry run before the backfill)
 */
export function baserowMenuRepository(
  env,
  { leaveOutLegacyPhotos = false } = {},
) {
  const fieldNames = new Map();

  async function tableId(collection, { required = false } = {}) {
    const id = (await resolveOpsTableIds(env))[spec(collection).table];
    if (!id && required) throw notSetUp(collection);
    return id || null;
  }

  /** The table's column names, read once per repository. */
  async function hasColumn(collection) {
    const id = await tableId(collection, { required: true });
    if (!fieldNames.has(id)) {
      const fields = await baserowFetch(
        env,
        `/api/database/fields/table/${id}/`,
      );
      fieldNames.set(
        id,
        new Set(
          (Array.isArray(fields) ? fields : []).map((field) => field.name),
        ),
      );
    }
    const names = fieldNames.get(id);
    return (column) => names.has(column);
  }

  async function list(collection, where) {
    const id = await tableId(collection);
    if (!id) return [];
    const links = whereLinks(collection, where);
    // Baserow filters by one link; the rest (and "no link") are checked here.
    const first = Object.entries(links).find(([, value]) => value != null);
    const rows = await listAllRows(
      env,
      id,
      first
        ? {
            filters: linkHasQuery(
              spec(collection).columns[first[0]][0],
              first[1],
            ),
          }
        : {},
    );
    return rows
      .map((row) => recordFromRow(collection, row))
      .filter((record) => matchesWhere(record, links))
      .sort((a, b) => a.id - b.id);
  }

  async function get(collection, id) {
    const table = await tableId(collection);
    if (!table) return null;
    try {
      return recordFromRow(collection, await getRow(env, table, id));
    } catch (error) {
      if (error?.status === 404) return null;
      throw error;
    }
  }

  async function batchRequest(collection, method, path, items) {
    const id = await tableId(collection, { required: true });
    const out = [];
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const payload = await baserowFetch(
        env,
        `/api/database/rows/table/${id}/${path}`,
        {
          method,
          body: JSON.stringify({ items: items.slice(i, i + BATCH_SIZE) }),
        },
      );
      out.push(...(payload?.items || []));
    }
    return out;
  }

  /** Remove rows and what they take with them (menu-model.js CASCADES). A missing row is fine. */
  async function removeRows(collection, ids) {
    if (!ids.length) return;
    const wanted = new Set(ids.map(Number));
    for (const [child, field] of CASCADES[collection] || []) {
      const rows =
        ids.length === 1
          ? await list(child, { [field]: ids[0] })
          : await list(child);
      await removeRows(
        child,
        rows.filter((row) => wanted.has(row[field])).map((row) => row.id),
      );
    }
    const table = await tableId(collection, { required: true });
    try {
      await batchRequest(collection, "POST", "batch-delete/", [...wanted]);
    } catch (error) {
      if (error?.status !== 404) throw error;
      // One row was gone already: Baserow refuses the whole batch, so go one by one.
      for (const id of wanted) {
        try {
          await baserowFetch(env, `/api/database/rows/table/${table}/${id}/`, {
            method: "DELETE",
          });
        } catch (inner) {
          if (inner?.status !== 404) throw inner;
        }
      }
    }
  }

  async function write(changes) {
    const all = changes || [];
    const out = new Array(all.length).fill(null);
    let i = 0;
    while (i < all.length) {
      const { op, collection } = all[i];
      let j = i;
      while (
        j < all.length &&
        all[j].op === op &&
        all[j].collection === collection
      )
        j += 1;
      const run = all.slice(i, j);
      if (op === "remove") {
        await removeRows(
          collection,
          run.map((change) => Number(change.id)),
        );
      } else if (op === "create" || op === "update") {
        const has = await hasColumn(collection);
        // A new row gets every field, so one left out takes its default (On digital menu: on).
        const items = run.map((change) =>
          op === "update"
            ? {
                id: Number(change.id),
                ...rowFromFields(collection, change.fields, has),
              }
            : rowFromFields(
                collection,
                withoutId(menuRecord(collection, change.fields)),
                has,
              ),
        );
        let rows;
        try {
          rows = await batchRequest(
            collection,
            op === "create" ? "POST" : "PATCH",
            "batch/?user_field_names=true",
            items,
          );
        } catch (error) {
          if (op === "update" && error?.status === 404)
            throw notFound(collection);
          throw error;
        }
        rows.forEach(
          (row, offset) => (out[i + offset] = recordFromRow(collection, row)),
        );
      } else {
        throw new Error(`Unknown change "${op}".`);
      }
      i = j;
    }
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
      const legacy = out.menu_items.filter((item) => item.legacyPhotoUrl);
      if (legacy.length && !leaveOutLegacyPhotos) {
        throw new Error(
          `${legacy.length} drink photo${legacy.length === 1 ? " is" : "s are"} still a Baserow file. Run the menu photos backfill (migrations/2026-10-06-menu-photos-backfill.mjs) first.`,
        );
      }
      for (const item of out.menu_items) delete item.legacyPhotoUrl;
      return out;
    },
  };
}
