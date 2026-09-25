import { baserowFormSubmissionRowsUrl } from "./baserow.js";
import { reportFormError } from "../../../../shared/forms/form-alert.js";
import { log } from "../../../../shared/log.js";
import { diffFormAnswers } from "./form-submit.js";
import { replyToFromAnswers } from "../../../../shared/forms/format.js";
import {
  FORM_EDIT_LINK_FIELD,
  FORM_EMAIL_SENT_FIELDS,
} from "../../../../shared/forms/submission-fields.js";

export { FORM_EMAIL_SENT_FIELDS };

async function reportStoreFailure(env, extra) {
  await reportFormError(env, "form_store_failed", extra);
}

export const FORM_STATUS_PENDING = "Pending";
export const FORM_STATUS_VERIFIED = "Verified";

export const MARK_RETRY_DELAY_MS = 750;

/** Baserow's 5xx pages are HTML; an alert should say what happened, not paste the page. */
export function readableUpstreamDetail(status, detail) {
  const text = String(detail || "");
  if (/<html|<!doctype/i.test(text)) return `Baserow server error (${status}).`;
  return text.slice(0, 300);
}

function selectValue(field) {
  if (field == null) return "";
  if (typeof field === "string") return field;
  if (typeof field === "object" && field.value != null)
    return String(field.value);
  return String(field);
}

function isCurrentRow(row) {
  const value = row?.Current;
  return value === true || value === "true" || value === 1;
}

/**
 * Persist a validated form submission as a document row in Baserow.
 * @param {Record<string, string | undefined>} env
 * @param {{
 *   form: { title?: string, slug?: string },
 *   answers: Array<{ key: string, label: string, value: string }>,
 *   rawAnswers?: Record<string, string | string[]>,
 *   submittedAt?: string,
 *   status?: string,
 *   current?: boolean,
 * }} params
 * @returns {Promise<{ ok: true, rowId: string, updated: false } | { ok: false, error: string }>}
 */
export async function storeFormSubmission(
  env,
  {
    form,
    answers,
    rawAnswers,
    submittedAt,
    status = FORM_STATUS_VERIFIED,
    current = true,
  },
) {
  const resolved = await baserowFormSubmissionRowsUrl(env);
  if (!resolved.ok) {
    await reportStoreFailure(env, {
      op: "write",
      slug: form.slug ?? "",
      error: resolved.error,
    });
    return resolved;
  }

  const when = submittedAt || new Date().toISOString();
  const replyToRaw = replyToFromAnswers(answers);
  const normalized = normalizeAnswersEmail(answers, rawAnswers, replyToRaw);

  const upstream = await fetch(resolved.rowsUrl, {
    method: "POST",
    headers: {
      Authorization: `Token ${resolved.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      "Form Slug": form.slug ?? "",
      Submitted: when,
      "Form Title": form.title ?? "",
      "Reply To": normalized.replyTo || "",
      Status: status,
      Current: Boolean(current),
      Answers: serializeFormAnswers(normalized.entries, normalized.raw),
    }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    await reportStoreFailure(env, {
      op: "write",
      slug: form.slug ?? "",
      status: upstream.status,
      detail: detail.slice(0, 300),
    });
    return { ok: false, error: "Could not save. Try again?" };
  }

  const row = await upstream.json().catch(() => null);
  return { ok: true, rowId: String(row?.id ?? ""), updated: false };
}

/**
 * Mark prior rows for this form+email as not current (keeps history flat in one table).
 */
async function markRowsNotCurrent(env, rows) {
  const resolved = await baserowFormSubmissionRowsUrl(env);
  if (!resolved.ok) {
    await reportStoreFailure(env, { op: "demote", error: resolved.error });
    return resolved;
  }

  const targets = (rows ?? []).filter(
    (row) => row?.id && (isCurrentRow(row) || row.Current == null),
  );
  for (const row of targets) {
    const upstream = await fetch(resolved.rowUrl(String(row.id)), {
      method: "PATCH",
      headers: {
        Authorization: `Token ${resolved.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ Current: false }),
    });
    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      await reportStoreFailure(env, {
        op: "demote",
        status: upstream.status,
        detail: detail.slice(0, 300),
      });
      return { ok: false, error: "Could not save. Try again?" };
    }
  }
  return { ok: true };
}

/**
 * Upsert by form slug + email.
 * Pending rows are patched in place. Verified resubmits insert a new Current row
 * and demote the previous one (flat history until a dedicated table exists).
 * @returns {Promise<
 *   | {
 *       ok: true,
 *       rowId: string,
 *       updated: boolean,
 *       previousAnswers?: Array<{ key: string, label: string, value: string }>,
 *       changes?: Array<{ key: string, label: string, from: string, to: string }>,
 *     }
 *   | { ok: false, error: string }
 * >}
 */
export async function upsertFormSubmission(
  env,
  { form, answers, rawAnswers, submittedAt, status = FORM_STATUS_VERIFIED },
) {
  const replyToRaw = replyToFromAnswers(answers);
  const normalized = normalizeAnswersEmail(answers, rawAnswers, replyToRaw);
  const slug = String(form?.slug ?? "").trim();

  if (normalized.replyTo && slug) {
    const existing = await findFormSubmissionByEmail(env, {
      slug,
      email: normalized.replyTo,
    });
    if (!existing.ok) return existing;

    if (existing.row?.id) {
      const priorStatus = formSubmissionStatus(existing.row);
      const previousAnswers = parseFormSubmissionAnswers(existing.row);
      const changes = diffFormAnswers(
        previousAnswers,
        normalized.entries,
        form,
      );

      // Still awaiting confirm: edit the pending row in place.
      if (priorStatus === FORM_STATUS_PENDING) {
        const resolved = await baserowFormSubmissionRowsUrl(env);
        if (!resolved.ok) return resolved;

        const when = submittedAt || new Date().toISOString();
        const upstream = await fetch(resolved.rowUrl(String(existing.row.id)), {
          method: "PATCH",
          headers: {
            Authorization: `Token ${resolved.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            Submitted: when,
            "Form Title": form.title ?? "",
            "Reply To": normalized.replyTo,
            Status: status,
            Current: true,
            Answers: serializeFormAnswers(normalized.entries, normalized.raw),
          }),
        });

        if (!upstream.ok) {
          const detail = await upstream.text().catch(() => "");
          await reportStoreFailure(env, {
            op: "upsert",
            slug,
            status: upstream.status,
            detail: detail.slice(0, 300),
          });
          return { ok: false, error: "Could not save. Try again?" };
        }

        return {
          ok: true,
          rowId: String(existing.row.id),
          updated: true,
          previousAnswers,
          changes,
        };
      }

      // Verified (or other): keep prior row as history, insert new Current.
      const demoted = await markRowsNotCurrent(
        env,
        existing.matches ?? [existing.row],
      );
      if (!demoted.ok) return demoted;

      const stored = await storeFormSubmission(env, {
        form,
        answers: normalized.entries,
        rawAnswers: normalized.raw ?? undefined,
        submittedAt,
        status,
        current: true,
      });
      if (!stored.ok) return stored;

      return {
        ok: true,
        rowId: stored.rowId,
        updated: true,
        previousAnswers,
        changes,
      };
    }
  }

  return storeFormSubmission(env, {
    form,
    answers: normalized.entries,
    rawAnswers: normalized.raw ?? undefined,
    submittedAt,
    status,
    current: true,
  });
}

/**
 * @returns {Promise<
 *   | { ok: true, row: Record<string, unknown> }
 *   | { ok: false, error: string }
 * >}
 */
export async function fetchFormSubmissionRow(env, rowId) {
  const resolved = await baserowFormSubmissionRowsUrl(env);
  if (!resolved.ok) return resolved;

  const id = String(rowId ?? "").trim();
  if (!id) return { ok: false, error: "Missing submission." };

  const upstream = await fetch(resolved.rowUrl(id), {
    headers: { Authorization: `Token ${resolved.apiKey}` },
  });

  if (upstream.status === 404) {
    return { ok: false, error: "Submission not found." };
  }
  if (!upstream.ok) {
    return { ok: false, error: "Could not load submission." };
  }

  const row = await upstream.json();
  return { ok: true, row };
}

/**
 * Latest / current submission for this form + email.
 * Prefers Current=true; falls back to newest Submitted.
 * Matches Reply To case-insensitively so legacy mixed-case rows still upsert.
 * @returns {Promise<
 *   | {
 *       ok: true,
 *       row: Record<string, unknown> | null,
 *       matches?: Array<Record<string, unknown>>,
 *     }
 *   | { ok: false, error: string }
 * >}
 */
export async function findFormSubmissionByEmail(env, { slug, email }) {
  const resolved = await baserowFormSubmissionRowsUrl(env);
  if (!resolved.ok) return resolved;

  const cleanSlug = String(slug ?? "").trim();
  const cleanEmail = String(email ?? "")
    .trim()
    .toLowerCase();
  if (!cleanSlug || !cleanEmail) {
    return { ok: true, row: null };
  }

  const url = new URL(resolved.rowsUrl);
  url.searchParams.set("filter__Form Slug__equal", cleanSlug);
  url.searchParams.set("order_by", "-Submitted");
  url.searchParams.set("size", "100");

  const upstream = await fetch(url.toString(), {
    headers: { Authorization: `Token ${resolved.apiKey}` },
  });
  if (!upstream.ok) {
    return { ok: false, error: "Could not look up submission." };
  }

  const body = await upstream.json().catch(() => null);
  const rows = Array.isArray(body?.results) ? body.results : [];
  const matches = rows.filter((row) => {
    const reply = String(row?.["Reply To"] ?? "")
      .trim()
      .toLowerCase();
    return reply === cleanEmail;
  });
  const current = matches.find((row) => isCurrentRow(row));
  return { ok: true, row: current ?? matches[0] ?? null, matches };
}

function normalizeAnswersEmail(entries, raw, replyTo) {
  const email = String(replyTo ?? "")
    .trim()
    .toLowerCase();
  const nextEntries = (entries ?? []).map((row) =>
    row.key === "email" ? { ...row, value: email || row.value } : row,
  );
  let nextRaw = raw;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    nextRaw = { ...raw };
    if (email) nextRaw.email = email;
  }
  return { entries: nextEntries, raw: nextRaw, replyTo: email };
}

export function formSubmissionStatus(row) {
  return selectValue(row?.Status);
}

/**
 * Normalize Baserow Answers JSON (legacy array or { entries, raw }).
 * @returns {{
 *   entries: Array<{ key: string, label: string, value: string }>,
 *   raw: Record<string, string | string[]> | null,
 * }}
 */
export function parseFormSubmissionDocument(row) {
  const rawField = row?.Answers;
  if (typeof rawField !== "string" || !rawField.trim()) {
    return { entries: [], raw: null };
  }
  try {
    const parsed = JSON.parse(rawField);
    if (Array.isArray(parsed)) {
      return { entries: parsed, raw: null };
    }
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.entries)) {
      const raw =
        parsed.raw &&
        typeof parsed.raw === "object" &&
        !Array.isArray(parsed.raw)
          ? parsed.raw
          : null;
      return { entries: parsed.entries, raw };
    }
    return { entries: [], raw: null };
  } catch {
    return { entries: [], raw: null };
  }
}

export function parseFormSubmissionAnswers(row) {
  return parseFormSubmissionDocument(row).entries;
}

/** Form-field values for restoring the client form (prefers raw snapshot). */
export function draftAnswersFromSubmission(row) {
  const doc = parseFormSubmissionDocument(row);
  if (doc.raw) return doc.raw;
  /** @type {Record<string, string>} */
  const out = {};
  for (const entry of doc.entries) {
    if (!entry?.key) continue;
    out[entry.key] = String(entry.value ?? "");
  }
  return out;
}

function serializeFormAnswers(entries, raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return JSON.stringify({ v: 1, entries, raw });
  }
  return JSON.stringify(entries);
}

/**
 * Update reply-to / email on a pending row (typo fix + resend).
 */
export async function updateFormSubmissionEmail(env, rowId, email) {
  const resolved = await baserowFormSubmissionRowsUrl(env);
  if (!resolved.ok) return resolved;

  const id = String(rowId ?? "").trim();
  const cleanEmail = String(email ?? "")
    .trim()
    .toLowerCase();
  if (!id || !cleanEmail) {
    return { ok: false, error: "Missing email." };
  }

  const loaded = await fetchFormSubmissionRow(env, id);
  if (!loaded.ok) return loaded;

  const doc = parseFormSubmissionDocument(loaded.row);
  const nextEntries = doc.entries.map((row) =>
    row.key === "email" ? { ...row, value: cleanEmail } : row,
  );
  const nextRaw = doc.raw ? { ...doc.raw, email: cleanEmail } : null;

  const upstream = await fetch(resolved.rowUrl(id), {
    method: "PATCH",
    headers: {
      Authorization: `Token ${resolved.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      "Reply To": cleanEmail,
      Answers: serializeFormAnswers(nextEntries, nextRaw),
    }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    await reportStoreFailure(env, {
      op: "email_update",
      status: upstream.status,
      detail: detail.slice(0, 300),
    });
    return { ok: false, error: "Could not update. Try again?" };
  }

  return { ok: true, answers: nextEntries };
}

/**
 * Mark a pending submission verified. Idempotent if already verified.
 * @returns {Promise<
 *   | { ok: true, already?: boolean, answers: Array, formSlug: string, formTitle: string, submittedAt?: string }
 *   | { ok: false, error: string }
 * >}
 */
export async function markFormSubmissionVerified(env, rowId, expectedEmail) {
  const loaded = await fetchFormSubmissionRow(env, rowId);
  if (!loaded.ok) return loaded;

  const { row } = loaded;
  const status = formSubmissionStatus(row);
  const answers = parseFormSubmissionAnswers(row);
  const formSlug = String(row["Form Slug"] ?? "");
  const formTitle = String(row["Form Title"] ?? "");
  const submittedAt =
    typeof row.Submitted === "string" ? row.Submitted : undefined;
  const replyTo = String(row["Reply To"] ?? "")
    .trim()
    .toLowerCase();
  const expected = String(expectedEmail ?? "")
    .trim()
    .toLowerCase();

  if (expected && replyTo && replyTo !== expected) {
    return { ok: false, error: "This link isn't valid." };
  }

  if (status === FORM_STATUS_VERIFIED) {
    return {
      ok: true,
      already: true,
      answers,
      formSlug,
      formTitle,
      submittedAt,
    };
  }

  if (status && status !== FORM_STATUS_PENDING) {
    return { ok: false, error: "This submission can't be confirmed." };
  }

  const resolved = await baserowFormSubmissionRowsUrl(env);
  if (!resolved.ok) return resolved;

  const upstream = await fetch(resolved.rowUrl(String(rowId)), {
    method: "PATCH",
    headers: {
      Authorization: `Token ${resolved.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ Status: FORM_STATUS_VERIFIED }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    await reportStoreFailure(env, {
      op: "verify",
      status: upstream.status,
      detail: detail.slice(0, 300),
    });
    return { ok: false, error: "Could not confirm. Try again?" };
  }

  return {
    ok: true,
    already: false,
    answers,
    formSlug,
    formTitle,
    submittedAt,
  };
}

/**
 * Stamp the row after an email actually went out (one column per email kind).
 * @param {"notify" | "receipt"} kind
 * @returns {Promise<{ ok: true, sentAt: string } | { ok: false, error: string }>}
 */
export async function markFormSubmissionEmailSent(env, rowId, kind, sentAt) {
  const field = FORM_EMAIL_SENT_FIELDS[kind];
  const id = String(rowId ?? "").trim();
  if (!field || !id) return { ok: false, error: "Missing submission." };

  const resolved = await baserowFormSubmissionRowsUrl(env);
  if (!resolved.ok) return resolved;

  const when = sentAt || new Date().toISOString();
  const patch = () =>
    fetch(resolved.rowUrl(id), {
      method: "PATCH",
      headers: {
        Authorization: `Token ${resolved.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ [field]: when }),
    });
  let upstream = await patch();
  // Baserow occasionally answers 5xx for a moment; the email already went out,
  // so one retry saves a false "Not sent" in ops and a needless alert.
  if (upstream.status >= 500) {
    await new Promise((resolve) => setTimeout(resolve, MARK_RETRY_DELAY_MS));
    upstream = await patch();
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    await reportStoreFailure(env, {
      op: `mark_${kind}_sent`,
      status: upstream.status,
      detail: readableUpstreamDetail(upstream.status, detail),
    });
    return { ok: false, error: "Could not mark email sent." };
  }
  return { ok: true, sentAt: when };
}

/** Set once the Edit Link column is seen, so later saves skip the check. */
let editLinkColumnSeen = false;

export function resetEditLinkColumnForTests() {
  editLinkColumnSeen = false;
}

/** The column arrives by a pre-deploy migration; a database without it yet is fine. */
async function hasEditLinkColumn(resolved) {
  if (editLinkColumnSeen) return true;
  const upstream = await fetch(resolved.fieldsUrl, {
    headers: { Authorization: `Token ${resolved.apiKey}` },
  });
  if (!upstream.ok) return false;
  const fields = await upstream.json().catch(() => []);
  editLinkColumnSeen =
    Array.isArray(fields) && fields.some((field) => field?.name === FORM_EDIT_LINK_FIELD);
  return editLinkColumnSeen;
}

/**
 * Save the receipt's edit link on the row, so ops can resend the receipt
 * without the signing secret or this site's address. Best effort: a missing
 * link only means ops's resend links to the form instead.
 */
export async function saveFormEditLink(env, rowId, editUrl) {
  const id = String(rowId ?? "").trim();
  if (!id || !editUrl) return { ok: false, error: "Missing submission." };

  const resolved = await baserowFormSubmissionRowsUrl(env);
  if (!resolved.ok) return resolved;
  if (!(await hasEditLinkColumn(resolved))) {
    log.event("warn", "form_edit_link_column_missing", { rowId: id });
    return { ok: false, skipped: true, error: "No Edit Link column yet." };
  }

  const upstream = await fetch(resolved.rowUrl(id), {
    method: "PATCH",
    headers: {
      Authorization: `Token ${resolved.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ [FORM_EDIT_LINK_FIELD]: editUrl }),
  });
  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    await reportStoreFailure(env, {
      op: "save_edit_link",
      status: upstream.status,
      detail: readableUpstreamDetail(upstream.status, detail),
    });
    return { ok: false, error: "Could not save the edit link." };
  }
  return { ok: true };
}

/** Remove one submission row (used by the post-deploy form test to clean up). */
export async function deleteFormSubmission(env, rowId) {
  const id = String(rowId ?? "").trim();
  if (!id) return { ok: false, error: "Missing submission." };
  const resolved = await baserowFormSubmissionRowsUrl(env);
  if (!resolved.ok) return resolved;
  const upstream = await fetch(resolved.rowUrl(id), {
    method: "DELETE",
    headers: { Authorization: `Token ${resolved.apiKey}` },
  });
  if (!upstream.ok && upstream.status !== 404) {
    return { ok: false, error: `Baserow ${upstream.status} deleting the test row.` };
  }
  return { ok: true };
}
