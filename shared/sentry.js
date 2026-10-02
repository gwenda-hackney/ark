/**
 * Error reporting to Sentry (#35). Sentry groups errors, emails alerts@ when
 * something new breaks, and sends a daily digest; its alert rules live in
 * Sentry (npm run setup:sentry).
 *
 * One Sentry project per app; dev and production are told apart by Sentry's
 * environment, from SITE_ENV. A DSN only says where to send reports, so it is
 * public and lives here, not in Secrets Manager. A developer's machine
 * (SITE_ENV=local) reports nothing: its errors are on screen.
 */

/** Filled from the Sentry projects (npm run setup:sentry prints them). */
export const SENTRY_DSN = {
  ops: "",
  web: "",
  workers: "",
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
