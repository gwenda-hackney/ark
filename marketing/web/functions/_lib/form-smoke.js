/**
 * End-to-end form test for the post-deploy smoke check.
 *
 * Runs a real submission of each live form (SMOKE_FORMS) through the same
 * library code the form endpoint uses: validate, save the row, email the
 * team, email the applicant, stamp both emails as sent. Differences, on
 * purpose:
 *  - the applicant is alerts@gwenda.co.uk and the team email goes there too
 *    (never the form's own inbox, e.g. play@ or enquiries@);
 *  - the row is deleted at the end so ops never shows it.
 */
import { resolvePublicOrigin } from "./public-origin.js";
import {
  sendFormNotificationEmail,
  sendFormReceiptEmail,
} from "../../../../shared/forms/form-email.js";
import {
  FORM_STATUS_VERIFIED,
  deleteFormSubmission,
  fetchFormSubmission,
  markFormSubmissionEmailSent,
  upsertFormSubmission,
} from "./form-store.js";
import { fetchFormForSubmit, validateFormAnswers } from "./form-submit.js";
import { formPublicPath } from "./form-paths.js";
import {
  DATE_FIELD_MAX_DAYS,
  NUMBER_FIELD_MIN,
  londonToday,
} from "../../../../shared/forms/field-rules.js";
import { FORM_SMOKE_ANSWER } from "../../../../shared/smoke-test.js";

/**
 * The forms the deploy test submits, by web address (/contact/<slug>). Add a
 * form here and every deploy that tests forms submits it too.
 *
 * `createdBy` is for a form that a post-deploy migration makes (migrations/,
 * phase "post"): on its first release the form isn't there until the deploy
 * has finished, so the test reports it as waiting instead of failing, and
 * web-promote submits it once the migrations have run. Take `createdBy` off
 * when the migration is deleted (form-smoke.test.js fails until you do); from
 * then on a missing or switched-off form fails the deploy, as Play's does.
 */
export const SMOKE_FORMS = [
  { slug: "play" },
  { slug: "party", createdBy: "2026-11-11-party-form.mjs" },
];

/** A date field's answer: a month from today at the bar, inside what a date field takes. */
const SMOKE_DATE_DAYS_AHEAD = Math.min(30, DATE_FIELD_MAX_DAYS);

function smokeDate(now = new Date()) {
  const [year, month, day] = londonToday(now).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + SMOKE_DATE_DAYS_AHEAD))
    .toISOString()
    .slice(0, 10);
}

/** Both test emails start with this, so mail filters can file them. */
export const SMOKE_SUBJECT_PREFIX = "Smoke test: ";

function firstChoice(field) {
  const option = (field.options || []).find(
    (row) => !/^other$/i.test(String(row.value || row.label || "")),
  );
  return String(option?.value || option?.label || "").trim();
}

const isPlainText = (field) =>
  !field.type || field.type === "text" || field.type === "textarea";

/**
 * Valid answers for any form: required fields filled, the email is the alert
 * inbox, and at least one answer is FORM_SMOKE_ANSWER, which is how a copy of
 * the data knows the row is a test (isSmokeFormSubmission).
 */
export function smokeAnswers(form, email, { now = new Date() } = {}) {
  const answers = {};
  const fields = (form?.fields || []).filter((field) => field.key);
  for (const field of fields) {
    const isEmail = field.type === "email" || field.key === "email";
    if (isEmail) {
      answers[field.key] = email;
      continue;
    }
    if (!field.required) continue;
    if (field.type === "multiSelect") answers[field.key] = [firstChoice(field)];
    else if (field.type === "select") answers[field.key] = firstChoice(field);
    else if (field.type === "tel" || field.key === "phone")
      answers[field.key] = "07700 900000";
    else if (field.type === "url") answers[field.key] = "https://gwenda.co.uk";
    else if (field.type === "date") answers[field.key] = smokeDate(now);
    else if (field.type === "number")
      answers[field.key] = String(Math.max(2, NUMBER_FIELD_MIN));
    else answers[field.key] = FORM_SMOKE_ANSWER;
  }
  // No required text question: say it is a test in the first optional one.
  if (!Object.values(answers).includes(FORM_SMOKE_ANSWER)) {
    const spare = fields.find(
      (field) => isPlainText(field) && !(field.key in answers),
    );
    if (spare) answers[spare.key] = FORM_SMOKE_ANSWER;
  }
  return answers;
}

/** What a form that its migration hasn't made yet reports: ok, but not tested. */
function waiting(slug, createdBy) {
  return {
    pending: true,
    form: slug,
    detail: `"${slug}" is not here yet: migration ${createdBy} makes it after the deploy`,
  };
}

/**
 * Throws with a clear step name if any part fails. Always tries to delete the row.
 * `createdBy`: the post-deploy migration that makes this form, if one still
 * does (SMOKE_FORMS); without the form it then returns `{ pending: true }`.
 * @returns {Promise<string | { pending: true, form: string, detail: string }>}
 */
export async function runFormSmoke(
  env,
  { slug, createdBy = "", requestUrl = "https://gwenda.co.uk/" } = {},
) {
  const to = env.ALERT_EMAIL?.trim() || "alerts@gwenda.co.uk";
  const form = await fetchFormForSubmit(env, slug);
  if (!form && createdBy) return waiting(slug, createdBy);
  if (!form) throw new Error(`Form "${slug}" not found or disabled.`);
  const validated = validateFormAnswers(form, smokeAnswers(form, to));
  if (!validated.ok)
    throw new Error(`Test answers rejected: ${validated.error}`);

  const stored = await upsertFormSubmission(env, {
    form,
    answers: validated.answers,
    submittedAt: new Date().toISOString(),
    status: FORM_STATUS_VERIFIED,
  });
  if (!stored.ok)
    throw new Error(`Saving the row failed: ${stored.error || "unknown"}`);
  const rowId = stored.rowId;

  try {
    const notify = await sendFormNotificationEmail(env, {
      form,
      answers: validated.answers,
      to,
      subjectPrefix: SMOKE_SUBJECT_PREFIX,
    });
    if (!notify.ok || notify.dryRun) {
      throw new Error(
        `Team email failed: ${notify.error || (notify.dryRun ? "dry run" : "unknown")}`,
      );
    }
    const notifyMarked = await markFormSubmissionEmailSent(
      env,
      rowId,
      "notify",
    );
    if (!notifyMarked?.ok) {
      throw new Error(
        `Recording the team email on the row failed: ${notifyMarked?.error || "unknown"}`,
      );
    }

    const origin = resolvePublicOrigin(new URL(requestUrl).origin, env).replace(
      /\/$/,
      "",
    );
    const receipt = await sendFormReceiptEmail(env, {
      form,
      answers: validated.answers,
      email: to,
      editUrl: `${origin}${formPublicPath(slug)}`,
      subjectPrefix: SMOKE_SUBJECT_PREFIX,
    });
    if (!receipt.ok || receipt.dryRun) {
      throw new Error(
        `Applicant email failed: ${receipt.error || (receipt.dryRun ? "dry run" : "unknown")}`,
      );
    }
    const receiptMarked = await markFormSubmissionEmailSent(
      env,
      rowId,
      "receipt",
    );
    if (!receiptMarked?.ok) {
      throw new Error(
        `Recording the applicant email on the row failed: ${receiptMarked?.error || "unknown"}`,
      );
    }

    const read = await fetchFormSubmission(env, rowId);
    if (read && typeof read === "object" && "ok" in read && !read.ok) {
      throw new Error(
        `Reading the row back failed: ${read.error || "unknown"}`,
      );
    }
  } finally {
    const removed = await deleteFormSubmission(env, rowId);
    if (!removed.ok)
      throw new Error(`Cleaning up the test row failed: ${removed.error}`);
  }
  return `"${form.title}" saved, both emails sent to ${to}, test row deleted`;
}
