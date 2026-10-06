/**
 * Website form submissions, through the guests repository
 * (shared/guests/form-submission-repository.js). On Baserow it uses the
 * website's token (BASEROW_WEBSITE_API_KEY), not the Ops database token.
 */
import { FORM_QUERY } from "../../../../../shared/forms/format.js";
import {
  sendFormNotificationEmail,
  sendFormReceiptEmail,
} from "../../../../../shared/forms/form-email.js";
import { SITE_DOMAIN } from "../../../../../shared/site-location.js";
import { baserowFormSubmissionRepository } from "../../../../../shared/guests/adapters/baserow-form-submissions.js";
import { formSubmissionRepository } from "../../../../../shared/guests/form-submission-repository.js";
import { FORM_EMAIL_SENT, answersDocument } from "../../../../../shared/guests/form-submissions.js";
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

const PLAY_FORM = "play";

const NAME_KEYS = ["name", "full_name", "fullname", "your_name"];

function websiteEnv(env) {
  const key = env.BASEROW_WEBSITE_API_KEY?.trim();
  if (!key) {
    const error = new Error(
      "BASEROW_WEBSITE_API_KEY is not configured. Locally, run bw-unlock and restart.",
    );
    error.status = 503;
    throw error;
  }
  return {
    ...env,
    BASEROW_API_KEY: key,
    BASEROW_DATABASE_ID: env.BASEROW_WEBSITE_DATABASE_ID?.trim() || "",
  };
}

/** Submissions wherever guests live; on Baserow with the website's token. */
function submissions(env) {
  return formSubmissionRepository(env, {
    baserow: (env) => baserowFormSubmissionRepository(websiteEnv(env)),
  });
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

/** Shape one submission for the ops list. */
export function mapFormSubmission(submission) {
  const entries = answersDocument(submission.answers).entries;
  const fromField = entries.find((entry) => entry?.key === "email");
  const email = String(submission.replyTo || fromField?.value || "")
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
  const formSlug = submission.formSlug.trim();
  const formTitle = submission.formTitle.trim() || formSlug || "Form";
  return {
    id: String(submission.id),
    formSlug,
    formTitle,
    email,
    name: personName(entries),
    status: submission.status,
    submittedAt: submission.submittedAt || "",
    current: submission.current,
    notifySentAt: submission.notifySentAt || "",
    receiptSentAt: submission.receiptSentAt || "",
    answers,
  };
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

/** Current submissions, newest first. Earlier versions (not current) stay out. */
export async function listFormSubmissions(env) {
  const [current, records] = await Promise.all([
    submissions(env).listCurrent(),
    guestArtistsByEmail(env),
  ]);
  return withGuestRecords(current.map(mapFormSubmission), records);
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
  const row = mapFormSubmission(await findSubmission(env, rowId));
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

/** The submission with this id; a 404 when there is none. */
async function findSubmission(env, rowId) {
  const found = Number(rowId) ? await submissions(env).get(Number(rowId)) : null;
  if (!found) throw httpError("Submission not found.", 404);
  return found;
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
  const row = await findSubmission(env, rowId);
  const slug = row.formSlug.trim();
  // The form as the live site shows it (drafts never reach the website).
  const form = slug
    ? await sanityQuery(env, "production", FORM_QUERY, { slug })
    : null;
  if (!form) throw httpError(`Form "${slug}" is not in Sanity.`, 404);
  const answers = answersDocument(row.answers).entries;

  let sent;
  if (kind === "notify") {
    sent = await sendFormNotificationEmail(env, { form, answers });
  } else {
    const email = row.replyTo.trim().toLowerCase();
    if (!email) throw httpError("Submission has no reply-to email.", 400);
    // Rows from before the website saved the link fall back to the form's page.
    const editUrl =
      row.editLink.trim() ||
      `${SITE_DOMAIN}/contact/${encodeURIComponent(slug)}`;
    sent = await sendFormReceiptEmail(env, { form, answers, email, editUrl });
  }
  if (!sent.ok) throw httpError(sent.error || "Could not send.", 502);
  if (sent.dryRun) return { ok: true, dryRun: true };

  const sentAt = new Date().toISOString();
  try {
    await submissions(env).update(Number(rowId), { [FORM_EMAIL_SENT[kind]]: sentAt });
  } catch {
    return { ok: true, sentAt: null, warning: "Sent, but could not mark it sent." };
  }
  return { ok: true, sentAt };
}
