/**
 * Form submissions (guests, #186): what people send through the website's
 * forms (shared/forms). One record per version: a verified submission sent
 * again adds a record and the earlier ones stop being `current`.
 *
 *   FormSubmissionRecord = {
 *     id: number,
 *     formSlug: string, formTitle: string,
 *     submittedAt: ISO string | null,
 *     replyTo: string,                  the sender's email, lower case
 *     status: "Pending" | "Verified" | "",
 *     current: boolean,
 *     answers: { v: 1, entries, raw } | entries | null,   see answersDocument
 *     notifySentAt: ISO string | null,  the team email went out
 *     receiptSentAt: ISO string | null, the sender's receipt went out
 *     editLink: string,                 the receipt's "change your answers" link
 *   }
 *
 * Storage is the repository's (form-submission-repository.js).
 */

export const FORM_STATUS_PENDING = "Pending";
export const FORM_STATUS_VERIFIED = "Verified";

/** Which stamp each email kind sets once it has gone out. */
export const FORM_EMAIL_SENT = {
  notify: "notifySentAt",
  receipt: "receiptSentAt",
};

export const EMPTY_FORM_SUBMISSION = {
  formSlug: "",
  formTitle: "",
  submittedAt: null,
  replyTo: "",
  status: "",
  current: false,
  answers: null,
  notifySentAt: null,
  receiptSentAt: null,
  editLink: "",
};

/** A record with every field, from partial fields. */
export function formSubmissionFields(fields) {
  const out = {};
  for (const [key, empty] of Object.entries(EMPTY_FORM_SUBMISSION)) {
    if (!(key in fields)) continue;
    const value = fields[key];
    if (key === "current") out[key] = Boolean(value);
    else if (key === "answers") out[key] = value ?? null;
    else if (empty === null) out[key] = value ? String(value) : null;
    else out[key] = value == null ? "" : String(value);
  }
  return out;
}

/**
 * The stored answers as { entries, raw }: entries are the labelled answers
 * emails show ([{ key, label, value }]), raw the form's own values for
 * filling it in again. Early submissions saved entries only.
 */
export function answersDocument(answers) {
  if (Array.isArray(answers)) return { entries: answers, raw: null };
  if (
    answers &&
    typeof answers === "object" &&
    Array.isArray(answers.entries)
  ) {
    const raw =
      answers.raw &&
      typeof answers.raw === "object" &&
      !Array.isArray(answers.raw)
        ? answers.raw
        : null;
    return { entries: answers.entries, raw };
  }
  return { entries: [], raw: null };
}

/** What `answers` holds for these entries and raw values. */
export function answersValue(entries, raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw))
    return { v: 1, entries, raw };
  return entries;
}

/** Newest `submittedAt` first; ties (and no date) by id, newest first. */
export function newestFirst(a, b) {
  const time = (record) => Date.parse(record.submittedAt || "") || 0;
  return time(b) - time(a) || b.id - a.id;
}
