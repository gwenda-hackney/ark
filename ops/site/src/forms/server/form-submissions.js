/**
 * Website form submissions (Baserow "Form Submissions").
 * Uses the marketing token (BASEROW_WEBSITE_API_KEY), not the Ops database token.
 */
import { FORM_QUERY } from "../../../../../shared/forms/format.js";
import {
  sendFormNotificationEmail,
  sendFormReceiptEmail,
} from "../../../../../shared/forms/form-email.js";
import {
  FORM_EDIT_LINK_FIELD,
  FORM_EMAIL_SENT_FIELDS,
} from "../../../../../shared/forms/submission-fields.js";
import { SITE_DOMAIN } from "../../../../../shared/site-location.js";
import { getRow, listAllRows, listAllTables, updateRow } from "../../../../../shared/baserow.js";
import { sanityQuery } from "../../platform/sanity.js";
import { listEvents, normalizePageUrl, saveOccurrences, updateEvent } from "../../events/server/event-store.js";
import { todayIso } from "../../events/event-recurrence.js";
import {
  DECISIONS,
  emailKey,
  guestArtistsByEmail,
  planArtistUpdate,
  saveGuestArtist,
} from "../../artists/server/guest-artists.js";

export const FORM_SUBMISSIONS_TABLE_NAME = "Form Submissions";

const PLAY_FORM = "play";

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
      "BASEROW_WEBSITE_API_KEY is not configured. Locally, run bw-unlock and restart.",
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
    notifySentAt: dateValue(row?.[FORM_EMAIL_SENT_FIELDS.notify]),
    receiptSentAt: dateValue(row?.[FORM_EMAIL_SENT_FIELDS.receipt]),
    answers,
  };
}

function dateValue(value) {
  return typeof value === "string" ? value : "";
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

/**
 * Ops' record for each play applicant (Guest artists, by email): decision and
 * ops' artist name and link. Submissions themselves are never changed.
 */
export function withGuestRecords(submissions, records) {
  return submissions.map((row) => {
    const record = row.formSlug === PLAY_FORM ? records.get(row.email) : null;
    return {
      ...row,
      decision: record?.decision || "",
      artistName: record?.artistName || "",
      artistLink: record?.artistLink || "",
      submitted: row.formSlug === PLAY_FORM ? submittedArtist(row) : null,
    };
  });
}

/** Current submissions, newest first. Earlier versions (Current = false) stay out. */
export async function listFormSubmissions(env) {
  const tableId = await resolveTableId(env);
  const [rows, records] = await Promise.all([
    listAllRows(websiteEnv(env), tableId),
    guestArtistsByEmail(env),
  ]);
  const current = rows
    .map(mapFormSubmission)
    .filter((row) => row.id && row.current)
    .sort((a, b) => submittedTime(b.submittedAt) - submittedTime(a.submittedAt));
  return withGuestRecords(current, records);
}

function answer(submission, key) {
  return submission.answers.find((entry) => entry.key === key)?.value || "";
}

/** Their "Instagram or website" answer as a link, or "" when it isn't one. */
export function artistLink(value) {
  try {
    return normalizePageUrl(value);
  } catch {
    return "";
  }
}

/** What they sent: artist name and their "Instagram or website", as a link. */
export function submittedArtist(submission) {
  return {
    name: answer(submission, "artistName") || submission.name,
    link: artistLink(answer(submission, "instagram")),
  };
}

/** Approved play applications, for picking a guest artist. Ops' copy wins. */
export function approvedArtists(submissions) {
  const seen = new Set();
  const out = [];
  for (const row of submissions) {
    if (row.formSlug !== PLAY_FORM || row.decision !== "Approved") continue;
    const sent = submittedArtist(row);
    const name = row.artistName || sent.name;
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({ id: row.id, name, link: row.artistLink || sent.link });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function listApprovedArtists(env) {
  return approvedArtists(await listFormSubmissions(env));
}

/** The play application behind a submission id; ops keeps its record by their email. */
async function playSubmission(env, rowId) {
  const tableId = await resolveTableId(env);
  let row;
  try {
    row = mapFormSubmission(await getRow(websiteEnv(env), tableId, rowId));
  } catch (error) {
    if (error?.status === 404) throw httpError("Submission not found.", 404);
    throw error;
  }
  if (row.formSlug !== PLAY_FORM) throw httpError("Only play applications can be approved.", 400);
  return row;
}

/** Approve or decline an applicant ("" clears the decision). */
export async function setFormDecision(env, rowId, decision) {
  const value = String(decision || "");
  if (value && !DECISIONS.includes(value)) {
    throw httpError(`decision must be ${DECISIONS.join(" or ")}.`, 400);
  }
  const row = await playSubmission(env, rowId);
  const saved = await saveGuestArtist(env, row.email, { decision: value });
  return { ok: true, decision: saved.decision };
}

/**
 * Ops' copy of an applicant's artist name and link. Empty means use what
 * they sent. Their answers are never changed. Upcoming events still showing
 * the old name and link get the new ones (planArtistUpdate); the website
 * follows on the next Update website.
 */
export async function setFormArtist(env, rowId, { name = "", link = "" } = {}) {
  const artistName = String(name || "").trim();
  if (artistName.length > 120) throw httpError("Artist name is too long.", 400);
  let artistLink;
  try {
    artistLink = normalizePageUrl(link);
  } catch (error) {
    throw httpError(error.message, 400);
  }
  const row = await playSubmission(env, rowId);
  const sent = submittedArtist(row);
  const before = (await guestArtistsByEmail(env)).get(emailKey(row.email));
  const saved = await saveGuestArtist(env, row.email, { artistName, artistLink });
  const from = { name: before?.artistName || sent.name, link: before?.artistLink || sent.link };
  const to = { name: saved.artistName || sent.name, link: saved.artistLink || sent.link };
  const plan = planArtistUpdate(await listEvents(env), { from, to }, todayIso());
  for (const { id, patch } of plan.series) await updateEvent(env, id, patch);
  for (const { eventId, rows } of plan.nights) await saveOccurrences(env, eventId, rows);
  const eventsUpdated = new Set([
    ...plan.series.map((item) => item.id),
    ...plan.nights.map((item) => item.eventId),
  ]).size;
  return { ok: true, artistName: saved.artistName, artistLink: saved.artistLink, eventsUpdated };
}

export const FORM_EMAIL_KINDS = ["notify", "receipt"];

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/**
 * Resend one email for a submission: render it from the stored row and the
 * Sanity form (the same code the website uses), send it, and stamp the row.
 * @param {"notify" | "receipt"} kind
 * @returns {Promise<{ ok: true, sentAt?: string | null, dryRun?: boolean, warning?: string }>}
 */
export async function resendFormEmail(env, rowId, kind) {
  if (!FORM_EMAIL_KINDS.includes(kind)) {
    throw httpError("kind must be notify or receipt.", 400);
  }
  const tableId = await resolveTableId(env);
  let row;
  try {
    row = await getRow(websiteEnv(env), tableId, rowId);
  } catch (error) {
    if (error?.status === 404) throw httpError("Submission not found.", 404);
    throw error;
  }

  const slug = String(row?.["Form Slug"] ?? "").trim();
  // The form as the live site shows it (drafts never reach the website).
  const form = slug
    ? await sanityQuery(env, "production", FORM_QUERY, { slug })
    : null;
  if (!form) throw httpError(`Form "${slug}" is not in Sanity.`, 404);
  const answers = parseEntries(row);

  let sent;
  if (kind === "notify") {
    sent = await sendFormNotificationEmail(env, { form, answers });
  } else {
    const email = String(row["Reply To"] ?? "").trim().toLowerCase();
    if (!email) throw httpError("Submission has no reply-to email.", 400);
    // Rows from before the website saved the link fall back to the form's page.
    const editUrl =
      String(row[FORM_EDIT_LINK_FIELD] ?? "").trim() ||
      `${SITE_DOMAIN}/contact/${encodeURIComponent(slug)}`;
    sent = await sendFormReceiptEmail(env, { form, answers, email, editUrl });
  }
  if (!sent.ok) throw httpError(sent.error || "Could not send.", 502);
  if (sent.dryRun) return { ok: true, dryRun: true };

  const sentAt = new Date().toISOString();
  try {
    await updateRow(websiteEnv(env), tableId, rowId, {
      [FORM_EMAIL_SENT_FIELDS[kind]]: sentAt,
    });
  } catch {
    return { ok: true, sentAt: null, warning: "Sent, but could not mark it sent." };
  }
  return { ok: true, sentAt };
}
