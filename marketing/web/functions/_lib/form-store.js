/**
 * The website's form submissions: save, resubmit, confirm and stamp them,
 * through the guests repository (shared/guests/form-submission-repository.js).
 * Functions return `{ ok: false, error }` instead of throwing, and report
 * failed writes to the alert inbox.
 */
import { reportFormError } from "../../../../shared/forms/form-alert.js";
import { log } from "../../../../shared/log.js";
import { diffFormAnswers } from "./form-submit.js";
import { replyToFromAnswers } from "../../../../shared/forms/format.js";
import { formSubmissionRepository } from "../../../../shared/guests/form-submission-repository.js";
import {
  FORM_EMAIL_SENT,
  FORM_STATUS_PENDING,
  FORM_STATUS_VERIFIED,
  answersDocument,
  answersValue,
} from "../../../../shared/guests/form-submissions.js";

export { FORM_STATUS_PENDING, FORM_STATUS_VERIFIED };

async function reportStoreFailure(env, extra) {
  await reportFormError(env, "form_store_failed", extra);
}

export const MARK_RETRY_DELAY_MS = 750;

/** Baserow's 5xx pages are HTML; an alert should say what happened, not paste the page. */
export function readableUpstreamDetail(status, detail) {
  const text = String(detail || "");
  if (/<html|<!doctype/i.test(text)) return `Baserow server error (${status}).`;
  return text.slice(0, 300);
}

const failure = (error) => ({
  status: error?.status,
  detail: readableUpstreamDetail(error?.status, error?.message),
});

const id = (rowId) => Number(String(rowId ?? "").trim()) || 0;

/**
 * Save a validated form submission as a new record.
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
  const normalized = normalizeAnswersEmail(
    answers,
    rawAnswers,
    replyToFromAnswers(answers),
  );
  try {
    const record = await formSubmissionRepository(env).create({
      formSlug: form.slug ?? "",
      submittedAt: submittedAt || new Date().toISOString(),
      formTitle: form.title ?? "",
      replyTo: normalized.replyTo || "",
      status,
      current: Boolean(current),
      answers: answersValue(normalized.entries, normalized.raw),
    });
    return { ok: true, rowId: String(record.id), updated: false };
  } catch (error) {
    await reportStoreFailure(env, {
      op: "write",
      slug: form.slug ?? "",
      ...failure(error),
    });
    return { ok: false, error: "Could not save. Try again?" };
  }
}

/**
 * Upsert by form slug + email.
 * Pending records are changed in place. Verified resubmits add a new current
 * record and the earlier ones stop being current (the history stays).
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
  const normalized = normalizeAnswersEmail(
    answers,
    rawAnswers,
    replyToFromAnswers(answers),
  );
  const slug = String(form?.slug ?? "").trim();
  const fresh = () =>
    storeFormSubmission(env, {
      form,
      answers: normalized.entries,
      rawAnswers: normalized.raw ?? undefined,
      submittedAt,
      status,
      current: true,
    });
  if (!normalized.replyTo || !slug) return fresh();

  const existing = await findFormSubmissionByEmail(env, {
    slug,
    email: normalized.replyTo,
  });
  if (!existing.ok) return existing;
  if (!existing.submission) return fresh();

  const previousAnswers = answersDocument(existing.submission.answers).entries;
  const changes = diffFormAnswers(previousAnswers, normalized.entries, form);
  const repo = formSubmissionRepository(env);

  try {
    // Still awaiting confirm: edit the pending record in place.
    if (existing.submission.status === FORM_STATUS_PENDING) {
      await repo.update(existing.submission.id, {
        submittedAt: submittedAt || new Date().toISOString(),
        formTitle: form.title ?? "",
        replyTo: normalized.replyTo,
        status,
        current: true,
        answers: answersValue(normalized.entries, normalized.raw),
      });
      return {
        ok: true,
        rowId: String(existing.submission.id),
        updated: true,
        previousAnswers,
        changes,
      };
    }

    // Verified (or other): keep the earlier records as history, add a current one.
    for (const record of existing.matches.filter((r) => r.current))
      await repo.update(record.id, { current: false });
  } catch (error) {
    await reportStoreFailure(env, {
      op:
        existing.submission.status === FORM_STATUS_PENDING
          ? "upsert"
          : "demote",
      slug,
      ...failure(error),
    });
    return { ok: false, error: "Could not save. Try again?" };
  }

  const stored = await fresh();
  if (!stored.ok) return stored;
  return {
    ok: true,
    rowId: stored.rowId,
    updated: true,
    previousAnswers,
    changes,
  };
}

/**
 * @returns {Promise<
 *   | { ok: true, submission: object }
 *   | { ok: false, error: string }
 * >}
 */
export async function fetchFormSubmission(env, rowId) {
  if (!id(rowId)) return { ok: false, error: "Missing submission." };
  try {
    const submission = await formSubmissionRepository(env).get(id(rowId));
    if (!submission) return { ok: false, error: "Submission not found." };
    return { ok: true, submission };
  } catch {
    return { ok: false, error: "Could not load submission." };
  }
}

/**
 * Latest / current submission for this form + email (any case).
 * Prefers the current one; falls back to the newest.
 * @returns {Promise<
 *   | { ok: true, submission: object | null, matches: object[] }
 *   | { ok: false, error: string }
 * >}
 */
export async function findFormSubmissionByEmail(env, { slug, email }) {
  const cleanSlug = String(slug ?? "").trim();
  const cleanEmail = String(email ?? "")
    .trim()
    .toLowerCase();
  if (!cleanSlug || !cleanEmail)
    return { ok: true, submission: null, matches: [] };
  try {
    const matches = await formSubmissionRepository(env).listForEmail(
      cleanSlug,
      cleanEmail,
    );
    const current = matches.find((record) => record.current);
    return { ok: true, submission: current ?? matches[0] ?? null, matches };
  } catch {
    return { ok: false, error: "Could not look up submission." };
  }
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

/** The labelled answers of a submission ([{ key, label, value }]). */
export function submissionAnswers(submission) {
  return answersDocument(submission?.answers).entries;
}

/** Form-field values for restoring the client form (prefers raw snapshot). */
export function draftAnswersFromSubmission(submission) {
  const doc = answersDocument(submission?.answers);
  if (doc.raw) return doc.raw;
  /** @type {Record<string, string>} */
  const out = {};
  for (const entry of doc.entries) {
    if (!entry?.key) continue;
    out[entry.key] = String(entry.value ?? "");
  }
  return out;
}

/**
 * Update reply-to / email on a pending submission (typo fix + resend).
 */
export async function updateFormSubmissionEmail(env, rowId, email) {
  const cleanEmail = String(email ?? "")
    .trim()
    .toLowerCase();
  if (!id(rowId) || !cleanEmail) return { ok: false, error: "Missing email." };

  const loaded = await fetchFormSubmission(env, rowId);
  if (!loaded.ok) return loaded;

  const doc = answersDocument(loaded.submission.answers);
  const nextEntries = doc.entries.map((row) =>
    row.key === "email" ? { ...row, value: cleanEmail } : row,
  );
  const nextRaw = doc.raw ? { ...doc.raw, email: cleanEmail } : null;

  try {
    await formSubmissionRepository(env).update(id(rowId), {
      replyTo: cleanEmail,
      answers: answersValue(nextEntries, nextRaw),
    });
  } catch (error) {
    await reportStoreFailure(env, { op: "email_update", ...failure(error) });
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
  const loaded = await fetchFormSubmission(env, rowId);
  if (!loaded.ok) return loaded;

  const { submission } = loaded;
  const answers = submissionAnswers(submission);
  const summary = {
    answers,
    formSlug: submission.formSlug,
    formTitle: submission.formTitle,
    submittedAt: submission.submittedAt ?? undefined,
  };
  const expected = String(expectedEmail ?? "")
    .trim()
    .toLowerCase();

  if (expected && submission.replyTo && submission.replyTo !== expected) {
    return { ok: false, error: "This link isn't valid." };
  }
  if (submission.status === FORM_STATUS_VERIFIED) {
    return { ok: true, already: true, ...summary };
  }
  if (submission.status && submission.status !== FORM_STATUS_PENDING) {
    return { ok: false, error: "This submission can't be confirmed." };
  }

  try {
    await formSubmissionRepository(env).update(submission.id, {
      status: FORM_STATUS_VERIFIED,
    });
  } catch (error) {
    await reportStoreFailure(env, { op: "verify", ...failure(error) });
    return { ok: false, error: "Could not confirm. Try again?" };
  }
  return { ok: true, already: false, ...summary };
}

/**
 * Stamp the submission after an email actually went out (one stamp per email kind).
 * @param {"notify" | "receipt"} kind
 * @returns {Promise<{ ok: true, sentAt: string } | { ok: false, error: string }>}
 */
export async function markFormSubmissionEmailSent(env, rowId, kind, sentAt) {
  const field = Object.hasOwn(FORM_EMAIL_SENT, kind)
    ? FORM_EMAIL_SENT[kind]
    : null;
  if (!field || !id(rowId)) return { ok: false, error: "Missing submission." };

  const when = sentAt || new Date().toISOString();
  const repo = formSubmissionRepository(env);
  const stamp = () => repo.update(id(rowId), { [field]: when });
  try {
    try {
      await stamp();
    } catch (error) {
      // Baserow occasionally answers 5xx for a moment; the email already went
      // out, so one retry saves a false "Not sent" in ops and a needless alert.
      if (!(error?.status >= 500)) throw error;
      await new Promise((resolve) => setTimeout(resolve, MARK_RETRY_DELAY_MS));
      await stamp();
    }
  } catch (error) {
    await reportStoreFailure(env, {
      op: `mark_${kind}_sent`,
      ...failure(error),
    });
    return { ok: false, error: "Could not mark email sent." };
  }
  return { ok: true, sentAt: when };
}

/**
 * Save the receipt's edit link on the submission, so ops can resend the
 * receipt without the signing secret or this site's address. Best effort: a
 * missing link only means ops's resend links to the form instead.
 */
export async function saveFormEditLink(env, rowId, editUrl) {
  if (!id(rowId) || !editUrl)
    return { ok: false, error: "Missing submission." };
  const repo = formSubmissionRepository(env);
  try {
    // Baserow's column arrives by a pre-deploy migration; a database without it yet is fine.
    if (!(await repo.capabilities()).editLink) {
      log.event("warn", "form_edit_link_column_missing", {
        rowId: String(rowId),
      });
      return { ok: false, skipped: true, error: "No Edit Link column yet." };
    }
    await repo.update(id(rowId), { editLink: editUrl });
  } catch (error) {
    await reportStoreFailure(env, { op: "save_edit_link", ...failure(error) });
    return { ok: false, error: "Could not save the edit link." };
  }
  return { ok: true };
}

/** Remove one submission (used by the post-deploy form test to clean up). */
export async function deleteFormSubmission(env, rowId) {
  if (!id(rowId)) return { ok: false, error: "Missing submission." };
  try {
    await formSubmissionRepository(env).remove(id(rowId));
  } catch (error) {
    return {
      ok: false,
      error: `Could not delete the test row: ${error?.message || error}`,
    };
  }
  return { ok: true };
}
