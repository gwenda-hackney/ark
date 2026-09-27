/**
 * An in-memory world for use-case tests: everything ops talks to over HTTP,
 * faked behind one global `fetch`, so tests drive the real API handlers.
 *
 * - Baserow: the ops tables (built from scripts/lib/baserow-ops-schema.mjs,
 *   the same field definitions setup-baserow-ops.mjs uses) and Gwenda Config,
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
  artistFields,
  eventDateFields,
  eventFields,
  userFields,
} from "../../../../scripts/lib/baserow-ops-schema.mjs";

const SANITY_PROJECT_ID = "gwscpagy";
const DRIVE_EVENTS_ROOT = "drive-events-root";
const CALENDAR_ID = "events@group.calendar.google.com";

// ---------------------------------------------------------------- Baserow

let nextId = 1000;
const newId = () => (nextId += 1);

function makeTable(name, databaseId, specs = []) {
  const id = newId();
  const fields = [{ id: newId(), name: "Name", type: "text", primary: true }];
  for (const spec of specs) fields.push({ id: newId(), primary: false, ...spec.body, name: spec.name });
  for (const field of fields) {
    if (field.select_options) {
      field.select_options = field.select_options.map((option) => ({ id: newId(), ...option }));
    }
  }
  return { id, name, database_id: databaseId, fields, rows: new Map() };
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
        out[field.name] = value.map((id) => ({ id, value: target?.rows.get(id)?.Name ?? "" }));
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

  handle(url, init) {
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
    if (path === "/api/user-files/upload-file/" && method === "POST") {
      const name = `upload-${newId()}.jpg`;
      return json({ name, url: `https://files.baserow.test/${name}`, is_image: true, visible_name: name });
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
  const tables = [
    makeTable("Menu Sections", databaseId),
    makeTable("Menu Items", databaseId),
    makeTable("Ingredients", databaseId),
    makeTable("Users", databaseId, userFields()),
    makeTable("Events", databaseId, eventFields()),
    makeTable("Artists", databaseId, artistFields()),
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
      const id = `image-${newId()}-800x600-jpg`;
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
    if (url.pathname.startsWith("/drive/v3/files")) return this.drive(url, init, method);
    if (url.pathname.startsWith("/calendar/v3/")) return this.calendarApi(url, init, method);
    throw new Error(`Fake Google: unhandled ${method} ${url.host}${url.pathname}`);
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
    if (method === "GET") return json(file);
    if (method === "PATCH") {
      Object.assign(file, JSON.parse(init.body || "{}"));
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
    if (url.host.endsWith(".api.sanity.io") || url.host.endsWith(".apicdn.sanity.io")) return sanity.handle(url, merged);
    if (url.host.endsWith("googleapis.com")) return google.handle(url, merged);
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
export async function callApi(world, handler, { method = "GET", path = "/", params = {}, body } = {}) {
  const request = new Request(`https://gwenda-ops-dev.pages.dev${path}`, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
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
