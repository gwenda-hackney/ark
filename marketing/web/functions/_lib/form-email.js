import { resolveSmtpFrom, SMTP_PURPOSE } from "./smtp-from.js";
import { reportFormError } from "./form-alert.js";
import { createLogger } from "./log.js";
import {
  formatFormEmail,
  formatFormNotifyHtml,
  formatFormNotifySubject,
  formatFormReceiptSubject,
  replyToFromAnswers,
} from "./form-submit.js";
import { LOGO_CID } from "./rsvp-email-template.js";
import { fetchImageBuffer } from "./rsvp-tickets.js";
import {
  SITE_ADDRESS,
  SITE_DOMAIN,
  SITE_INSTAGRAM,
  VENUE_MAPS_URL,
} from "./site-location.js";

const LOGO_URL = `${SITE_DOMAIN}/brand/logo-email.png`;
const log = createLogger();

function smtpSkipFields(host, from, to, user, password) {
  return {
    hasHost: Boolean(host),
    hasFrom: Boolean(from),
    hasTo: Boolean(to),
    hasUser: Boolean(user),
    hasPassword: Boolean(password),
  };
}

/** Format a bare address as `Gwenda <addr>` when no display name is present. */
export function formatFormFromAddress(fromEmail) {
  const raw = String(fromEmail ?? "").trim();
  if (!raw) return "";
  if (raw.includes("<") && raw.includes(">")) return raw;
  return `Gwenda <${raw}>`;
}

function bareAddress(value) {
  const raw = String(value ?? "").trim();
  const angled = raw.match(/<([^>]+)>/);
  return (angled ? angled[1] : raw).trim().toLowerCase();
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
 * From for ops/staff notifications.
 * Prefer the SMTP mailbox (notifications@) so we never send From play@ → To play@,
 * which Google Groups often silently drops.
 */
export function resolveFormNotifyFrom(env, form, to) {
  const smtpFrom = env.SMTP_FROM?.trim();
  if (smtpFrom) return smtpFrom;

  const user = env.SMTP_USER?.trim();
  if (user) return formatFormFromAddress(user);

  const formFrom = resolveFormFrom(env, form);
  if (formFrom && bareAddress(formFrom) !== bareAddress(to)) {
    return formFrom;
  }
  return formFrom;
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
 * Email a form submission to the form's notify address (e.g. play@).
 * Reply-To is the applicant when we have their email, so ops can reply directly.
 * @returns {Promise<{ ok: true, dryRun?: boolean } | { ok: false, skipped?: boolean, error?: string }>}
 */
export async function sendFormNotificationEmail(
  env,
  { form, answers, changes, updated = false },
) {
  const host = env.SMTP_HOST?.trim();
  const to = form?.notifyEmail?.trim();
  const from = resolveFormNotifyFrom(env, form, to);
  const isUpdate =
    Boolean(updated) || (Array.isArray(changes) && changes.length > 0);
  const subject = formatFormNotifySubject(form, answers, { updated: isUpdate });
  const submitter = replyToFromAnswers(answers);
  const replyTo = submitter || resolveFormReplyTo(form);
  const user = env.SMTP_USER?.trim() ?? "";
  // Gmail app passwords are often pasted with spaces; SMTP auth wants the 16 chars.
  const password = (env.SMTP_PASSWORD ?? "").replace(/\s+/g, "");
  const smtpReady = Boolean(host && from && to && user && password);
  const siteEnv = env.SITE_ENV?.trim();
  const isDeployed = siteEnv === "staging" || siteEnv === "production";

  const logoBuffer = await fetchImageBuffer(LOGO_URL);
  const text = formatFormEmail({
    form,
    answers,
    changes,
    updated: isUpdate,
  });
  const html = formatFormNotifyHtml({
    form,
    answers,
    changes,
    updated: isUpdate,
    logoUrl: LOGO_URL,
    logoCid: logoBuffer ? LOGO_CID : null,
    siteAddress: SITE_ADDRESS,
    siteDomain: SITE_DOMAIN,
    siteInstagram: SITE_INSTAGRAM,
    venueMapsUrl: VENUE_MAPS_URL,
  });
  const attachments = [];
  if (logoBuffer) {
    attachments.push({
      filename: "gwenda-logo.png",
      content: logoBuffer,
      cid: LOGO_CID,
    });
  }

  if (!to) {
    log.event("error", "form_notify_email_skipped", {
      reason: "missing_notify_email",
      slug: form?.slug ?? "",
    });
    return { ok: false, skipped: true, error: "No notify address configured." };
  }

  if (!smtpReady) {
    if (!isDeployed) {
      log.info(
        `[form email dry-run] to=${to || "(missing)"} from=${from || "(missing)"} replyTo=${replyTo || "(none)"} subject=${subject}`,
      );
      return { ok: true, dryRun: true };
    }
    await reportFormError(env, "form_notify_email_skipped", {
      reason: "smtp_not_configured",
      slug: form?.slug ?? "",
      ...smtpSkipFields(host, from, to, user, password),
    });
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
      subject,
      text,
      html,
      attachments,
    });

    log.event("info", "form_notify_email_sent", {
      to,
      from,
      slug: form?.slug ?? "",
      subject,
      replyTo: replyTo || null,
      logoEmbedded: Boolean(logoBuffer),
      answerCount: (answers ?? []).filter((row) => row?.value).length,
    });

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.event("error", "form_notify_email_failed", {
      error: message,
      from,
      to,
      host,
      user,
      slug: form?.slug ?? "",
    });
    return { ok: false, error: message };
  }
}

/**
 * Receipt email to the applicant: same summary as ops, plus a link to change it.
 * Verify-email flow is left in the codebase but unused.
 */
export async function sendFormReceiptEmail(
  env,
  { form, answers, email, editUrl, updated = false },
) {
  const host = env.SMTP_HOST?.trim();
  const to = String(email ?? "")
    .trim()
    .toLowerCase();
  const from = resolveFormFrom(env, form);
  const replyTo = resolveFormReplyTo(form);
  const user = env.SMTP_USER?.trim() ?? "";
  const password = (env.SMTP_PASSWORD ?? "").replace(/\s+/g, "");
  const smtpReady = Boolean(host && from && to && user && password);
  const siteEnv = env.SITE_ENV?.trim();
  const isDeployed = siteEnv === "staging" || siteEnv === "production";

  const subject = formatFormReceiptSubject(form, { updated });

  const logoBuffer = await fetchImageBuffer(LOGO_URL);
  const text = formatFormEmail({
    form,
    answers,
    variant: "applicant",
    editUrl,
    updated,
  });
  const html = formatFormNotifyHtml({
    form,
    answers,
    variant: "applicant",
    editUrl,
    updated,
    logoUrl: LOGO_URL,
    logoCid: logoBuffer ? LOGO_CID : null,
    siteAddress: SITE_ADDRESS,
    siteDomain: SITE_DOMAIN,
    siteInstagram: SITE_INSTAGRAM,
    venueMapsUrl: VENUE_MAPS_URL,
  });
  const attachments = [];
  if (logoBuffer) {
    attachments.push({
      filename: "gwenda-logo.png",
      content: logoBuffer,
      cid: LOGO_CID,
    });
  }

  if (!smtpReady) {
    if (!isDeployed) {
      log.info(
        `[form receipt dry-run] to=${to || "(missing)"} from=${from || "(missing)"} replyTo=${replyTo || "(none)"} subject=${subject}`,
      );
      return { ok: true, dryRun: true };
    }
    await reportFormError(env, "form_receipt_email_skipped", {
      reason: "smtp_not_configured",
      slug: form?.slug ?? "",
      ...smtpSkipFields(host, from, to, user, password),
    });
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
      subject,
      text,
      html,
      attachments,
    });

    log.event("info", "form_receipt_email_sent", {
      to,
      from,
      slug: form?.slug ?? "",
      subject,
      logoEmbedded: Boolean(logoBuffer),
    });

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.event("error", "form_receipt_email_failed", {
      error: message,
      from,
      to,
      host,
      user,
      slug: form?.slug ?? "",
    });
    return { ok: false, error: message };
  }
}
