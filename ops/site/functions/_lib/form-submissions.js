/**
 * Website form submissions (Baserow "Form Submissions").
 * Uses the marketing token (BASEROW_WEBSITE_API_KEY), not the Ops database token.
 */
import { listAllRows, listAllTables } from "./baserow.js";

export const FORM_SUBMISSIONS_TABLE_NAME = "Form Submissions";

const NAME_KEYS = ["name", "full_name", "fullname", "your_name"];

function selectValue(field) {
  if (field == null) return "";
  if (typeof field === "string") return field;
  if (typeof field === "object" && field.value != null) return String(field.value);
  return String(field);
}

function isCurrentRow(row) {
  const value = row?.Current;
  if (value == null || value === "") return true;
  return value === true || value === "true" || value === 1;
}

function websiteEnv(env) {
  const key = env.BASEROW_WEBSITE_API_KEY?.trim();
  if (!key) {
    const error = new Error(
      "BASEROW_WEBSITE_API_KEY is not configured. Run npm run env:ops:pull.",
    );
    error.status = 503;
    throw error;
  }
  return { ...env, BASEROW_API_KEY: key };
}

function parseEntries(row) {
  const rawField = row?.Answers;
  if (typeof rawField !== "string" || !rawField.trim()) return [];
  try {
    const parsed = JSON.parse(rawField);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.entries)) {
      return parsed.entries;
    }
  } catch {
    return [];
  }
  return [];
}

function personName(entries) {
  for (const key of NAME_KEYS) {
    const hit = entries.find(
      (entry) => entry?.key === key && String(entry.value ?? "").trim(),
    );
    if (hit) return String(hit.value).trim();
  }
  const skip = new Set(["email", "reply_to"]);
  const text = entries.find((entry) => {
    const value = String(entry?.value ?? "").trim();
    return entry?.key && !skip.has(entry.key) && value && !value.includes("@");
  });
  return text ? String(text.value).trim() : "";
}

/** Shape one Baserow row for the ops list. */
export function mapFormSubmission(row) {
  const entries = parseEntries(row);
  const fromField = entries.find((entry) => entry?.key === "email");
  const email = String(row?.["Reply To"] ?? fromField?.value ?? "")
    .trim()
    .toLowerCase();
  const answers = entries
    .filter(
      (entry) =>
        entry?.key && entry.key !== "email" && !NAME_KEYS.includes(entry.key),
    )
    .map((entry) => ({
      key: String(entry.key),
      label: String(entry.label || entry.key),
      value: String(entry.value ?? "").trim(),
    }))
    .filter((entry) => entry.value);
  const formSlug = String(row?.["Form Slug"] ?? "").trim();
  const formTitle = String(row?.["Form Title"] ?? "").trim() || formSlug || "Form";
  return {
    id: String(row?.id ?? ""),
    formSlug,
    formTitle,
    email,
    name: personName(entries),
    status: selectValue(row?.Status),
    submittedAt: typeof row?.Submitted === "string" ? row.Submitted : "",
    current: isCurrentRow(row),
    answers,
  };
}

async function resolveTableId(env) {
  const tables = await listAllTables(websiteEnv(env));
  const name =
    env.BASEROW_FORM_SUBMISSIONS_TABLE_NAME?.trim() || FORM_SUBMISSIONS_TABLE_NAME;
  const databaseId = env.BASEROW_WEBSITE_DATABASE_ID?.trim() || "";
  let matches = (Array.isArray(tables) ? tables : []).filter(
    (table) => table.name === name,
  );
  if (databaseId) {
    matches = matches.filter((table) => String(table.database_id) === databaseId);
  }
  if (matches.length === 1) return String(matches[0].id);
  const error = new Error(
    matches.length === 0
      ? `Baserow table "${name}" not found. Run npm run setup:baserow-form-submissions.`
      : `Multiple Baserow tables named "${name}". Set BASEROW_WEBSITE_DATABASE_ID.`,
  );
  error.status = 503;
  throw error;
}

function submittedTime(value) {
  const time = Date.parse(value || "");
  return Number.isNaN(time) ? 0 : time;
}

/** Current submissions, newest first. Earlier versions (Current = false) stay out. */
export async function listFormSubmissions(env) {
  const tableId = await resolveTableId(env);
  const rows = await listAllRows(websiteEnv(env), tableId);
  return rows
    .map(mapFormSubmission)
    .filter((row) => row.id && row.current)
    .sort((a, b) => submittedTime(b.submittedAt) - submittedTime(a.submittedAt));
}
