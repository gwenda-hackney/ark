/**
 * A small fake Baserow for adapter tests: one token's tables in memory,
 * behind a `fetch`. It answers the calls shared/baserow.js makes (list
 * tables, list fields, list rows with equal/boolean filters, order_by and
 * paging, and get/create/update/delete a row), and returns select values the
 * way Baserow does, as `{ id, value, color }`. Anything else throws with
 * the URL, so a new call shows up as a failing test.
 *
 *   const baserow = fakeBaserow({ tables: { Subscribers: { Email: "text", Tag: "multiple_select" } } });
 *   vi.stubGlobal("fetch", baserow.fetch);
 *   baserowSubscriberRepository({ BASEROW_API_KEY: baserow.token, BASEROW_API_URL: baserow.url });
 */
const EMPTY = { boolean: false, multiple_select: [] };

let nextId = 5000;

export function fakeBaserow({
  // Fresh per fake, so caches keyed by token never carry one test's tables into the next.
  token = `fake-baserow-${(nextId += 1)}`,
  url = "https://baserow.test",
  tables = {},
  databaseId = 77,
} = {}) {
  const byId = new Map();
  for (const [name, fields] of Object.entries(tables)) {
    const id = (nextId += 1);
    byId.set(id, { id, name, fields, rows: new Map(), nextRow: 1 });
  }
  let optionId = 1;
  const options = new Map();
  const option = (value) => {
    if (value == null || value === "") return null;
    const key = typeof value === "object" ? value.value : String(value);
    if (!options.has(key))
      options.set(key, { id: optionId++, value: key, color: "blue" });
    return { ...options.get(key) };
  };

  function writeFields(table, row, body) {
    for (const [name, value] of Object.entries(body)) {
      const type = table.fields[name];
      if (!type) throw badRequest(`ERROR_NO_SUCH_FIELD ${name}`);
      if (type === "multiple_select")
        row[name] = (value || []).map(option).filter(Boolean);
      else if (type === "single_select") row[name] = option(value);
      else if (type === "boolean") row[name] = Boolean(value);
      else row[name] = value === "" && type === "date" ? null : value;
    }
    return row;
  }

  function listRows(table, params) {
    let rows = [...table.rows.values()].sort((a, b) => a.id - b.id);
    for (const [key, value] of params) {
      const equal = key.match(/^filter__(.+)__equal$/);
      if (equal)
        rows = rows.filter((row) => String(row[equal[1]] ?? "") === value);
      const bool = key.match(/^filter__(.+)__boolean$/);
      if (bool)
        rows = rows.filter(
          (row) => Boolean(row[bool[1]]) === (value === "true"),
        );
    }
    const order = params.get("order_by");
    if (order) {
      const desc = order.startsWith("-");
      const field = order.replace(/^-/, "");
      rows.sort((a, b) => {
        const cmp = String(a[field] ?? "").localeCompare(
          String(b[field] ?? ""),
        );
        return (desc ? -cmp : cmp) || a.id - b.id;
      });
    }
    const size = Number(params.get("size")) || 100;
    const page = Number(params.get("page")) || 1;
    return {
      count: rows.length,
      next: page * size < rows.length ? `page-${page + 1}` : null,
      results: rows
        .slice((page - 1) * size, page * size)
        .map((row) => structuredClone(row)),
    };
  }

  function badRequest(detail) {
    return Object.assign(new Error(detail), { status: 400 });
  }

  async function handle(request, init) {
    const href = new URL(String(request));
    if (href.origin !== url)
      throw new Error(`Fake Baserow: unexpected ${href}`);
    const auth = String(init?.headers?.Authorization || "");
    if (auth !== `Token ${token}`)
      return Response.json({ error: "ERROR_INVALID_TOKEN" }, { status: 401 });
    const method = init?.method || "GET";
    const path = href.pathname;

    if (path === "/api/database/tables/all-tables/")
      return Response.json(
        [...byId.values()].map(({ id, name }) => ({
          id,
          name,
          database_id: databaseId,
        })),
      );
    const fieldsMatch = path.match(/^\/api\/database\/fields\/table\/(\d+)\/$/);
    if (fieldsMatch) {
      const table = byId.get(Number(fieldsMatch[1]));
      return Response.json(
        Object.entries(table.fields).map(([name, type], i) => ({
          id: i + 1,
          name,
          type,
        })),
      );
    }
    const rowsMatch = path.match(
      /^\/api\/database\/rows\/table\/(\d+)\/(?:(\d+)\/)?$/,
    );
    if (!rowsMatch)
      throw new Error(`Fake Baserow: ${method} ${path} not faked`);
    const table = byId.get(Number(rowsMatch[1]));
    if (!table)
      return Response.json(
        { error: "ERROR_TABLE_DOES_NOT_EXIST" },
        { status: 404 },
      );
    const rowId = rowsMatch[2] ? Number(rowsMatch[2]) : null;
    const body = init?.body ? JSON.parse(String(init.body)) : {};

    try {
      if (rowId == null && method === "GET")
        return Response.json(listRows(table, href.searchParams));
      if (rowId == null && method === "POST") {
        const row = { id: table.nextRow++ };
        for (const [name, type] of Object.entries(table.fields))
          row[name] = EMPTY[type] ?? null;
        table.rows.set(row.id, writeFields(table, row, body));
        return Response.json(structuredClone(row));
      }
      const row = table.rows.get(rowId);
      if (!row)
        return Response.json(
          { error: "ERROR_ROW_DOES_NOT_EXIST" },
          { status: 404 },
        );
      if (method === "GET") return Response.json(structuredClone(row));
      if (method === "PATCH")
        return Response.json(structuredClone(writeFields(table, row, body)));
      if (method === "DELETE") {
        table.rows.delete(rowId);
        return new Response(null, { status: 204 });
      }
    } catch (error) {
      if (error.status === 400)
        return Response.json(
          { error: "ERROR_REQUEST_BODY_VALIDATION", detail: error.message },
          { status: 400 },
        );
      throw error;
    }
    throw new Error(`Fake Baserow: ${method} ${path} not faked`);
  }

  return {
    token,
    url,
    fetch: handle,
    /** Raw rows of a table, as Baserow holds them. */
    rows: (name) => [
      ...[...byId.values()].find((t) => t.name === name).rows.values(),
    ],
  };
}
