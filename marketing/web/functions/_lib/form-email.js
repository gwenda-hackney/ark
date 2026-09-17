import { resolveSmtpFrom, SMTP_PURPOSE } from "./smtp-from.js";
import { formatFormEmail } from "./form-submit.js";

/** Format a bare address as `Gwenda <addr>` when no display name is present. */
export function formatFormFromAddress(fromEmail) {
  const raw = String(fromEmail ?? "").trim();
  if (!raw) return "";
  if (raw.includes("<") && raw.includes(">")) return raw;
  return `Gwenda <${raw}>`;
}

/**
 * Outbound From for form mail: Sanity form.fromEmail, then invite/events env fallbacks.
 */
export function resolveFormFrom(env, form) {
  const fromForm = formatFormFromAddress(form?.fromEmail);
  if (fromForm) return fromForm;
  return (
    resolveSmtpFrom(env, SMTP_PURPOSE.INVITES) ||
    resolveSmtpFrom(env, SMTP_PURPOSE.EVENTS)
  );
}

/**
 * Reply-To for form mail: Sanity replyToEmail, else fromEmail.
 */
export function resolveFormReplyTo(form) {
  const replyTo = String(form?.replyToEmail ?? "").trim();
  if (replyTo) return replyTo;
  const from = String(form?.fromEmail ?? "").trim();
  return from || undefined;
}

/**
 * Email a form submission to the form's notify address.
 * @returns {{ ok: true, dryRun?: boolean } | { ok: false, skipped?: boolean, error?: string }}
 */
export async function sendFormNotificationEmail(
  env,
  { form, answers, submittedAt },
) {
  const host = env.SMTP_HOST?.trim();
  const from = resolveFormFrom(env, form);
  const to = form?.notifyEmail?.trim();
  const when = submittedAt || new Date().toISOString();
  const text = formatFormEmail({ form, answers, submittedAt: when });
  const replyTo = resolveFormReplyTo(form);
  const user = env.SMTP_USER?.trim() ?? "";
  // Gmail app passwords are often pasted with spaces; SMTP auth wants the 16 chars.
  const password = (env.SMTP_PASSWORD ?? "").replace(/\s+/g, "");
  const smtpReady = Boolean(host && from && to && user && password);
  const siteEnv = env.SITE_ENV?.trim();
  const isDeployed = siteEnv === "staging" || siteEnv === "production";

  if (!smtpReady) {
    if (!isDeployed) {
      console.info(
        `[form email dry-run] to=${to || "(missing)"} from=${from || "(missing)"} replyTo=${replyTo || "(none)"}\n${text}`,
      );
      return { ok: true, dryRun: true };
    }
    console.error(
      JSON.stringify({
        event: "form_notify_email_skipped",
        reason: "smtp_not_configured",
        hasHost: Boolean(host),
        hasFrom: Boolean(from),
        hasTo: Boolean(to),
        hasUser: Boolean(user),
        hasPassword: Boolean(password),
      }),
    );
    return { ok: false, skipped: true, error: "Email is not configured." };
  }

  try {
    const nodemailer = await import("nodemailer");
    const port = Number(env.SMTP_PORT?.trim() || "587");

    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass: password },
    });

    await transport.sendMail({
      from,
      to,
      replyTo,
      subject: `${form.title}: new submission`,
      text,
    });

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({
        event: "form_notify_email_failed",
        error: message,
        from,
        to,
        host,
        user,
      }),
    );
    return { ok: false, error: message };
  }
}
