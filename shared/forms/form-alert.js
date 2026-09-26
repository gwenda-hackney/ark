import { createLogger, serializeError } from "../log.js";
import { isGmailConfigured, sendGmail } from "../gmail-send.js";

const ALERT_EVENTS = new Set([
  "form_store_failed",
  "form_notify_email_failed",
  "form_receipt_email_failed",
  "form_notify_failed_after_store",
  "form_receipt_failed_after_store",
  "form_verify_email_failed",
  "form_verify_resend_failed",
  "form_verify_token_failed",
]);

const SKIPPED_SMTP_EVENTS = new Set([
  "form_notify_email_skipped",
  "form_receipt_email_skipped",
  "form_verify_email_skipped",
]);

function formatFromAddress(fromEmail) {
  const raw = String(fromEmail ?? "").trim();
  if (!raw) return "";
  if (raw.includes("<") && raw.includes(">")) return raw;
  return `Gwenda <${raw}>`;
}

function flattenExtra(extra) {
  const out = { ...extra };
  if (out.error && typeof out.error !== "string") {
    out.error = serializeError(out.error);
  }
  return out;
}

export function shouldSendFormAlert(env, event, extra = {}) {
  if (env?.SITE_ENV?.trim() !== "production") return false;
  if (SKIPPED_SMTP_EVENTS.has(event)) {
    return extra.reason === "smtp_not_configured";
  }
  return ALERT_EVENTS.has(event);
}

export function formatFormAlertEmail({ event, extra = {} }) {
  const lines = [`Gwenda form error: ${event}`, "", `event: ${event}`];
  for (const [key, value] of Object.entries(extra)) {
    if (value == null || value === "") continue;
    const printed =
      typeof value === "object" ? JSON.stringify(value) : String(value);
    lines.push(`${key}: ${printed}`);
  }
  return {
    subject: `Gwenda form error · ${event}`,
    text: lines.join("\n"),
  };
}

export async function sendAlertEmail(env, { event, extra = {} }, deps = {}) {
  const to = env.ALERT_EMAIL?.trim() || "alerts@gwenda.co.uk";
  const from =
    env.SMTP_FROM?.trim() || formatFromAddress(env.SMTP_USER?.trim());
  if (!from || !to || !isGmailConfigured(env)) {
    return { ok: false, error: "Alert email is not configured." };
  }

  const { subject, text } = formatFormAlertEmail({ event, extra });
  const send = deps.sendGmail ?? sendGmail;
  await send(env, { from, to, subject, text });
  return { ok: true };
}

/**
 * Log a structured form error. In production, also email ALERT_EMAIL.
 * Never throws. Alert-send failures are logged only (no recursion).
 */
export async function reportFormError(env, event, extra = {}, deps = {}) {
  const log = deps.log ?? createLogger();
  const payload = flattenExtra(extra);
  try {
    log.event("error", event, payload);
  } catch {
    // ignore
  }

  if (!shouldSendFormAlert(env, event, extra)) {
    return { logged: true, emailed: false };
  }

  try {
    const send = deps.sendAlertEmail ?? sendAlertEmail;
    const result = await send(env, { event, extra: payload }, deps);
    return { logged: true, emailed: Boolean(result?.ok) };
  } catch (error) {
    try {
      log.event("error", "form_alert_email_failed", {
        sourceEvent: event,
        error: serializeError(error),
      });
    } catch {
      // ignore
    }
    return { logged: true, emailed: false };
  }
}
