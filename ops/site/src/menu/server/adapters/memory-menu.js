/**
 * MenuRepository in memory (#186): for tests, and the reference for what
 * every adapter must do (menu-repository.contract.test.js).
 */
import {
  CASCADES,
  MENU_COLLECTION_NAMES,
  collectionFields,
  linksTo,
  matchesWhere,
  menuFields,
  menuRecord,
  notFound,
  whereLinks,
} from "../menu-model.js";

export function memoryMenuRepository(seed = {}) {
  let store;
  let nextId;
  const reset = () => {
    store = Object.fromEntries(
      MENU_COLLECTION_NAMES.map((name) => [name, new Map()]),
    );
    nextId = Object.fromEntries(MENU_COLLECTION_NAMES.map((name) => [name, 1]));
  };
  const put = (collection, record) => {
    store[collection].set(record.id, record);
    nextId[collection] = Math.max(nextId[collection], record.id + 1);
    return structuredClone(record);
  };
  const table = (collection) => {
    collectionFields(collection);
    return store[collection];
  };

  function create(collection, fields) {
    const id = nextId[collection];
    return put(
      collection,
      menuRecord(collection, { ...menuFields(collection, fields), id }),
    );
  }

  function update(collection, id, fields) {
    const current = table(collection).get(Number(id));
    if (!current) throw notFound(collection);
    return put(collection, { ...current, ...menuFields(collection, fields) });
  }

  function remove(collection, id) {
    const key = Number(id);
    if (!table(collection).delete(key)) return;
    for (const [child, field] of CASCADES[collection] || []) {
      for (const record of [...store[child].values()])
        if (record[field] === key) remove(child, record.id);
    }
    for (const { collection: other, key: field, kind } of linksTo(collection)) {
      for (const record of store[other].values()) {
        if (kind === "link" && record[field] === key) record[field] = null;
        if (kind === "links")
          record[field] = record[field].filter((linked) => linked !== key);
      }
    }
  }

  const list = (collection, where) => {
    const links = whereLinks(collection, where);
    return [...table(collection).values()]
      .filter((record) => matchesWhere(record, links))
      .sort((a, b) => a.id - b.id)
      .map((record) => structuredClone(record));
  };

  const repo = {
    async list(collection, where) {
      return list(collection, where);
    },
    async get(collection, id) {
      const record = table(collection).get(Number(id));
      return record ? structuredClone(record) : null;
    },
    async create(collection, fields) {
      return create(collection, fields);
    },
    async update(collection, id, fields) {
      return update(collection, id, fields);
    },
    async remove(collection, id) {
      remove(collection, id);
    },
    async write(changes) {
      const out = [];
      for (const change of changes || []) {
        if (change.op === "create")
          out.push(create(change.collection, change.fields));
        else if (change.op === "update")
          out.push(update(change.collection, change.id, change.fields));
        else if (change.op === "remove")
          out.push(remove(change.collection, change.id) ?? null);
        else throw new Error(`Unknown change "${change.op}".`);
      }
      return out;
    },
    async exportAll() {
      return Object.fromEntries(
        MENU_COLLECTION_NAMES.map((name) => [name, list(name)]),
      );
    },
    async importAll(snapshot) {
      reset();
      for (const name of MENU_COLLECTION_NAMES) {
        for (const record of snapshot?.[name] || [])
          put(name, menuRecord(name, record));
      }
    },
  };

  reset();
  for (const name of MENU_COLLECTION_NAMES) {
    for (const record of seed[name] || []) {
      if (record.id != null) put(name, menuRecord(name, record));
      else create(name, record);
    }
  }
  return repo;
}
