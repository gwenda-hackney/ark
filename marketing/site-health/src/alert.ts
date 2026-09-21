import type { Env, HealthAlert, ProbeResult } from "./types";

function formatFromAddress(fromEmail: string): string {
  const raw = fromEmail.trim();
  if (!raw) return "";
  if (raw.includes("<") && raw.includes(">")) return raw;
  return `Gwenda <${raw}>`;
}

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

export async function sendHealthAlert(
  env: Env,
  alert: Exclude<HealthAlert, null>,
  probe: ProbeResult,
  siteUrl?: string,
): Promise<{ ok: boolean; error?: string }> {
  const to = env.ALERT_EMAIL?.trim() || "alerts@gwenda.co.uk";
  const host = env.SMTP_HOST?.trim();
  const from = formatFromAddress(env.SMTP_USER?.trim() || "");
  const user = env.SMTP_USER?.trim() ?? "";
  const password = (env.SMTP_PASSWORD ?? "").replace(/\s+/g, "");
  if (!host || !from || !to || !user || !password) {
    return { ok: false, error: "Alert email is not configured." };
  }

  const { subject, text } = formatHealthAlertEmail(
    alert,
    probe,
    siteUrl || env.SITE_URL || "https://gwenda.co.uk",
  );

  try {
    const nodemailer = await import("nodemailer");
    const port = Number(env.SMTP_PORT?.trim() || "587");
    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass: password },
    });
    await transport.sendMail({ from, to, subject, text });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
