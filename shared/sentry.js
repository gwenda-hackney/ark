/**
 * Error reporting to Sentry (#35). Sentry groups errors, emails alerts@ when
 * something new breaks, and sends a daily digest; its alert rules live in
 * Sentry (npm run setup:sentry).
 *
 * One Sentry project per app and per Worker, so an error's id says where it
 * came from (MAILCHIMP-SYNC-1); dev and production are told apart by Sentry's
 * environment, from SITE_ENV. A DSN only says where to send reports, so it is
 * public and lives here, not in Secrets Manager. A developer's machine
 * (SITE_ENV=local) reports nothing: its errors are on screen.
 */

/** Each Sentry project's DSN (npm run setup:sentry prints them). */
export const SENTRY_DSN = {
  ops: "https://2fd27aa9d2639d5ab0801be6b51ac861@o4512187820998656.ingest.de.sentry.io/4512187860189264",
  web: "https://9960681f23ed755a8cdfcce40a390994@o4512187820998656.ingest.de.sentry.io/4512187863793744",
  "deploy-webhook":
    "https://0d5d430cac7a7708419fb02853f09bb9@o4512187820998656.ingest.de.sentry.io/4512190946607184",
  "mailchimp-sync":
    "https://4f5db0eebcd283aeb5c1b9a424a05288@o4512187820998656.ingest.de.sentry.io/4512187863859280",
  "site-health":
    "https://3deac739e155f6076e0f0ef16998c348@o4512187820998656.ingest.de.sentry.io/4512190946869328",
  "wifi-portal":
    "https://553e30a79cae112111943b3172a83d3c@o4512187820998656.ingest.de.sentry.io/4512190947590224",
};

/**
 * Sentry options for one app. `fallbackEnv` is for Workers, which run in
 * production only and mostly don't set SITE_ENV.
 * @param {Record<string, unknown> | undefined} env
 * @param {keyof typeof SENTRY_DSN} app
 */
export function sentryOptions(env, app, fallbackEnv = "") {
  const environment = String(env?.SITE_ENV || fallbackEnv)
    .trim()
    .toLowerCase();
  const reporting = environment && environment !== "local";
  const dsn = reporting ? SENTRY_DSN[app] || "" : "";
  return {
    dsn,
    enabled: Boolean(dsn),
    environment: environment || "unknown",
    // Errors only, no performance tracing. Sentry sends no personal data by default.
    tracesSampleRate: 0,
  };
}
