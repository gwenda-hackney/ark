/**
 * The Website Baserow database, for the guests adapters: its tables by name.
 * `env` carries the Website token as BASEROW_API_KEY (ops passes its
 * BASEROW_WEBSITE_API_KEY that way). A token that can see more than one
 * Website database needs BASEROW_DATABASE_ID.
 */
import { listAllTables } from "../../baserow.js";

export const SUBSCRIBERS_TABLE = "Subscribers";
export const FORM_SUBMISSIONS_TABLE = "Form Submissions";

/** Per token, table and database: a Worker or Function resolves each table once. */
const tableIds = new Map();

export function clearWebsiteTableIds() {
  tableIds.clear();
}

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/** The table's id; throws (503) when it isn't there or the token sees two. */
export async function websiteTableId(env, name) {
  const databaseId = String(env.BASEROW_DATABASE_ID || "").trim();
  const key = `${env.BASEROW_API_KEY}:${name}:${databaseId}`;
  if (tableIds.has(key)) return tableIds.get(key);
  let matches = (await listAllTables(env)).filter(
    (table) => table.name === name,
  );
  if (databaseId)
    matches = matches.filter(
      (table) => String(table.database_id) === databaseId,
    );
  if (!matches.length)
    throw httpError(`Baserow table "${name}" not found.`, 503);
  if (matches.length > 1)
    throw httpError(
      `Multiple Baserow tables named "${name}". Scope the token to the Website database.`,
      503,
    );
  const id = String(matches[0].id);
  tableIds.set(key, id);
  return id;
}

/** Baserow's single select: `{ value }`, a string or nothing. */
export function selectValue(field) {
  if (field == null) return "";
  if (typeof field === "object") return String(field.value ?? "");
  return String(field);
}

export const text = (value) => (value == null ? "" : String(value));

/** A date or datetime column: its ISO text, or null when empty. */
export const moment = (value) =>
  typeof value === "string" && value ? value : null;

/** A 400 Baserow gives a write that breaks a unique or field constraint. */
export function isConstraintError(error) {
  return (
    error?.status === 400 &&
    /ERROR_FIELD_DATA_CONSTRAINT|field constraint|unique|duplicate|already exists/i.test(
      String(error?.message),
    )
  );
}
