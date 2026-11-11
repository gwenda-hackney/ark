/**
 * Deep health: can this deployment reach everything it depends on?
 * Run by the post-deploy smoke test (POST /api/health/deep). Read-only,
 * except a test row in each D1 database's `_meta` (deleted straight after)
 * and, when asked, a test email to alerts@gwenda.co.uk, a submission of each
 * form in SMOKE_FORMS and a sign-up (all deleted after).
 *
 * Each check is independent and reports ok/error and how long it took, so one
 * broken token doesn't hide the others.
 */
import { getSettings } from "../../../../shared/config.js";
import { D1_BINDINGS } from "../../../../shared/d1-databases.js";
import { checkD1 } from "../../../../shared/d1-health.js";
import { listArtists } from "../../../../shared/artists.js";
import { opsArtistEnv } from "../../src/lib/featured-artist.js";
import { formSubmissionRepository } from "../../../../shared/guests/form-submission-repository.js";
import { subscriberRepository } from "../../../../shared/guests/subscriber-repository.js";
import {
  gmailAccessToken,
  isGmailConfigured,
  sendGmail,
} from "../../../../shared/gmail-send.js";
import { NOTIFICATIONS_FROM } from "../../../../shared/mail-from.js";
import { SMOKE_FORMS, runFormSmoke } from "./form-smoke.js";
import { runSignupSmoke } from "./signup-smoke.js";
import { sanityDatasetForEnv, sanityQuery } from "./sanity-query.js";

export const CHECKS = {
  async sanity(env) {
    const count = await sanityQuery(
      env,
      'count(*[!(_id in path("drafts.**")) && _type in ["eventSeries", "event", "menuItem", "form"]])',
    );
    if (!count)
      throw new Error(`No content in dataset ${sanityDatasetForEnv(env)}.`);
    return `${count} documents in ${sanityDatasetForEnv(env)}`;
  },
  // Wherever guests live now: Baserow, or D1 once store:guests says so.
  async subscribers(env) {
    return `${await subscriberRepository(env).count()} rows`;
  },
  async formSubmissions(env) {
    return `${await formSubmissionRepository(env).count()} rows`;
  },
  async opsArtists(env) {
    const opsEnv = opsArtistEnv(env);
    if (!opsEnv) throw new Error("BASEROW_OPS_API_KEY not set, and no OPS_DB.");
    const artists = await listArtists(opsEnv);
    return `${artists.length} artists`;
  },
  async config(env) {
    const values = await getSettings(env, "web");
    return `${Object.keys(values).length} settings`;
  },
  // D1 (#127): every database this site binds, before features move onto them.
  ...Object.fromEntries(
    Object.entries(D1_BINDINGS).map(([role, binding]) => [
      `d1:${role}`,
      (env) => checkD1(env[binding]),
    ]),
  ),
};

/** Gmail: log in only, or also send a test message to the alert address. */
export async function checkEmail(
  env,
  { send = false, label = "", deps = {} } = {},
) {
  if (!isGmailConfigured(env)) throw new Error("Gmail is not configured.");
  if (!send) {
    await (deps.token ?? gmailAccessToken)(env);
    return "Gmail login works (no email sent)";
  }
  const to = env.ALERT_EMAIL?.trim() || "alerts@gwenda.co.uk";
  const from = NOTIFICATIONS_FROM;
  await (deps.send ?? sendGmail)(env, {
    from,
    to,
    subject: `Smoke test: ${label || "website"} deployed`,
    text: [
      `A deploy of ${label || "the website"} finished and can send email.`,
      "This is an automatic check after each deploy. No action needed.",
      `Sent ${new Date().toISOString()}.`,
    ].join("\n"),
  });
  return `test email sent to ${to}`;
}

async function timed(name, run) {
  const started = Date.now();
  try {
    // A check answers with its detail, or with more to report beside it
    // (a form still waiting for its migration: { pending, form, detail }).
    const result = await run();
    const extra = typeof result === "string" ? { detail: result } : result;
    return { name, ok: true, ...extra, ms: Date.now() - started };
  } catch (error) {
    return {
      name,
      ok: false,
      error: error?.message || String(error),
      ms: Date.now() - started,
    };
  }
}

export async function runDeepHealth(
  env,
  {
    sendEmail = false,
    formTest = false,
    forms,
    requestUrl,
    label = "",
    checks = CHECKS,
    emailDeps,
    formSmoke = runFormSmoke,
    signupSmoke = runSignupSmoke,
    smokeForms = SMOKE_FORMS,
  } = {},
) {
  // `forms` (web addresses) is the run after the post-deploy migrations: only
  // those forms, each of which must be there by now, and no second sign-up.
  const only = Array.isArray(forms) && forms.length ? forms : null;
  const formChecks = only
    ? only.map((slug) => ({ slug }))
    : smokeForms.map(({ slug, createdBy }) => ({ slug, createdBy }));
  const results = await Promise.all([
    ...Object.entries(checks).map(([name, run]) => timed(name, () => run(env))),
    timed("email", () =>
      checkEmail(env, { send: sendEmail, label, deps: emailDeps }),
    ),
    // A real submission of each form, emails to alerts@, row deleted after.
    // A real sign-up of a test address (two tags), row deleted after.
    ...(formTest
      ? [
          ...formChecks.map((form) =>
            timed(`form:${form.slug}`, () =>
              formSmoke(env, { ...form, requestUrl }),
            ),
          ),
          ...(only ? [] : [timed("signup", () => signupSmoke(env))]),
        ]
      : []),
  ]);
  return { ok: results.every((result) => result.ok), checks: results };
}
