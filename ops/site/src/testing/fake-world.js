/**
 * An in-memory world for use-case tests: everything ops talks to over HTTP,
 * faked behind one global `fetch`, so tests drive the real API handlers.
 *
 * - Baserow: the ops tables (built from platform/baserow-schema.js,
 *   the same field definitions scripts/setup-baserow.mjs uses) and Gwenda Config,
 *   each reachable only with its own token, as in real life.
 * - Sanity: documents in memory, queried with groq-js (the real GROQ engine)
 *   under the raw / published / previewDrafts perspectives.
 * - Google: service-account tokens, Drive folders, Calendar events.
 *
 * Every world gets fresh random tokens, so ops' module-level caches (keyed by
 * token) never carry one test's data into the next. Anything not faked throws
 * with the URL, so a new outside call shows up as a failing test.
 */
import { evaluate, parse } from "groq-js";
import {
  GUEST_ARTIST_FIELDS,
  artistFields,
  eventDateFields,
  eventFields,
  ingredientFields,
  inventoryFields,
  inventorySupplierFields,
  itemFields,
  menuPlacementFields,
  posMenuFields,
  sectionFields,
  supplierFields,
  userFields,
} from "../platform/baserow-schema.js";

const SANITY_PROJECT_ID = "gwscpagy";
const DRIVE_EVENTS_ROOT = "drive-events-root";
const FILES_HOST = "files.baserow.test";
const CALENDAR_ID = "events@group.calendar.google.com";

// ---------------------------------------------------------------- Baserow

let nextId = 1000;
const newId = () => (nextId += 1);

function makeTable(name, databaseId, specs = [], primary = "Name") {
  const table = {
    id: newId(),
    name,
    database_id: databaseId,
    fields: [{ id: newId(), name: primary, type: "text", primary: true }],
    rows: new Map(),
  };
  return addFields(table, specs);
}

/** Specs with a null body are optional fields setup skips (no linked table). */
function addFields(table, specs) {
  for (const spec of specs) {
    if (!spec.body) continue;
    const field = { id: newId(), primary: false, ...spec.body, name: spec.name };
    if (field.select_options) {
      field.select_options = field.select_options.map((option) => ({ id: newId(), ...option }));
    }
    table.fields.push(field);
  }
  return table;
}

function emptyValue(field) {
  if (field.type === "boolean") return false;
  if (field.type === "link_row" || field.type === "file" || field.type === "multiple_select") return [];
  return null;
}

function linkIds(value) {
  return (Array.isArray(value) ? value : value == null || value === "" ? [] : [value])
    .map((item) => Number(typeof item === "object" ? item.id : item))
    .filter((id) => Number.isFinite(id));
}

class FakeBaserow {
  constructor() {
    this.workspaces = new Map();
    /** Uploaded user files by Baserow name, served from FILES_HOST. */
    this.files = new Map();
  }

  serveFile(url) {
    const file = this.files.get(decodeURIComponent(url.pathname.slice(1)));
    if (!file) return new Response("Not found", { status: 404 });
    return new Response(file.bytes, { headers: { "Content-Type": file.type || "application/octet-stream" } });
  }

  addWorkspace(token, tables) {
    this.workspaces.set(token, new Map(tables.map((table) => [table.id, table])));
  }

  tableByName(name) {
    for (const tables of this.workspaces.values()) {
      for (const table of tables.values()) if (table.name === name) return table;
    }
    throw new Error(`Fake Baserow has no table "${name}"`);
  }

  /** Rows as the API returns them. */
  rows(tableName) {
    const table = this.tableByName(tableName);
    return [...table.rows.values()].map((row) => this.present(table, row));
  }

  insert(tableName, fields) {
    const table = this.tableByName(tableName);
    return this.present(table, this.write(table, { id: newId() }, fields));
  }

  /** Change a row behind ops' back, as someone editing Baserow would. */
  update(tableName, id, fields) {
    const table = this.tableByName(tableName);
    const row = table.rows.get(Number(id));
    if (!row) throw new Error(`Fake Baserow: no row ${id} in "${tableName}"`);
    return this.present(table, this.write(table, row, fields));
  }

  /** A user file, as an upload made before (#183) left it. */
  addFile(visibleName, bytes, type = "image/jpeg") {
    const name = `${newId()}_${visibleName}`;
    this.files.set(name, { bytes, type, visibleName });
    return { name };
  }

  write(table, row, input) {
    for (const [key, value] of Object.entries(input || {})) {
      const field = table.fields.find((f) => f.name === key);
      if (!field) {
        const error = new Error(`Field "${key}" does not exist in table "${table.name}".`);
        error.status = 400;
        throw error;
      }
      if (field.type === "link_row") row[key] = linkIds(value);
      else if (field.type === "single_select") {
        if (value == null || value === "") row[key] = null;
        else {
          const wanted = typeof value === "object" ? value.id ?? value.value : value;
          const option = field.select_options.find((o) => o.id === Number(wanted) || o.value === String(wanted));
          if (!option) {
            const error = new Error(`"${wanted}" is not an option of "${key}".`);
            error.status = 400;
            throw error;
          }
          row[key] = option.id;
        }
      } else if (field.type === "file") {
        row[key] = (value || []).map((entry) => String(entry?.name || ""));
      } else if (field.type === "number") row[key] = value == null || value === "" ? null : String(value);
      else if (field.type === "boolean") row[key] = Boolean(value);
      else row[key] = value;
    }
    table.rows.set(row.id, row);
    return row;
  }

  present(table, row) {
    const out = { id: row.id, order: "1.00000000000000000000" };
    for (const field of table.fields) {
      const value = row[field.name];
      if (value === undefined) out[field.name] = emptyValue(field);
      else if (field.type === "link_row") {
        const target = this.tableById(field.link_row_table_id);
        // Like Baserow: a link to a deleted row is gone.
        out[field.name] = value
          .filter((id) => !target || target.rows.has(id))
          .map((id) => ({ id, value: target?.rows.get(id)?.Name ?? "" }));
      } else if (field.type === "file") {
        out[field.name] = value.map((name) => ({
          name,
          visible_name: this.files.get(name)?.visibleName || name,
          url: `https://${FILES_HOST}/${name}`,
          is_image: true,
        }));
      } else if (field.type === "single_select") {
        const option = field.select_options.find((o) => o.id === value);
        out[field.name] = option ? { id: option.id, value: option.value, color: option.color } : null;
      } else out[field.name] = value;
    }
    return out;
  }

  tableById(id) {
    for (const tables of this.workspaces.values()) if (tables.has(Number(id))) return tables.get(Number(id));
    return null;
  }

  async handle(url, init) {
    const token = String(init.headers?.Authorization || "").replace(/^Token /, "");
    const tables = this.workspaces.get(token);
    if (!tables) return json({ error: "ERROR_INVALID_ACCESS_TOKEN" }, 401);
    const path = url.pathname;
    const method = (init.method || "GET").toUpperCase();

    if (path === "/api/database/tables/all-tables/") {
      return json([...tables.values()].map(({ id, name, database_id }) => ({ id, name, database_id })));
    }
    let match = path.match(/^\/api\/database\/fields\/table\/(\d+)\/$/);
    if (match) {
      const table = tables.get(Number(match[1]));
      return table ? json(table.fields.map(({ id, name, type, primary }) => ({ id, name, type, primary }))) : json({}, 404);
    }
    match = path.match(/^\/api\/database\/rows\/table\/(\d+)\/(?:(\d+)\/)?$/);
    if (match) {
      const table = tables.get(Number(match[1]));
      if (!table) return json({ error: "ERROR_TABLE_DOES_NOT_EXIST" }, 404);
      const rowId = match[2] ? Number(match[2]) : null;
      const body = init.body ? JSON.parse(init.body) : {};
      try {
        if (rowId == null && method === "GET") return json(this.list(table, url));
        if (rowId == null && method === "POST") return json(this.present(table, this.write(table, { id: newId() }, body)));
        const row = table.rows.get(rowId);
        if (!row) return json({ error: "ERROR_ROW_DOES_NOT_EXIST" }, 404);
        if (method === "GET") return json(this.present(table, row));
        if (method === "PATCH") return json(this.present(table, this.write(table, row, body)));
        if (method === "DELETE") {
          table.rows.delete(rowId);
          return new Response(null, { status: 204 });
        }
      } catch (error) {
        return json({ error: "ERROR_REQUEST_BODY_VALIDATION", detail: error.message }, error.status || 400);
      }
    }
    match = path.match(/^\/api\/database\/rows\/table\/(\d+)\/batch\/$/);
    if (match) {
      const table = tables.get(Number(match[1]));
      if (!table) return json({ error: "ERROR_TABLE_DOES_NOT_EXIST" }, 404);
      const { items = [] } = init.body ? JSON.parse(init.body) : {};
      try {
        if (method === "POST") {
          return json({ items: items.map((item) => this.present(table, this.write(table, { id: newId() }, item))) });
        }
        if (method === "PATCH") {
          // Baserow checks the whole batch first: one missing row fails it all.
          const missing = items.find((item) => !table.rows.has(Number(item.id)));
          if (missing) return json({ error: "ERROR_ROW_DOES_NOT_EXIST", detail: `Row ${missing.id} does not exist.` }, 404);
          return json({
            items: items.map(({ id, ...fields }) => this.present(table, this.write(table, table.rows.get(Number(id)), fields))),
          });
        }
      } catch (error) {
        return json({ error: "ERROR_REQUEST_BODY_VALIDATION", detail: error.message }, error.status || 400);
      }
    }
    match = path.match(/^\/api\/database\/rows\/table\/(\d+)\/batch-delete\/$/);
    if (match && method === "POST") {
      const table = tables.get(Number(match[1]));
      if (!table) return json({ error: "ERROR_TABLE_DOES_NOT_EXIST" }, 404);
      const { items = [] } = init.body ? JSON.parse(init.body) : {};
      // Like Baserow: one missing row fails the whole batch.
      const missing = items.find((id) => !table.rows.has(Number(id)));
      if (missing != null) return json({ error: "ERROR_ROW_DOES_NOT_EXIST", detail: `Row ${missing} does not exist.` }, 404);
      for (const id of items) table.rows.delete(Number(id));
      return new Response(null, { status: 204 });
    }
    if (path === "/api/user-files/upload-file/" && method === "POST") {
      const file = init.body instanceof FormData ? init.body.get("file") : null;
      if (!file || typeof file === "string") throw new Error("Fake Baserow: upload without a file");
      const visibleName = file.name || "upload.bin";
      const name = `${newId()}_${visibleName}`;
      this.files.set(name, { bytes: new Uint8Array(await file.arrayBuffer()), type: file.type, visibleName });
      return json({ name, url: `https://${FILES_HOST}/${name}`, is_image: true, visible_name: visibleName });
    }
    throw new Error(`Fake Baserow: unhandled ${method} ${path}`);
  }

  list(table, url) {
    let rows = [...table.rows.values()];
    const filters = url.searchParams.get("filters");
    if (filters) {
      for (const filter of JSON.parse(filters).filters || []) {
        if (filter.type !== "link_row_has") throw new Error(`Fake Baserow: filter ${filter.type} not faked`);
        rows = rows.filter((row) => (row[filter.field] || []).includes(Number(filter.value)));
      }
    }
    for (const [key, value] of url.searchParams) {
      const bool = key.match(/^filter__(.+)__boolean$/);
      if (bool) rows = rows.filter((row) => Boolean(row[bool[1]]) === (value === "true" || value === "1"));
    }
    const size = Number(url.searchParams.get("size")) || 100;
    const page = Number(url.searchParams.get("page")) || 1;
    const slice = rows.slice((page - 1) * size, page * size);
    return {
      count: rows.length,
      next: page * size < rows.length ? `next-page-${page + 1}` : null,
      previous: null,
      results: slice.map((row) => this.present(table, row)),
    };
  }
}

function opsTables() {
  const databaseId = 7;
  // Menu tables link to each other, so they exist before their fields.
  const sections = makeTable("Menu Sections", databaseId);
  const items = makeTable("Menu Items", databaseId);
  const posMenus = makeTable("POS Menus", databaseId, posMenuFields());
  const inventory = makeTable("Inventory", databaseId, inventoryFields());
  const suppliers = makeTable("Suppliers", databaseId, supplierFields());
  addFields(sections, sectionFields(sections.id));
  addFields(items, itemFields(sections.id, posMenus.id));
  const tables = [
    sections,
    items,
    makeTable("Ingredients", databaseId, ingredientFields(items.id, inventory.id)),
    inventory,
    suppliers,
    makeTable("Inventory suppliers", databaseId, inventorySupplierFields(inventory.id, suppliers.id)),
    posMenus,
    makeTable("Menu placements", databaseId, menuPlacementFields(items.id, sections.id, posMenus.id)),
    makeTable("Users", databaseId, userFields()),
    makeTable("Events", databaseId, eventFields()),
    makeTable("Artists", databaseId, artistFields()),
    makeTable(
      "Guest artists",
      databaseId,
      GUEST_ARTIST_FIELDS.map((body) => ({ name: body.name, body })),
      "Email",
    ),
  ];
  const events = tables.find((table) => table.name === "Events");
  tables.push(makeTable("Event dates", databaseId, eventDateFields(events.id)));
  // eventDateFields names the target as a placeholder id until setup creates it.
  for (const field of tables.at(-1).fields) if (field.type === "link_row") field.link_row_table_id = events.id;
  return tables;
}

function configTables() {
  const texts = ["Value", "Env", "Service"].map((name) => ({ name, body: { name, type: "text" } }));
  return [makeTable("Config", 9, texts)];
}

// ----------------------------------------------------------------- Sanity

class FakeSanity {
  constructor() {
    this.docs = new Map();
    this.rev = 0;
  }

  /** Documents as a perspective sees them. */
  view(perspective) {
    const all = [...this.docs.values()];
    if (perspective === "raw") return all;
    const published = all.filter((doc) => !doc._id.startsWith("drafts."));
    if (perspective === "published") return published;
    const byId = new Map(published.map((doc) => [doc._id, doc]));
    for (const doc of all) {
      if (doc._id.startsWith("drafts.")) {
        const id = doc._id.slice("drafts.".length);
        byId.set(id, { ...doc, _id: id, _originalId: doc._id });
      }
    }
    return [...byId.values()];
  }

  /** Published docs of a type, for assertions. */
  published(type) {
    return this.view("published").filter((doc) => !type || doc._type === type);
  }

  drafts(type) {
    return [...this.docs.values()].filter((doc) => doc._id.startsWith("drafts.") && (!type || doc._type === type));
  }

  async handle(url, init) {
    const method = (init.method || "GET").toUpperCase();
    if (/\/data\/query\//.test(url.pathname) && method === "GET") {
      const params = {};
      for (const [key, value] of url.searchParams) {
        if (key.startsWith("$")) params[key.slice(1)] = JSON.parse(value);
      }
      const tree = parse(url.searchParams.get("query"), { params });
      const value = await evaluate(tree, { dataset: this.view(url.searchParams.get("perspective") || "raw"), params });
      return json({ result: await value.get() });
    }
    if (/\/data\/mutate\//.test(url.pathname) && method === "POST") {
      const { mutations } = JSON.parse(init.body);
      const results = [];
      for (const mutation of mutations) results.push(this.mutate(mutation));
      return json({ transactionId: `tx-${this.rev}`, results });
    }
    if (/\/assets\/images\//.test(url.pathname) && method === "POST") {
      // Like Sanity: the id is a hash of the bytes, so the same photo is one asset.
      const bytes = init.body == null ? new Uint8Array() : new Uint8Array(await new Response(init.body).arrayBuffer());
      const sha1 = Buffer.from(await crypto.subtle.digest("SHA-1", bytes)).toString("hex");
      const id = `image-${sha1}-800x600-jpg`;
      if (this.docs.has(id)) return json({ document: this.docs.get(id) });
      const filename = url.searchParams.get("filename") || "upload.jpg";
      const doc = { _id: id, _type: "sanity.imageAsset", originalFilename: filename, url: `https://cdn.sanity.test/${id}.jpg` };
      this.docs.set(id, doc);
      return json({ document: doc });
    }
    throw new Error(`Fake Sanity: unhandled ${method} ${url.pathname}`);
  }

  stamp(doc) {
    this.rev += 1;
    const now = new Date().toISOString();
    return { _createdAt: now, ...doc, _updatedAt: now, _rev: `rev-${this.rev}` };
  }

  mutate(mutation) {
    const [kind, body] = Object.entries(mutation)[0];
    if (kind === "create" || kind === "createOrReplace" || kind === "createIfNotExists") {
      const id = body._id || `doc-${newId()}`;
      const exists = this.docs.has(id);
      if (kind === "create" && exists) throw new Error(`Fake Sanity: document ${id} already exists`);
      if (!(kind === "createIfNotExists" && exists)) this.docs.set(id, this.stamp({ ...body, _id: id }));
      return { id, operation: exists ? "update" : "create" };
    }
    if (kind === "patch") {
      const doc = this.docs.get(body.id);
      if (!doc) throw new Error(`Fake Sanity: patch on missing document ${body.id}`);
      const next = structuredClone(doc);
      for (const [path, value] of Object.entries(body.setIfMissing || {})) if (getPath(next, path) === undefined) setPath(next, path, value);
      for (const [path, value] of Object.entries(body.set || {})) setPath(next, path, value);
      for (const path of body.unset || []) setPath(next, path, undefined);
      this.docs.set(body.id, this.stamp(next));
      return { id: body.id, operation: "update" };
    }
    if (kind === "delete") {
      this.docs.delete(body.id);
      return { id: body.id, operation: "delete" };
    }
    throw new Error(`Fake Sanity: mutation ${kind} not faked`);
  }
}

function getPath(doc, path) {
  return path.split(".").reduce((node, key) => (node == null ? undefined : node[key]), doc);
}

function setPath(doc, path, value) {
  const keys = path.split(".");
  let node = doc;
  for (const key of keys.slice(0, -1)) node = node[key] ??= {};
  if (value === undefined) delete node[keys.at(-1)];
  else node[keys.at(-1)] = value;
}

// ----------------------------------------------------------------- Google

class FakeGoogle {
  constructor() {
    this.driveFiles = new Map([[DRIVE_EVENTS_ROOT, { id: DRIVE_EVENTS_ROOT, name: "Events", mimeType: "application/vnd.google-apps.folder", parents: [] }]]);
    this.calendarEvents = new Map();
  }

  /** Calendar events on the events calendar, for assertions. */
  calendar() {
    return [...this.calendarEvents.values()];
  }

  /** Drive folders directly under the events root. */
  eventFolders() {
    return [...this.driveFiles.values()].filter((file) => file.parents.includes(DRIVE_EVENTS_ROOT) && !file.trashed);
  }

  handle(url, init) {
    const method = (init.method || "GET").toUpperCase();
    if (url.host === "oauth2.googleapis.com" && url.pathname === "/token") {
      return json({ access_token: `google-token-${newId()}`, expires_in: 3600, token_type: "Bearer" });
    }
    if (url.pathname === "/upload/drive/v3/files" && method === "POST") return this.driveUpload(init);
    if (url.pathname.startsWith("/drive/v3/files")) return this.drive(url, init, method);
    if (url.pathname.startsWith("/calendar/v3/")) return this.calendarApi(url, init, method);
    throw new Error(`Fake Google: unhandled ${method} ${url.host}${url.pathname}`);
  }

  /** A multipart upload: the JSON metadata part, then the bytes. */
  driveUpload(init) {
    const raw = new TextDecoder("latin1").decode(init.body);
    const metadata = JSON.parse(raw.split("\r\n\r\n")[1].split("\r\n--")[0]);
    const mimeType = raw.match(/--[^\r]+\r\nContent-Type: (image\/[a-z]+)/)?.[1] || "image/jpeg";
    // Uploads in order of creation, so "newest first" is testable.
    const createdTime = new Date(Date.UTC(2026, 0, 1) + newId() * 1000).toISOString();
    const file = {
      id: `drive-${newId()}`,
      name: metadata.name,
      mimeType,
      parents: metadata.parents || [],
      createdTime,
      ...(metadata.appProperties ? { appProperties: metadata.appProperties } : {}),
    };
    this.driveFiles.set(file.id, file);
    return json(file);
  }

  drive(url, init, method) {
    const id = url.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/)?.[1];
    if (!id && method === "GET") {
      const q = url.searchParams.get("q") || "";
      const parent = q.match(/'([^']+)' in parents/)?.[1];
      const name = q.match(/name = '([^']*)'/)?.[1];
      const folderOnly = q.includes("mimeType = 'application/vnd.google-apps.folder'");
      const files = [...this.driveFiles.values()].filter(
        (file) =>
          !file.trashed &&
          (!parent || file.parents.includes(parent)) &&
          (name == null || file.name === name) &&
          (!folderOnly || file.mimeType === "application/vnd.google-apps.folder"),
      );
      return json({ files: files.map((file) => ({ ...file, webViewLink: `https://drive.google.com/drive/folders/${file.id}` })) });
    }
    if (!id && method === "POST") {
      const body = JSON.parse(init.body || "{}");
      const file = { id: `drive-${newId()}`, name: body.name, mimeType: body.mimeType, parents: body.parents || [] };
      this.driveFiles.set(file.id, file);
      return json({ ...file, webViewLink: `https://drive.google.com/drive/folders/${file.id}` });
    }
    const file = this.driveFiles.get(id);
    if (!file) return json({ error: { message: "File not found" } }, 404);
    if (method === "GET" && url.searchParams.get("alt") === "media") {
      // Bytes of its own per file: Sanity keeps one asset for identical photos.
      const bytes = new Blob([file.id, new Uint8Array(2048).fill(9)]);
      return new Response(bytes, { headers: { "Content-Type": file.mimeType } });
    }
    if (method === "GET") return json(file);
    if (method === "PATCH") {
      const { appProperties, ...rest } = JSON.parse(init.body || "{}");
      Object.assign(file, rest);
      if (appProperties) file.appProperties = { ...(file.appProperties || {}), ...appProperties };
      const add = url.searchParams.get("addParents");
      const remove = url.searchParams.get("removeParents");
      if (add || remove) file.parents = [...file.parents.filter((parent) => parent !== remove), ...(add ? [add] : [])];
      return json(file);
    }
    if (method === "DELETE") {
      this.driveFiles.delete(id);
      return new Response(null, { status: 204 });
    }
    throw new Error(`Fake Google Drive: unhandled ${method} ${url.pathname}`);
  }

  calendarApi(url, init, method) {
    const match = url.pathname.match(/^\/calendar\/v3\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/);
    if (!match) throw new Error(`Fake Google Calendar: unhandled ${url.pathname}`);
    const eventId = match[2] ? decodeURIComponent(match[2]) : "";
    if (!eventId && method === "GET") {
      const min = url.searchParams.get("timeMin") || "";
      const max = url.searchParams.get("timeMax") || "￿";
      const items = this.calendar().filter((event) => {
        const start = event.start?.dateTime || event.start?.date || "";
        return start >= min.slice(0, start.length) && start < max;
      });
      return json({ items });
    }
    if (!eventId && method === "POST") {
      const event = { id: `cal-${newId()}`, status: "confirmed", ...JSON.parse(init.body || "{}") };
      this.calendarEvents.set(event.id, event);
      return json(event);
    }
    const event = this.calendarEvents.get(eventId);
    if (!event) return json({ error: { message: "Not Found" } }, 404);
    if (method === "PATCH" || method === "PUT") {
      Object.assign(event, JSON.parse(init.body || "{}"));
      return json(event);
    }
    if (method === "DELETE") {
      this.calendarEvents.delete(eventId);
      return new Response(null, { status: 204 });
    }
    throw new Error(`Fake Google Calendar: unhandled ${method} ${url.pathname}`);
  }
}

let serviceAccountJson;
/** A throwaway service account with a real RSA key, so ops can sign its JWT. */
async function testServiceAccount() {
  if (!serviceAccountJson) {
    const pair = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"],
    );
    const pkcs8 = Buffer.from(await crypto.subtle.exportKey("pkcs8", pair.privateKey)).toString("base64");
    const pem = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g).join("\n")}\n-----END PRIVATE KEY-----\n`;
    serviceAccountJson = JSON.stringify({
      type: "service_account",
      client_email: "ops-tests@gwenda-dev.iam.gserviceaccount.com",
      private_key: pem,
    });
  }
  return serviceAccountJson;
}

// ------------------------------------------------------------------ world

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/**
 * A fresh world with its own tokens and data. `install()` replaces global
 * fetch; `restore()` puts it back (call it in afterEach).
 */
export async function createFakeWorld() {
  const baserow = new FakeBaserow();
  const sanity = new FakeSanity();
  const google = new FakeGoogle();
  const suffix = crypto.randomUUID();
  const opsToken = `ops-${suffix}`;
  const configToken = `config-${suffix}`;
  baserow.addWorkspace(opsToken, opsTables());
  baserow.addWorkspace(configToken, configTables());
  for (const [name, value] of [
    ["google.drive_events_folder_id", DRIVE_EVENTS_ROOT],
    ["google.calendar_id", CALENDAR_ID],
    ["sanity.project_id", SANITY_PROJECT_ID],
  ]) {
    baserow.insert("Config", { Name: name, Value: value, Env: "dev", Service: name.startsWith("sanity") ? "all" : "ops" });
  }
  baserow.insert("Users", { Name: "Editor", Email: "editor@gwenda.co.uk", Active: true });

  const serviceAccount = await testServiceAccount();
  const env = {
    SITE_ENV: "dev",
    SANITY_PROJECT_ID,
    SANITY_API_TOKEN: `sanity-${suffix}`,
    BASEROW_API_KEY: opsToken,
    BASEROW_CONFIG_API_KEY: configToken,
    GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON: serviceAccount,
    GOOGLE_OAUTH_CLIENT_ID: "client-id",
    GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
    OPS_SESSION_SECRET: `session-${suffix}`,
    DEPLOY_WEBHOOK_SECRET: `deploy-${suffix}`,
  };

  const calls = [];
  const realFetch = globalThis.fetch;
  async function fakeFetch(input, init = {}) {
    const request = input instanceof Request ? input : null;
    const url = new URL(request ? request.url : String(input));
    const merged = request
      ? { method: request.method, headers: Object.fromEntries(request.headers), body: await request.text(), ...init }
      : { ...init, headers: init.headers instanceof Headers ? Object.fromEntries(init.headers) : init.headers || {} };
    calls.push(`${(merged.method || "GET").toUpperCase()} ${url.host}${url.pathname}`);
    if (url.host === "api.baserow.io") return baserow.handle(url, merged);
    if (url.host === FILES_HOST) return baserow.serveFile(url);
    if (url.host.endsWith(".api.sanity.io") || url.host.endsWith(".apicdn.sanity.io")) return sanity.handle(url, merged);
    if (url.host.endsWith("googleapis.com")) return google.handle(url, merged);
    // The Sanity image CDN: the bytes of any asset, by its address.
    if (url.host === "cdn.sanity.io") {
      return new Response(new Blob([url.pathname, new Uint8Array(1024).fill(5)]), { headers: { "Content-Type": "image/jpeg" } });
    }
    throw new Error(`Fake world: nothing fakes ${merged.method || "GET"} ${url}`);
  }

  return {
    env,
    baserow,
    sanity,
    google,
    calls,
    install() {
      globalThis.fetch = fakeFetch;
    },
    restore() {
      globalThis.fetch = realFetch;
    },
  };
}

/**
 * Call an ops Pages Function the way Cloudflare does. `path` is the URL path,
 * `params` the route params, `body` JSON for POST/PATCH/PUT.
 */
export async function callApi(world, handler, { method = "GET", path = "/", params = {}, body, headers = {} } = {}) {
  // FormData (file uploads) goes as multipart; anything else as JSON.
  const multipart = body instanceof FormData;
  const request = new Request(`https://gwenda-ops-dev.pages.dev${path}`, {
    method,
    headers: { ...(body === undefined || multipart ? {} : { "Content-Type": "application/json" }), ...headers },
    body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
  });
  const response = await handler({ request, env: { ...world.env }, params, data: {}, waitUntil() {} });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: response.status, data };
}
