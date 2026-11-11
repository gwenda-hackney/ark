import {
  resolveFormFrom,
  resolveFormReplyTo,
} from "../../../../shared/forms/form-email.js";
import { isGmailConfigured, sendGmail } from "../../../../shared/gmail-send.js";
import { MAIL_SENDER } from "../../../../shared/mail-from.js";
import { reportFormError } from "../../../../shared/forms/form-alert.js";
import { createLogger } from "../../../../shared/log.js";
import {
  buildFormVerifyUrl,
  createFormVerifyToken,
} from "./form-verify-auth.js";
import { fetchImageBuffer, LOGO_CID } from "../../../../shared/email-image.js";
import {
  COLOURS,
  FONTS,
  button,
  emailDocument,
  emailLogoUrl,
  esc,
  logoHeader,
  paragraph,
  row,
  title,
  transactionalFoot,
} from "../../../../shared/email/shell.js";
import {
  SITE_ADDRESS,
  SITE_DOMAIN,
  SITE_INSTAGRAM,
  SITE_NAME,
  SITE_SOCIAL,
  VENUE_MAPS_URL,
} from "../../../../shared/site-location.js";

/** The logo travels with the email (an inline attachment), read from the live site. */
const LOGO_URL = emailLogoUrl(SITE_DOMAIN);
const log = createLogger();

function formVerifyCopy({ title, updated }) {
  const formTitle = title || "Gwenda";
  const eyebrow = formTitle;
  const heading = updated ? "One more tap" : "Nearly there";
  const lead = updated
    ? `We’ve got your changes for ${formTitle}. Tap the button to confirm it’s you and we’ll take it from there.`
    : `Thanks for filling in ${formTitle}. Tap the button to confirm your email and it’s with us.`;
  const aside = "No rush. The link works for a couple of days.";
  // HTML carries the Confirm button; keep plain text free of a raw link.
  const text = [
    heading,
    "",
    lead,
    "",
    aside,
    "",
    "Use the Confirm email button in this message.",
    "",
    "Not you? Ignore this and nothing happens.",
    "",
    "--",
    `${SITE_NAME} ${SITE_SOCIAL}, ${SITE_ADDRESS}`,
    `You’re getting this because someone filled in ${formTitle} on gwenda.co.uk with this address.`,
  ].join("\n");

  return {
    eyebrow,
    heading,
    lead,
    aside,
    text,
    subject: `Confirm your email: ${formTitle}`,
  };
}

/**
 * The "confirm your email" message, in the look every Gwenda email shares
 * (shared/email/shell.js). The link is on the button only.
 */
export function buildFormVerifyEmailHtml({
  eyebrow,
  heading,
  lead,
  aside,
  verifyUrl,
  subject = heading,
  logoUrl = "",
  logoCid = null,
}) {
  const why = `You’re getting this because someone filled in ${eyebrow || "a form"} on gwenda.co.uk with this address. Not you? Ignore it and nothing happens.`;
  return emailDocument({
    title: subject,
    preheader: lead,
    css: "@media (max-width:420px){.h1{font-size:36px !important}}",
    rows: [
      ...logoHeader({
        origin: SITE_DOMAIN,
        name: SITE_NAME,
        social: SITE_SOCIAL,
        logo: logoCid ? `cid:${logoCid}` : logoUrl,
      }),
      row(
        (eyebrow
          ? `<div class="slab" style="font-family:${FONTS.slab};font-size:13px;line-height:1.4;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${COLOURS.mustard};padding-bottom:8px;">${esc(eyebrow)}</div>`
          : "") +
          title(heading) +
          paragraph(esc(lead), { margin: "14px 0 0" }) +
          paragraph(esc(aside), {
            size: 16,
            colour: COLOURS.ink2,
            margin: "10px 0 0",
          }),
        { bottom: 26 },
      ),
      row(button("Confirm email", verifyUrl), { align: "center" }),
      ...transactionalFoot({
        name: SITE_NAME,
        social: SITE_SOCIAL,
        address: SITE_ADDRESS,
        links: [
          { text: "Instagram", href: SITE_INSTAGRAM },
          { text: "What’s on", href: `${SITE_DOMAIN}/whats-on` },
          { text: "Find us", href: VENUE_MAPS_URL },
        ],
        why,
      }),
    ],
  });
}

/**
 * Send the submitter a magic link to confirm their email.
 * @returns {Promise<{ ok: true, dryRun?: boolean, verifyUrl?: string } | { ok: false, skipped?: boolean, error?: string }>}
 */
export async function sendFormVerifyEmail(
  env,
  { form, email, rowId, requestUrl, updated = false },
) {
  const from = resolveFormFrom(env, form);
  const replyTo = resolveFormReplyTo(form);
  const to = String(email ?? "")
    .trim()
    .toLowerCase();
  const mailReady = Boolean(from && to && isGmailConfigured(env));
  const siteEnv = env.SITE_ENV?.trim();
  const isDeployed = siteEnv === "production";

  const token = await createFormVerifyToken(env, {
    rowId,
    email: to,
    slug: form.slug,
  });
  if (!token) {
    await reportFormError(env, "form_verify_token_failed", {
      reason: "missing_secret_or_row",
      rowId: String(rowId ?? ""),
      slug: form?.slug ?? "",
    });
    return { ok: false, error: "Could not create confirmation link." };
  }

  const verifyUrl = await buildFormVerifyUrl(requestUrl, env, token);
  const title = form.title || form.heading || "Gwenda";
  const copy = formVerifyCopy({ title, updated: Boolean(updated) });

  // Embed the mark like RSVP mail so inboxes that block remote images still show it.
  const logoBuffer = await fetchImageBuffer(LOGO_URL);
  const html = buildFormVerifyEmailHtml({
    eyebrow: copy.eyebrow,
    heading: copy.heading,
    lead: copy.lead,
    aside: copy.aside,
    verifyUrl,
    subject: copy.subject,
    logoUrl: LOGO_URL,
    logoCid: logoBuffer ? LOGO_CID : null,
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
        `[form verify dry-run] to=${to || "(missing)"} from=${from || "(missing)"} replyTo=${replyTo || "(none)"}`,
      );
      return { ok: true, dryRun: true, verifyUrl };
    }
    await reportFormError(env, "form_verify_email_skipped", {
      reason: "email_not_configured",
      hasFrom: Boolean(from),
      hasTo: Boolean(to),
      hasServiceAccount: Boolean(env.GMAIL_SERVICE_ACCOUNT_JSON?.trim()),
      slug: form?.slug ?? "",
    });
    return { ok: false, skipped: true, error: "Email is not configured." };
  }

  try {
    await sendGmail(env, {
      from,
      to,
      replyTo,
      subject: copy.subject,
      text: copy.text,
      html,
      attachments,
    });

    log.event("info", "form_verify_email_sent", {
      to,
      rowId: String(rowId ?? ""),
      slug: form?.slug ?? "",
      updated: Boolean(updated),
      htmlBytes: html.length,
      logoEmbedded: Boolean(logoBuffer),
      subject: copy.subject,
    });

    return { ok: true, verifyUrl };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await reportFormError(env, "form_verify_email_failed", {
      error: message,
      from,
      to,
      sender: MAIL_SENDER,
      slug: form?.slug ?? "",
    });
    return { ok: false, error: message };
  }
}

export { formatFormFromAddress } from "../../../../shared/forms/form-email.js";
