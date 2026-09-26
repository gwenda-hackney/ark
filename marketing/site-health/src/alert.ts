import { isGmailConfigured, sendGmail } from "../../../shared/gmail-send.js";
import { NOTIFICATIONS_FROM } from "../../../shared/mail-from.js";
import type { Env, HealthAlert, ProbeResult } from "./types";

export function formatHealthAlertEmail(
  alert: Exclude<HealthAlert, null>,
  probe: ProbeResult,
  siteUrl: string,
): { subject: string; text: string } {
  const checkLines = probe.checks.map((check) => {
    const status = check.status != null ? ` status=${check.status}` : "";
    const error = check.error ? ` ${check.error}` : "";
    return `- ${check.name}: ${check.ok ? "ok" : "fail"}${status}${error}`;
  });

  if (alert === "recovery") {
    return {
      subject: "Gwenda site recovered",
      text: [`${siteUrl} is responding again.`, "", ...checkLines].join("\n"),
    };
  }

  const kind = alert === "reminder" ? "still down" : "down";
  return {
    subject: `Gwenda site ${kind}`,
    text: [`${siteUrl} failed the health probe.`, "", ...checkLines].join("\n"),
  };
}

/** Email an alert through the Gmail API (HTTPS; Workers have no SMTP). */
export async function sendHealthAlert(
  env: Env,
  alert: Exclude<HealthAlert, null>,
  probe: ProbeResult,
  siteUrl?: string,
  send: typeof sendGmail = sendGmail,
): Promise<{ ok: boolean; error?: string }> {
  const to = env.ALERT_EMAIL?.trim() || "alerts@gwenda.co.uk";
  if (!isGmailConfigured(env)) {
    return { ok: false, error: "Alert email is not configured." };
  }

  const { subject, text } = formatHealthAlertEmail(
    alert,
    probe,
    siteUrl || env.SITE_URL || "https://gwenda.co.uk",
  );

  try {
    await send(env, { from: NOTIFICATIONS_FROM, to, subject, text });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
