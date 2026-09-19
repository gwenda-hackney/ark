/**
 * Shared Baserow clone helpers (JWT schema + row copy with link remapping).
 */
export async function jwtRequest(apiBase, jwt, path, init = {}) {
  const url = path.startsWith("http") ? path : `${apiBase}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `JWT ${jwt}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    const detail = json?.detail || json?.error || text.slice(0, 400);
    throw new Error(`${init.method || "GET"} ${path} → ${response.status}: ${detail}`);
  }
  return json;
}

export async function listAllRows(apiBase, jwt, tableId) {
  const rows = [];
  let page = 1;
  for (;;) {
    const payload = await jwtRequest(
      apiBase,
      jwt,
      `/api/database/rows/table/${tableId}/?user_field_names=true&size=200&page=${page}`,
    );
    rows.push(...(payload.results || []));
    if (!payload.next) break;
    page += 1;
  }
  return rows;
}

export async function listAllApplications(apiBase, jwt) {
  const apps = await jwtRequest(apiBase, jwt, "/api/applications/");
  return Array.isArray(apps) ? apps : [];
}

export function fieldCreateBody(field, tableIdByOldId) {
  if (field.read_only && field.type !== "text") return null;
  if (field.type === "file") {
    return { name: field.name, type: "file" };
  }

  const base = { name: field.name, type: field.type };

  if (field.type === "number") {
    return {
      ...base,
      number_decimal_places: field.number_decimal_places ?? 0,
      number_negative: Boolean(field.number_negative),
    };
  }
  if (field.type === "boolean") {
    return { ...base };
  }
  if (field.type === "single_select" || field.type === "multiple_select") {
    return {
      ...base,
      select_options: (field.select_options || []).map((opt) => ({
        value: opt.value,
        color: opt.color || "light-gray",
      })),
    };
  }
  if (field.type === "link_row") {
    const newTableId = tableIdByOldId.get(String(field.link_row_table_id));
    if (!newTableId) return null;
    const isSelf =
      field.table_id != null &&
      String(field.link_row_table_id) === String(field.table_id);
    return {
      ...base,
      link_row_table_id: Number(newTableId),
      has_related_field: isSelf
        ? false
        : Boolean(field.link_row_related_field_id ?? field.has_related_field),
    };
  }
  if (field.type === "date") {
    return {
      ...base,
      date_format: field.date_format || "ISO",
      date_include_time: Boolean(field.date_include_time),
      ...(field.date_time_format ? { date_time_format: field.date_time_format } : {}),
    };
  }
  if (field.type === "text") {
    return {
      ...base,
      ...(field.db_index ? { db_index: true } : {}),
    };
  }
  if (
    field.type === "long_text" ||
    field.type === "url" ||
    field.type === "email" ||
    field.type === "phone_number" ||
    field.type === "rating"
  ) {
    return base;
  }
  if (field.type === "created_on" || field.type === "last_modified") return null;
  if (
    field.type === "formula" ||
    field.type === "lookup" ||
    field.type === "rollup" ||
    field.type === "count"
  ) {
    return null;
  }
  return base;
}

function linkIds(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (item && typeof item === "object" ? item.id : item))
    .filter((id) => id != null)
    .map(String);
}

export function remapRowPayload(row, fields, idMapsByOldTableId) {
  const out = {};
  for (const field of fields) {
    if (field.primary) {
      const value = row[field.name] ?? row.Name ?? "";
      if (value !== "" && value != null) out[field.name] = value;
      continue;
    }
    if (field.type === "file") continue;
    if (field.read_only && field.type !== "text") continue;
    if (
      field.type === "formula" ||
      field.type === "lookup" ||
      field.type === "rollup" ||
      field.type === "count" ||
      field.type === "created_on" ||
      field.type === "last_modified"
    ) {
      continue;
    }

    const raw = row[field.name];
    if (raw == null || raw === "") continue;

    if (field.type === "link_row") {
      const map = idMapsByOldTableId.get(String(field.link_row_table_id));
      if (!map) continue;
      const next = [];
      for (const oldId of linkIds(raw)) {
        const newId = map.get(oldId);
        if (newId) next.push(Number(newId));
      }
      if (next.length) out[field.name] = next;
      continue;
    }

    if (field.type === "single_select") {
      const value = typeof raw === "object" && raw != null ? raw.value : raw;
      if (value != null && value !== "") out[field.name] = value;
      continue;
    }

    if (field.type === "multiple_select") {
      const values = Array.isArray(raw)
        ? raw.map((item) => (typeof item === "object" ? item.value : item))
        : [];
      if (values.length) out[field.name] = values;
      continue;
    }

    out[field.name] = raw;
  }
  return out;
}

/** Parents (link targets) before children. Falls back to source order on cycles. */
export function orderTables(tables, fieldsByTableId) {
  const ids = tables.map((table) => String(table.id));
  const idSet = new Set(ids);
  const remaining = new Set(ids);
  const dependsOn = new Map(ids.map((id) => [id, new Set()]));

  for (const table of tables) {
    const from = String(table.id);
    const fields = fieldsByTableId.get(from) || [];
    for (const field of fields) {
      if (field.type !== "link_row") continue;
      const target = String(field.link_row_table_id ?? "");
      if (!target || !idSet.has(target) || target === from) continue;
      dependsOn.get(from).add(target);
    }
  }

  const ordered = [];
  while (remaining.size) {
    const ready = [...remaining].filter((id) =>
      [...dependsOn.get(id)].every((dep) => !remaining.has(dep)),
    );
    const pick = ready.length ? ready : [[...remaining][0]];
    for (const id of pick) {
      remaining.delete(id);
      ordered.push(id);
    }
  }

  const byId = new Map(tables.map((table) => [String(table.id), table]));
  return ordered.map((id) => byId.get(id));
}

export async function findWorkspaceByName(apiBase, jwt, name) {
  const list = await jwtRequest(apiBase, jwt, "/api/workspaces/");
  const workspaces = Array.isArray(list) ? list : [];
  const norm = (value) => String(value).trim().toLowerCase();
  return workspaces.find((ws) => norm(ws.name) === norm(name)) || null;
}

export async function findDatabaseByName(apiBase, jwt, workspaceId, name) {
  const apps = await jwtRequest(
    apiBase,
    jwt,
    `/api/applications/workspace/${workspaceId}/`,
  );
  const list = Array.isArray(apps) ? apps : [];
  return (
    list.find((app) => app.type === "database" && app.name === name) || null
  );
}

export const WEBSITE_DATABASE_NAME = "Website";
export const GWENDA_WORKSPACE_NAME = "Gwenda";
export const GWENDA_DEV_WORKSPACE_NAME = "Gwenda Dev";

/** JWT lookup: Website DB in Gwenda (prod) or Gwenda Dev. */
export async function resolveWebsiteDatabase(
  apiBase,
  jwt,
  { production = false } = {},
) {
  const workspaceName = production
    ? GWENDA_WORKSPACE_NAME
    : GWENDA_DEV_WORKSPACE_NAME;
  const workspace = await findWorkspaceByName(apiBase, jwt, workspaceName);
  if (!workspace) {
    throw new Error(`Baserow workspace "${workspaceName}" not found.`);
  }
  const database = await findDatabaseByName(
    apiBase,
    jwt,
    workspace.id,
    WEBSITE_DATABASE_NAME,
  );
  if (!database) {
    throw new Error(
      `Database "${WEBSITE_DATABASE_NAME}" not found in workspace "${workspaceName}".`,
    );
  }
  return {
    workspaceId: String(workspace.id),
    workspaceName,
    databaseId: String(database.id),
    databaseName: WEBSITE_DATABASE_NAME,
  };
}

export async function findOrCreateDatabase(apiBase, jwt, workspaceId, name) {
  const existing = await findDatabaseByName(apiBase, jwt, workspaceId, name);
  if (existing) {
    console.log(`Using existing database "${name}" (${existing.id}).`);
    return String(existing.id);
  }
  const created = await jwtRequest(
    apiBase,
    jwt,
    `/api/applications/workspace/${workspaceId}/`,
    {
      method: "POST",
      body: JSON.stringify({ name, type: "database" }),
    },
  );
  console.log(`Created database "${name}" (${created.id}).`);
  return String(created.id);
}

export async function wipeTableRows(apiBase, jwt, tableId) {
  for (;;) {
    const batch = await jwtRequest(
      apiBase,
      jwt,
      `/api/database/rows/table/${tableId}/?user_field_names=true&size=200&page=1`,
    );
    const ids = (batch.results || []).map((row) => row.id);
    if (!ids.length) break;
    await jwtRequest(apiBase, jwt, `/api/database/rows/table/${tableId}/batch-delete/`, {
      method: "POST",
      body: JSON.stringify({ items: ids }),
    });
    if (!batch.next) break;
  }
}
