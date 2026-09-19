import { resolveFormFrom, resolveFormReplyTo } from "./form-email.js";
import { reportFormError } from "./form-alert.js";
import { createLogger } from "./log.js";
import {
  buildFormVerifyUrl,
  createFormVerifyToken,
} from "./form-verify-auth.js";
import { LOGO_CID } from "./rsvp-email-template.js";
import { fetchImageBuffer } from "./rsvp-tickets.js";
import {
  SITE_ADDRESS,
  SITE_DOMAIN,
  SITE_INSTAGRAM,
  VENUE_MAPS_URL,
} from "./site-location.js";

const COLORS = {
  bg: "#0d0d0d",
  card: "#1a1a1a",
  text: "#e8e4dc",
  muted: "#8a8680",
  gold: "#c9a84c",
};

const FONT_DISPLAY = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";
const FONT_BODY = "Lora, Georgia, 'Times New Roman', serif";
const GOLD_BORDER = "rgba(201, 168, 76, 0.12)";
const GOLD_UNDERLINE = "rgba(201, 168, 76, 0.45)";
const LOGO_URL = `${SITE_DOMAIN}/brand/logo-email.png`;
const log = createLogger();

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formVerifyCopy({ title, updated }) {
  const formTitle = title || "Gwenda";
  const eyebrow = "Confirm";
  const heading = updated ? "One more look" : "Almost there";
  const lead = updated
    ? `We've taken in your latest note for ${formTitle}. Open below when you're ready to confirm.`
    : `Thanks for writing to ${formTitle}. Open below when you're ready to confirm.`;
  const aside = "There's no rush. This note will keep for a couple of days.";
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
    "If this wasn't you, you can let it pass.",
  ].join("\n");

  return {
    eyebrow,
    heading,
    lead,
    aside,
    text,
    subject: `${heading} · Gwenda`,
  };
}

/** Branded HTML aligned with marketing/brand/email Mailchimp templates. */
export function buildFormVerifyEmailHtml({
  eyebrow,
  heading,
  lead,
  aside,
  verifyUrl,
  logoUrl = LOGO_URL,
  logoCid = null,
  year = new Date().getFullYear(),
}) {
  const logoSrc = logoCid ? `cid:${logoCid}` : logoUrl;
  const safeLogo = escapeHtml(logoSrc);
  const safeVerify = escapeHtml(verifyUrl);

  return `<!DOCTYPE html>
<html lang="en-GB" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark only" />
  <meta name="supported-color-schemes" content="dark only" />
  <title>${escapeHtml(heading)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&amp;family=Lora:ital,wght@0,400;1,400&amp;display=swap" rel="stylesheet" />
  <style type="text/css">
    :root { color-scheme: dark only; supported-color-schemes: dark only; }
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse !important; }
    img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
    a { color: ${COLORS.gold}; }
    @media screen and (max-width: 620px) {
      .gw-pad { padding-left: 20px !important; padding-right: 20px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;width:100%;background-color:${COLORS.bg};background:${COLORS.bg};color:${COLORS.text};-webkit-font-smoothing:antialiased;">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
    ${escapeHtml(lead)}
  </div>
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="${COLORS.bg}" style="background-color:${COLORS.bg};width:100%;">
    <tr>
      <td align="center" bgcolor="${COLORS.bg}" style="background-color:${COLORS.bg};padding:32px 16px;">
        <table role="presentation" width="560" border="0" cellspacing="0" cellpadding="0" style="width:100%;max-width:560px;">
          <tr>
            <td align="center" style="padding:0 0 28px;">
              <a href="${escapeHtml(SITE_DOMAIN)}" style="text-decoration:none;border:0;">
                <img src="${safeLogo}" alt="Gwenda" width="160" style="display:block;width:160px;max-width:55%;height:auto;border:0;" />
              </a>
            </td>
          </tr>
          <tr>
            <td bgcolor="${COLORS.card}" class="gw-pad" style="background-color:${COLORS.card};border:1px solid ${GOLD_BORDER};border-radius:2px;padding:32px 28px;">
              <p style="margin:0 0 0.85rem;font-family:${FONT_DISPLAY};font-size:11px;font-weight:600;letter-spacing:0.28em;text-transform:uppercase;color:${COLORS.gold};">
                ${escapeHtml(eyebrow)}
              </p>
              <h1 style="margin:0;font-family:${FONT_DISPLAY};font-weight:500;font-size:36px;letter-spacing:0.03em;line-height:1.2;color:${COLORS.text};">
                ${escapeHtml(heading)}
              </h1>
              <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin:18px 0 22px;">
                <tr>
                  <td width="32" height="1" bgcolor="${COLORS.gold}" style="font-size:0;line-height:0;height:1px;background-color:${COLORS.gold};">&nbsp;</td>
                </tr>
              </table>
              <p style="margin:0 0 1rem;font-family:${FONT_BODY};font-size:17px;line-height:1.65;color:${COLORS.text};">
                ${escapeHtml(lead)}
              </p>
              <p style="margin:0 0 1rem;font-family:${FONT_BODY};font-size:17px;line-height:1.65;color:${COLORS.muted};">
                ${escapeHtml(aside)}
              </p>
              <div style="margin:1.75rem 0 0;">
                <a href="${safeVerify}" style="display:inline-block;padding:0.9rem 2.2rem;background-color:${COLORS.gold};background:${COLORS.gold};color:${COLORS.bg};text-decoration:none;font-family:${FONT_DISPLAY};font-weight:600;letter-spacing:0.08em;text-transform:uppercase;font-size:13px;border-radius:2px;border:1px solid ${COLORS.gold};">
                  Confirm email
                </a>
              </div>
            </td>
          </tr>
          <tr>
            <td align="center" class="gw-pad" style="padding:28px 12px 8px;">
              <p style="margin:0 0 0.85rem;font-family:${FONT_DISPLAY};font-size:11px;font-weight:600;letter-spacing:0.28em;text-transform:uppercase;color:${COLORS.gold};">
                Connect
              </p>
              <p style="margin:0 0 0.65rem;font-family:${FONT_BODY};font-size:0.95rem;line-height:1.6;">
                <a href="${escapeHtml(VENUE_MAPS_URL)}" style="color:${COLORS.muted};text-decoration:underline;text-decoration-color:${GOLD_UNDERLINE};">${escapeHtml(SITE_ADDRESS)}</a>
              </p>
              <p style="margin:0 0 0.65rem;font-family:${FONT_BODY};font-size:0.95rem;line-height:1.6;">
                <a href="${escapeHtml(SITE_INSTAGRAM)}" style="color:${COLORS.muted};text-decoration:underline;text-decoration-color:${GOLD_UNDERLINE};">Instagram</a>
                <span style="color:${COLORS.muted};"> · </span>
                <a href="${escapeHtml(SITE_DOMAIN)}" style="color:${COLORS.muted};text-decoration:underline;text-decoration-color:${GOLD_UNDERLINE};">gwenda.co.uk</a>
              </p>
              <p style="margin:0;font-family:${FONT_BODY};font-size:0.85rem;line-height:1.5;color:${COLORS.muted};">
                © ${year} Gwenda
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Send the submitter a magic link to confirm their email.
 * @returns {Promise<{ ok: true, dryRun?: boolean, verifyUrl?: string } | { ok: false, skipped?: boolean, error?: string }>}
 */
export async function sendFormVerifyEmail(
  env,
  { form, email, rowId, requestUrl, updated = false },
) {
  const host = env.SMTP_HOST?.trim();
  const from = resolveFormFrom(env, form);
  const replyTo = resolveFormReplyTo(form);
  const to = String(email ?? "")
    .trim()
    .toLowerCase();
  const user = env.SMTP_USER?.trim() ?? "";
  // Gmail app passwords are often pasted with spaces; SMTP auth wants the 16 chars.
  const password = (env.SMTP_PASSWORD ?? "").replace(/\s+/g, "");
  const smtpReady = Boolean(host && from && to && user && password);
  const siteEnv = env.SITE_ENV?.trim();
  const isDeployed = siteEnv === "staging" || siteEnv === "production";

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

  if (!smtpReady) {
    if (!isDeployed) {
      log.info(
        `[form verify dry-run] to=${to || "(missing)"} from=${from || "(missing)"} replyTo=${replyTo || "(none)"}`,
      );
      return { ok: true, dryRun: true, verifyUrl };
    }
    await reportFormError(env, "form_verify_email_skipped", {
      reason: "smtp_not_configured",
      hasHost: Boolean(host),
      hasFrom: Boolean(from),
      hasTo: Boolean(to),
      hasUser: Boolean(user),
      hasPassword: Boolean(password),
      slug: form?.slug ?? "",
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
      host,
      user,
      slug: form?.slug ?? "",
    });
    return { ok: false, error: message };
  }
}

export { formatFormFromAddress } from "./form-email.js";
