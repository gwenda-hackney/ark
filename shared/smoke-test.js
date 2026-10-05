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
