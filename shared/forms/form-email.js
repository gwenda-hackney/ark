/**
 * Send a form's notification (to the form's inbox) and receipt (to the
 * applicant). The website sends both when a form is submitted; ops resends
 * either one from /forms.
 */
import { EVENTS_FROM, MAIL_SENDER, NOTIFICATIONS_FROM } from "../mail-from.js";
import { reportFormError } from "./form-alert.js";
import { isGmailConfigured, sendGmail } from "../gmail-send.js";
import { createLogger } from "../log.js";
import { resolveFormNotifyTo } from "./notify-to.js";
import {
  formatFormEmail,
  formatFormNotifyHtml,
  formatFormNotifySubject,
  formatFormReceiptSubject,
  replyToFromAnswers,
} from "./format.js";
import { fetchImageBuffer, LOGO_CID } from "../email-image.js";
import {
  SITE_ADDRESS,
  SITE_DOMAIN,
  SITE_INSTAGRAM,
  VENUE_MAPS_URL,
} from "../site-location.js";

const LOGO_URL = `${SITE_DOMAIN}/brand/logo-email.png`;
const log = createLogger();

function mailSkipFields(env, from, to) {
  return {
    hasFrom: Boolean(from),
    hasTo: Boolean(to),
    hasServiceAccount: Boolean(env.GMAIL_SERVICE_ACCOUNT_JSON?.trim()),
  };
}

/** Format a bare address as `Gwenda <addr>` when no display name is present. */
export function formatFormFromAddress(fromEmail) {
  const raw = String(fromEmail ?? "").trim();
  if (!raw) return "";
  if (raw.includes("<") && raw.includes(">")) return raw;
  return `Gwenda <${raw}>`;
}

/** Outbound From for form mail: Sanity form.fromEmail, else the events address. */
export function resolveFormFrom(env, form) {
  return formatFormFromAddress(form?.fromEmail) || EVENTS_FROM;
}

/**
 * From for ops/staff notifications: always the sending mailbox (notifications@),
 * so we never send From play@ → To play@, which Google Groups often drops.
 */
export function resolveFormNotifyFrom() {
  return NOTIFICATIONS_FROM;
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
 * @returns {Promise<{ ok: true, to?: string, dryRun?: boolean } | { ok: false, skipped?: boolean, error?: string }>}
 */
export async function sendFormNotificationEmail(
  env,
  { form, answers, changes, updated = false, to: toOverride = "" },
) {
  // toOverride: the post-deploy form test sends to alerts@, never the form's inbox.
  const to = toOverride || (await resolveFormNotifyTo(env, form));
  const from = resolveFormNotifyFrom();
  const isUpdate =
    Boolean(updated) || (Array.isArray(changes) && changes.length > 0);
  const subject = formatFormNotifySubject(form, answers, { updated: isUpdate });
  const submitter = replyToFromAnswers(answers);
  const replyTo = submitter || resolveFormReplyTo(form);
  const mailReady = Boolean(from && to && isGmailConfigured(env));
  const siteEnv = env.SITE_ENV?.trim();
  const isDeployed = siteEnv === "production";

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

  if (!mailReady) {
    if (!isDeployed) {
      log.info(
        `[form email dry-run] to=${to || "(missing)"} from=${from || "(missing)"} replyTo=${replyTo || "(none)"} subject=${subject}`,
      );
      return { ok: true, dryRun: true };
    }
    await reportFormError(env, "form_notify_email_skipped", {
      reason: "email_not_configured",
      slug: form?.slug ?? "",
      ...mailSkipFields(env, from, to),
    });
    return { ok: false, skipped: true, error: "Email is not configured." };
  }

  try {
    await sendGmail(env, {
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

    return { ok: true, to };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.event("error", "form_notify_email_failed", {
      error: message,
      from,
      to,
      sender: MAIL_SENDER,
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
  const to = String(email ?? "")
    .trim()
    .toLowerCase();
  const from = resolveFormFrom(env, form);
  const replyTo = resolveFormReplyTo(form);
  const mailReady = Boolean(from && to && isGmailConfigured(env));
  const siteEnv = env.SITE_ENV?.trim();
  const isDeployed = siteEnv === "production";

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

  if (!mailReady) {
    if (!isDeployed) {
      log.info(
        `[form receipt dry-run] to=${to || "(missing)"} from=${from || "(missing)"} replyTo=${replyTo || "(none)"} subject=${subject}`,
      );
      return { ok: true, dryRun: true };
    }
    await reportFormError(env, "form_receipt_email_skipped", {
      reason: "email_not_configured",
      slug: form?.slug ?? "",
      ...mailSkipFields(env, from, to),
    });
    return { ok: false, skipped: true, error: "Email is not configured." };
  }

  try {
    await sendGmail(env, {
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
      sender: MAIL_SENDER,
      slug: form?.slug ?? "",
    });
    return { ok: false, error: message };
  }
}
