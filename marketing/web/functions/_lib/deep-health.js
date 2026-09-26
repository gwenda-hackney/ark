/**
 * Deep health: can this deployment reach everything it depends on?
 * Run by the post-deploy smoke test (POST /api/health/deep). Read-only,
 * except the optional test email to ALERT_EMAIL (alerts@gwenda.co.uk).
 *
 * Each check is independent and reports ok/error and how long it took, so one
 * broken token doesn't hide the others.
 */
import { getSettings } from "../../../../shared/config.js";
import { listArtists } from "../../../../ops/site/functions/_lib/artist-store.js";
import { opsArtistEnv } from "../../src/lib/featured-artist.js";
import {
  resolveFormSubmissionsTableId,
  resolveSubscribeTableId,
} from "./baserow.js";
import { gmailAccessToken, isGmailConfigured, sendGmail } from "../../../../shared/gmail-send.js";
import { NOTIFICATIONS_FROM } from "../../../../shared/mail-from.js";
import { runFormSmoke } from "./form-smoke.js";
import { sanityDatasetForEnv, sanityQuery } from "./sanity-query.js";

const DEFAULT_BASEROW_API = "https://api.baserow.io";

async function readOneRow(env, resolveTable, label) {
  const table = await resolveTable(env);
  if (!table.ok) throw new Error(table.error || `${label} table not found.`);
  const apiBase = (env.BASEROW_API_URL || DEFAULT_BASEROW_API).replace(/\/$/, "");
  const response = await fetch(`${apiBase}/api/database/rows/table/${table.tableId}/?size=1`, {
    headers: { Authorization: `Token ${env.BASEROW_API_KEY}` },
  });
  if (!response.ok) throw new Error(`${label}: Baserow ${response.status}.`);
  const body = await response.json();
  return `${body.count ?? 0} rows`;
}

export const CHECKS = {
  async sanity(env) {
    const count = await sanityQuery(
      env,
      'count(*[!(_id in path("drafts.**")) && _type in ["eventSeries", "event", "menuItem", "form"]])',
    );
    if (!count) throw new Error(`No content in dataset ${sanityDatasetForEnv(env)}.`);
    return `${count} documents in ${sanityDatasetForEnv(env)}`;
  },
  async subscribers(env) {
    return readOneRow(env, resolveSubscribeTableId, "Subscribers");
  },
  async formSubmissions(env) {
    return readOneRow(env, resolveFormSubmissionsTableId, "Form Submissions");
  },
  async opsArtists(env) {
    const opsEnv = opsArtistEnv(env);
    if (!opsEnv) throw new Error("BASEROW_OPS_API_KEY not set.");
    const artists = await listArtists(opsEnv);
    return `${artists.length} artists`;
  },
  async config(env) {
    const values = await getSettings(env, "web");
    return `${Object.keys(values).length} settings`;
  },
};

/** Gmail: log in only, or also send a test message to the alert address. */
export async function checkEmail(env, { send = false, label = "", deps = {} } = {}) {
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
    return { name, ok: true, detail: await run(), ms: Date.now() - started };
  } catch (error) {
    return { name, ok: false, error: error?.message || String(error), ms: Date.now() - started };
  }
}

export async function runDeepHealth(
  env,
  { sendEmail = false, formTest = false, requestUrl, label = "", checks = CHECKS, emailDeps, formSmoke = runFormSmoke } = {},
) {
  const results = await Promise.all([
    ...Object.entries(checks).map(([name, run]) => timed(name, () => run(env))),
    timed("email", () => checkEmail(env, { send: sendEmail, label, deps: emailDeps })),
    // A real submission of the play form, emails to alerts@, row deleted after.
    ...(formTest ? [timed("form", () => formSmoke(env, { requestUrl }))] : []),
  ]);
  return { ok: results.every((result) => result.ok), checks: results };
}
