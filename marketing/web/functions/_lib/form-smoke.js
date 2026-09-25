/**
 * End-to-end form test for the post-deploy smoke check.
 *
 * Runs a real submission of a live form through the same library code the
 * form endpoint uses: validate, save the row, email the team, email the
 * applicant, stamp both emails as sent. Differences, on purpose:
 *  - the applicant is alerts@gwenda.co.uk and the team email goes there too
 *    (never the form's own inbox, e.g. play@);
 *  - the row is deleted at the end so ops never shows it.
 */
import { resolvePublicOrigin } from "./public-origin.js";
import { sendFormNotificationEmail, sendFormReceiptEmail } from "./form-email.js";
import {
  FORM_STATUS_VERIFIED,
  deleteFormSubmission,
  fetchFormSubmissionRow,
  markFormSubmissionEmailSent,
  upsertFormSubmission,
} from "./form-store.js";
import { fetchFormForSubmit, validateFormAnswers } from "./form-submit.js";
import { formPublicPath } from "./form-paths.js";

export const SMOKE_FORM_SLUG = "play";

function firstChoice(field) {
  const option = (field.options || []).find((row) => !/^other$/i.test(String(row.value || row.label || "")));
  return String(option?.value || option?.label || "").trim();
}

/** Valid answers for any form: required fields filled, the email is the alert inbox. */
export function smokeAnswers(form, email) {
  const answers = {};
  for (const field of form?.fields || []) {
    if (!field.key) continue;
    const isEmail = field.type === "email" || field.key === "email";
    if (isEmail) {
      answers[field.key] = email;
      continue;
    }
    if (!field.required) continue;
    if (field.type === "multiSelect") answers[field.key] = [firstChoice(field)];
    else if (field.type === "select") answers[field.key] = firstChoice(field);
    else if (field.type === "tel" || field.key === "phone") answers[field.key] = "07700 900000";
    else if (field.type === "url") answers[field.key] = "https://gwenda.co.uk";
    else answers[field.key] = "Smoke test (automatic, deleted straight after)";
  }
  return answers;
}

/** Throws with a clear step name if any part fails. Always tries to delete the row. */
export async function runFormSmoke(env, { slug = SMOKE_FORM_SLUG, requestUrl = "https://gwenda.co.uk/" } = {}) {
  const to = env.ALERT_EMAIL?.trim() || "alerts@gwenda.co.uk";
  const form = await fetchFormForSubmit(env, slug);
  if (!form) throw new Error(`Form "${slug}" not found or disabled.`);
  const validated = validateFormAnswers(form, smokeAnswers(form, to));
  if (!validated.ok) throw new Error(`Test answers rejected: ${validated.error}`);

  const stored = await upsertFormSubmission(env, {
    form,
    answers: validated.answers,
    submittedAt: new Date().toISOString(),
    status: FORM_STATUS_VERIFIED,
  });
  if (!stored.ok) throw new Error(`Saving the row failed: ${stored.error || "unknown"}`);
  const rowId = stored.rowId;

  try {
    const notify = await sendFormNotificationEmail(env, { form, answers: validated.answers, to });
    if (!notify.ok || notify.dryRun) {
      throw new Error(`Team email failed: ${notify.error || (notify.dryRun ? "dry run" : "unknown")}`);
    }
    await markFormSubmissionEmailSent(env, rowId, "notify");

    const origin = resolvePublicOrigin(new URL(requestUrl).origin, env).replace(/\/$/, "");
    const receipt = await sendFormReceiptEmail(env, {
      form,
      answers: validated.answers,
      email: to,
      editUrl: `${origin}${formPublicPath(slug)}`,
    });
    if (!receipt.ok || receipt.dryRun) {
      throw new Error(`Applicant email failed: ${receipt.error || (receipt.dryRun ? "dry run" : "unknown")}`);
    }
    await markFormSubmissionEmailSent(env, rowId, "receipt");

    const row = await fetchFormSubmissionRow(env, rowId);
    if (row && typeof row === "object" && "ok" in row && !row.ok) {
      throw new Error(`Reading the row back failed: ${row.error || "unknown"}`);
    }
  } finally {
    const removed = await deleteFormSubmission(env, rowId);
    if (!removed.ok) throw new Error(`Cleaning up the test row failed: ${removed.error}`);
  }
  return `"${form.title}" saved, both emails sent to ${to}, test row deleted`;
}
