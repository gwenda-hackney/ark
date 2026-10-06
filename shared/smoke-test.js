/**
 * What the post-deploy smoke tests write, so everything else can leave it be.
 * The tests delete their own rows, but a sync or copy can run in between.
 */

/** The sign-up smoke test's subscriber (marketing/web/functions/_lib/signup-smoke.js). */
export const SIGNUP_SMOKE_EMAIL = "alerts+signup-smoke@gwenda.co.uk";

/** True for a subscriber the smoke test made: never synced to Mailchimp, never copied. */
export function isSmokeSubscriber(email) {
  return (
    String(email || "")
      .trim()
      .toLowerCase() === SIGNUP_SMOKE_EMAIL
  );
}

/** The form smoke test's applicant: the alert inbox (marketing/web/functions/_lib/form-smoke.js). */
export const FORM_SMOKE_EMAIL = "alerts@gwenda.co.uk";

/** What the form smoke test answers to every required text question. */
export const FORM_SMOKE_ANSWER =
  "Smoke test (automatic, deleted straight after)";

/** True for a submission the form smoke test made: from the alert inbox, with its answer. */
export function isSmokeFormSubmission({ replyTo, answers } = {}) {
  if (
    String(replyTo || "")
      .trim()
      .toLowerCase() !== FORM_SMOKE_EMAIL
  )
    return false;
  const entries = Array.isArray(answers) ? answers : answers?.entries;
  return (Array.isArray(entries) ? entries : []).some(
    (entry) => entry?.value === FORM_SMOKE_ANSWER,
  );
}
