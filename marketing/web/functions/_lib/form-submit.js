import { sanityQuery } from "./sanity-query.js";
import {
  formatErrorForFieldValue,
  isValidEmail,
} from "./form-field-rules.js";

const FORM_SUBMIT_QUERY = `*[_type == "form" && enabled == true && slug.current == $slug][0] {
  title,
  "slug": slug.current,
  notifyEmail,
  fromEmail,
  replyToEmail,
  requireEmailVerification,
  successTitle,
  successMessage,
  verifyPendingTitle,
  verifyPendingMessage,
  fields[] {
    key,
    label,
    section,
    type,
    placeholder,
    helpText,
    required,
    options[] { label, value }
  }
}`;

export async function fetchFormForSubmit(env, slug) {
  const normalized = String(slug ?? "").trim();
  if (!normalized) return null;
  return sanityQuery(env, FORM_SUBMIT_QUERY, { $slug: normalized });
}

function optionValue(option) {
  const value = option?.value?.trim();
  if (value) return value;
  return String(option?.label ?? "").trim();
}

function allowedValues(field) {
  return new Set((field.options ?? []).map(optionValue).filter(Boolean));
}

function isOtherChoice(value) {
  return /^other$/i.test(String(value ?? "").trim());
}

function otherDetailFor(answers, key) {
  return asString(answers?.[`${key}Other`]);
}

function resolveChoiceValue(value, otherDetail) {
  if (!isOtherChoice(value)) return value;
  return otherDetail || "Other";
}

function asString(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function asStringArray(value) {
  if (Array.isArray(value)) {
    return value.map(asString).filter(Boolean);
  }
  const single = asString(value);
  return single ? [single] : [];
}

/**
 * Validate answers against the Sanity field list.
 * @returns {{ ok: true, answers: Array<{ key: string, label: string, value: string }> } | { ok: false, error: string }}
 */
export function validateFormAnswers(form, answers) {
  if (!form?.fields?.length) {
    return { ok: false, error: "This form isn't available." };
  }
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return { ok: false, error: "Invalid request." };
  }

  const normalized = [];

  for (const field of form.fields) {
    const key = field.key;
    if (!key) continue;

    const raw = answers[key];
    const required = Boolean(field.required);
    const otherDetail = otherDetailFor(answers, key);
    const hasOtherOption = (field.options ?? []).some((option) =>
      isOtherChoice(optionValue(option)),
    );

    if (field.type === "multiSelect") {
      const selected = asStringArray(raw);
      if (required && selected.length === 0) {
        return { ok: false, error: `Please complete: ${field.label}.` };
      }
      const allowed = allowedValues(field);
      if (selected.some((item) => !allowed.has(item))) {
        return { ok: false, error: `Invalid choice for ${field.label}.` };
      }
      if (hasOtherOption && selected.some(isOtherChoice) && !otherDetail) {
        return {
          ok: false,
          error: `Please specify for ${field.label}.`,
        };
      }
      const display = selected.map((item) =>
        resolveChoiceValue(item, otherDetail),
      );
      normalized.push({
        key,
        label: field.label,
        value: display.join(", "),
      });
      continue;
    }

    const value = asString(raw);
    if (required && !value) {
      return { ok: false, error: `Please complete: ${field.label}.` };
    }
    if (!value) {
      normalized.push({ key, label: field.label, value: "" });
      continue;
    }

    const formatError = formatErrorForFieldValue({
      key,
      type: field.type,
      label: field.label,
      value,
    });
    if (formatError) {
      return { ok: false, error: formatError };
    }

    if (field.type === "select") {
      const allowed = allowedValues(field);
      if (!allowed.has(value)) {
        return { ok: false, error: `Invalid choice for ${field.label}.` };
      }
      if (hasOtherOption && isOtherChoice(value) && !otherDetail) {
        return {
          ok: false,
          error: `Please specify for ${field.label}.`,
        };
      }
      normalized.push({
        key,
        label: field.label,
        value: resolveChoiceValue(value, otherDetail),
      });
      continue;
    }

    normalized.push({ key, label: field.label, value });
  }

  return { ok: true, answers: normalized };
}

/**
 * Diff previous vs next answers for ops "what changed" email.
 * Multi-select fields compare option sets (reorder-only is not a change).
 * @returns {Array<{
 *   key: string,
 *   label: string,
 *   from: string,
 *   to: string,
 *   kind: "text" | "multi",
 *   removed?: string[],
 *   added?: string[],
 * }>}
 */
export function diffFormAnswers(previous, next, form) {
  const fieldByKey = new Map(
    (form?.fields ?? []).map((field) => [field.key, field]),
  );
  const labelByKey = new Map(
    (form?.fields ?? []).map((field) => [field.key, field.label || field.key]),
  );
  for (const row of [...(previous ?? []), ...(next ?? [])]) {
    if (row?.key && !labelByKey.has(row.key)) {
      labelByKey.set(row.key, row.label || row.key);
    }
  }

  const prevMap = new Map(
    (previous ?? [])
      .filter((row) => row?.key)
      .map((row) => [row.key, String(row.value ?? "").trim()]),
  );
  const nextMap = new Map(
    (next ?? [])
      .filter((row) => row?.key)
      .map((row) => [row.key, String(row.value ?? "").trim()]),
  );

  const keys = [];
  const seen = new Set();
  for (const field of form?.fields ?? []) {
    if (!field?.key || seen.has(field.key)) continue;
    seen.add(field.key);
    keys.push(field.key);
  }
  for (const key of [...prevMap.keys(), ...nextMap.keys()]) {
    if (seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }

  /** @type {Array<{ key: string, label: string, from: string, to: string, kind: "text" | "multi", removed?: string[], added?: string[] }>} */
  const changes = [];
  for (const key of keys) {
    const from = prevMap.get(key) || "";
    const to = nextMap.get(key) || "";
    const field = fieldByKey.get(key);
    const isMulti = field?.type === "multiSelect";

    if (isMulti) {
      const fromParts = splitMultiValue(from);
      const toParts = splitMultiValue(to);
      const fromSet = new Set(fromParts);
      const toSet = new Set(toParts);
      if (setsEqual(fromSet, toSet)) continue;
      const removed = fromParts.filter((item) => !toSet.has(item));
      const added = toParts.filter((item) => !fromSet.has(item));
      changes.push({
        key,
        label: labelByKey.get(key) || key,
        from,
        to,
        kind: "multi",
        removed,
        added,
      });
      continue;
    }

    if (from === to) continue;
    changes.push({
      key,
      label: labelByKey.get(key) || key,
      from,
      to,
      kind: "text",
    });
  }
  return changes;
}

function splitMultiValue(value) {
  return String(value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

function answerValue(answers, key) {
  const row = (answers ?? []).find((item) => item.key === key && item.value);
  return row ? String(row.value).trim() : "";
}

function firstNameFromAnswers(answers) {
  const full =
    answerValue(answers, "name") || answerValue(answers, "artistName") || "";
  if (!full) return "";
  return full.split(/\s+/)[0] || full;
}

function displayWho(answers) {
  return (
    answerValue(answers, "artistName") ||
    answerValue(answers, "name") ||
    answerValue(answers, "email") ||
    ""
  );
}

/** Ops subject: "Dan applied · Play at Gwenda" / "Dan updated their application · …" */
export function formatFormNotifySubject(form, answers, { updated = false } = {}) {
  const title = form?.title || "Form";
  const who = displayWho(answers);
  if (updated) {
    return who
      ? `${who} updated their application · ${title}`
      : `Application updated · ${title}`;
  }
  return who ? `${who} applied · ${title}` : `New application · ${title}`;
}

/** Applicant subject: "Play at Gwenda | Thank you" / "… | We received your update" */
export function formatFormReceiptSubject(form, { updated = false } = {}) {
  const title = form?.title || "Gwenda";
  return updated
    ? `${title} | We received your update`
    : `${title} | Thank you`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Group filled answers by Sanity section, in form field order.
 * Empty optional fields are omitted (not answers).
 */
export function groupAnswersBySection(form, answers) {
  const byKey = new Map(
    (answers ?? [])
      .filter((row) => row?.key && String(row.value ?? "").trim())
      .map((row) => [row.key, row]),
  );

  /** @type {Array<{ title: string, rows: Array<{ key: string, label: string, value: string }> }>} */
  const groups = [];
  const byTitle = new Map();
  const seen = new Set();

  for (const field of form?.fields ?? []) {
    const row = byKey.get(field.key);
    if (!row) continue;
    seen.add(field.key);
    const title = String(field.section ?? "").trim() || "Details";
    let group = byTitle.get(title);
    if (!group) {
      group = { title, rows: [] };
      byTitle.set(title, group);
      groups.push(group);
    }
    group.rows.push({
      key: row.key,
      label: field.label || row.label,
      value: String(row.value).trim(),
    });
  }

  for (const row of byKey.values()) {
    if (seen.has(row.key)) continue;
    const title = "Details";
    let group = byTitle.get(title);
    if (!group) {
      group = { title, rows: [] };
      byTitle.set(title, group);
      groups.push(group);
    }
    group.rows.push({
      key: row.key,
      label: row.label || row.key,
      value: String(row.value).trim(),
    });
  }

  return groups;
}

function formatAnswerHtml(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const escaped = escapeHtml(raw).replaceAll("\n", "<br />");
  const linkStyle = `color:#c9a84c;text-decoration:underline;text-decoration-color:rgba(201,168,76,0.45);word-break:break-word;`;

  if (/^https?:\/\//i.test(raw)) {
    return `<a href="${escapeHtml(raw)}" style="${linkStyle}">${escaped}</a>`;
  }
  if (/^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(raw)) {
    return `<a href="mailto:${escapeHtml(raw)}" style="${linkStyle}">${escaped}</a>`;
  }
  if (/^@[\w.]+$/.test(raw)) {
    const handle = raw.slice(1);
    return `<a href="https://instagram.com/${escapeHtml(handle)}" style="${linkStyle}">${escaped}</a>`;
  }
  return escaped;
}

function formatStruckHtml(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return `<s style="color:${COLORS.muted};text-decoration-color:${COLORS.muted};">(empty)</s>`;
  }
  return `<s style="color:${COLORS.muted};text-decoration-color:${COLORS.muted};">${formatAnswerHtml(raw)}</s>`;
}

function formatChangeHtml(change) {
  if (change.kind === "multi") {
    const removed = Array.isArray(change.removed) ? change.removed : [];
    const struck =
      removed.length > 0
        ? removed
            .map(
              (item) =>
                `<s style="color:${COLORS.muted};text-decoration-color:${COLORS.muted};margin-right:0.35em;">${escapeHtml(item)}</s>`,
            )
            .join("")
        : !change.from
          ? `<s style="color:${COLORS.muted};text-decoration-color:${COLORS.muted};margin-right:0.35em;">(empty)</s>`
          : "";
    const current = change.to
      ? formatAnswerHtml(change.to)
      : `<span style="color:${COLORS.muted};">(cleared)</span>`;
    return `${struck}${current}`;
  }

  if (!change.from && change.to) {
    return formatAnswerHtml(change.to);
  }
  if (change.from && !change.to) {
    return `${formatStruckHtml(change.from)} <span style="color:${COLORS.muted};">(cleared)</span>`;
  }
  return `${formatStruckHtml(change.from)} ${formatAnswerHtml(change.to)}`;
}

function formatChangeText(change) {
  if (change.kind === "multi") {
    const removed = Array.isArray(change.removed) ? change.removed : [];
    const lines = [];
    if (removed.length) {
      lines.push(`Removed: ${removed.join(", ")}`);
    }
    lines.push(`Now: ${change.to || "(cleared)"}`);
    return lines.join("\n");
  }
  const from = change.from || "(empty)";
  const to = change.to || "(cleared)";
  return `(was: ${from})\n${to}`;
}

/**
 * Plain-text body for form notifications (ops or applicant).
 */
export function formatFormEmail({
  form,
  answers,
  changes,
  updated: updatedFlag = false,
  variant = "ops",
  editUrl = "",
}) {
  const groups = groupAnswersBySection(form, answers);
  const hasChanges = Array.isArray(changes) && changes.length > 0;
  const updated = Boolean(updatedFlag) || hasChanges;
  const isApplicant = variant === "applicant";
  const title = form?.title || "Form";
  const first = firstNameFromAnswers(answers);
  const who = displayWho(answers);

  const header = [];
  if (isApplicant) {
    header.push(first ? `Hi ${first},` : "Hello,");
    header.push("");
    header.push(
      updated
        ? `Thank you for the update. We've taken in your latest note for ${title}. Our team will get in touch with you shortly.`
        : `Thank you for writing. We've taken in your note for ${title}. Our team will get in touch with you shortly.`,
    );
  } else {
    header.push(updated ? "Update" : "New application");
    header.push(who || title);
    header.push("");
    header.push(
      updated
        ? `${who || "Someone"} updated their information for ${title}.`
        : `New application for ${title}.`,
    );
  }

  const body = [];
  if (!isApplicant && hasChanges) {
    body.push("What changed");
    body.push("─".repeat(12));
    for (const change of changes) {
      body.push(change.label);
      body.push(formatChangeText(change));
      body.push("");
    }
  }

  for (const group of groups) {
    body.push(group.title);
    body.push("─".repeat(Math.min(group.title.length, 40)));
    for (const row of group.rows) {
      body.push(`${row.label}`);
      body.push(String(row.value));
      body.push("");
    }
  }

  if (isApplicant && editUrl) {
    body.push("Change your application");
    body.push(editUrl);
    body.push("");
  }

  return [...header, "", ...body].join("\n").trimEnd() + "\n";
}

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

/**
 * Branded HTML for form notifications (ops + applicant receipt).
 */
export function formatFormNotifyHtml({
  form,
  answers,
  changes,
  updated: updatedFlag = false,
  variant = "ops",
  editUrl = "",
  logoUrl = "https://gwenda.co.uk/brand/logo-email.png",
  logoCid = null,
  year = new Date().getFullYear(),
  siteAddress = "",
  siteDomain = "https://gwenda.co.uk",
  siteInstagram = "",
  venueMapsUrl = "",
}) {
  const groups = groupAnswersBySection(form, answers);
  const title = form?.title || "Form";
  const first = firstNameFromAnswers(answers);
  const who =
    displayWho(answers) || (variant === "applicant" ? "there" : "Application");
  const hasChanges = Array.isArray(changes) && changes.length > 0;
  const updated = Boolean(updatedFlag) || hasChanges;
  const isApplicant = variant === "applicant";
  const logoSrc = logoCid ? `cid:${logoCid}` : logoUrl;

  const eyebrow = isApplicant
    ? title
    : updated
      ? "Update"
      : "New application";

  const heading = isApplicant ? (first ? `Hi ${first},` : "Hello,") : who;

  const lead = isApplicant
    ? updated
      ? `Thank you for the update. We've taken in your latest note for ${title}. Our team will get in touch with you shortly.`
      : `Thank you for writing. We've taken in your note for ${title}. Our team will get in touch with you shortly.`
    : updated
      ? `${who} updated their information.`
      : `New application for ${title}.`;

  const changesHtml =
    !isApplicant && hasChanges
      ? `
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:0 0 8px;">
                <tr>
                  <td style="padding:18px 0 8px;font-family:${FONT_DISPLAY};font-size:11px;font-weight:600;letter-spacing:0.28em;text-transform:uppercase;color:${COLORS.muted};">
                    What changed
                  </td>
                </tr>
                <tr>
                  <td width="32" height="1" bgcolor="${COLORS.gold}" style="font-size:0;line-height:0;height:1px;width:32px;background-color:${COLORS.gold};">&nbsp;</td>
                </tr>
                ${changes
                  .map(
                    (change) => `
                <tr>
                  <td style="padding:14px 0 4px;font-family:${FONT_DISPLAY};font-size:11px;font-weight:600;letter-spacing:0.22em;text-transform:uppercase;color:${COLORS.gold};">
                    ${escapeHtml(change.label)}
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 14px;font-family:${FONT_BODY};font-size:16px;line-height:1.65;color:${COLORS.text};border-bottom:1px solid ${GOLD_BORDER};">
                    ${formatChangeHtml(change)}
                  </td>
                </tr>`,
                  )
                  .join("")}
              </table>`
      : "";

  const sectionsHtml = groups
    .map((group) => {
      const rows = group.rows
        .map(
          (row) => `
                <tr>
                  <td style="padding:14px 0 4px;font-family:${FONT_DISPLAY};font-size:11px;font-weight:600;letter-spacing:0.22em;text-transform:uppercase;color:${COLORS.gold};">
                    ${escapeHtml(row.label)}
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 14px;font-family:${FONT_BODY};font-size:17px;line-height:1.65;color:${COLORS.text};border-bottom:1px solid ${GOLD_BORDER};">
                    ${formatAnswerHtml(row.value)}
                  </td>
                </tr>`,
        )
        .join("");

      return `
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:0 0 8px;">
                <tr>
                  <td style="padding:18px 0 8px;font-family:${FONT_DISPLAY};font-size:11px;font-weight:600;letter-spacing:0.28em;text-transform:uppercase;color:${COLORS.muted};">
                    ${escapeHtml(group.title)}
                  </td>
                </tr>
                <tr>
                  <td width="32" height="1" bgcolor="${COLORS.gold}" style="font-size:0;line-height:0;height:1px;width:32px;background-color:${COLORS.gold};">&nbsp;</td>
                </tr>
                ${rows}
              </table>`;
    })
    .join("");

  const editButton =
    isApplicant && editUrl
      ? `<div style="margin:1.75rem 0 0;">
                <a href="${escapeHtml(editUrl)}" style="display:inline-block;padding:0.9rem 2.2rem;background-color:${COLORS.gold};background:${COLORS.gold};color:${COLORS.bg};text-decoration:none;font-family:${FONT_DISPLAY};font-weight:600;letter-spacing:0.08em;text-transform:uppercase;font-size:13px;border-radius:2px;border:1px solid ${COLORS.gold};">
                  Change your application
                </a>
              </div>
              <p style="margin:0.85rem 0 0;font-family:${FONT_BODY};font-size:15px;line-height:1.6;color:${COLORS.muted};">
                Use the same email when you send again and we'll update this note.
              </p>`
      : "";

  const closingNote = isApplicant
    ? ""
    : `<p style="margin:1.5rem 0 0;font-family:${FONT_BODY};font-size:15px;line-height:1.6;color:${COLORS.muted};">
                Reply to write back to the applicant.
              </p>`;

  const addressLink =
    siteAddress && venueMapsUrl
      ? `<p style="margin:0 0 0.65rem;font-family:${FONT_BODY};font-size:0.95rem;line-height:1.6;">
                <a href="${escapeHtml(venueMapsUrl)}" style="color:${COLORS.muted};text-decoration:underline;text-decoration-color:${GOLD_UNDERLINE};">${escapeHtml(siteAddress)}</a>
              </p>`
      : "";
  const socialBits = [];
  if (siteInstagram) {
    socialBits.push(
      `<a href="${escapeHtml(siteInstagram)}" style="color:${COLORS.muted};text-decoration:underline;text-decoration-color:${GOLD_UNDERLINE};">Instagram</a>`,
    );
  }
  if (siteDomain) {
    socialBits.push(
      `<a href="${escapeHtml(siteDomain)}" style="color:${COLORS.muted};text-decoration:underline;text-decoration-color:${GOLD_UNDERLINE};">gwenda.co.uk</a>`,
    );
  }
  const socialHtml = socialBits.length
    ? `<p style="margin:0 0 0.65rem;font-family:${FONT_BODY};font-size:0.95rem;line-height:1.6;">
                ${socialBits.join(`<span style="color:${COLORS.muted};"> · </span>`)}
              </p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en-GB" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark only" />
  <meta name="supported-color-schemes" content="dark only" />
  <title>${escapeHtml(title)}</title>
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
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="${COLORS.bg}" style="background-color:${COLORS.bg};width:100%;">
    <tr>
      <td align="center" bgcolor="${COLORS.bg}" style="background-color:${COLORS.bg};padding:32px 16px;">
        <table role="presentation" width="560" border="0" cellspacing="0" cellpadding="0" style="width:100%;max-width:560px;">
          <tr>
            <td align="center" style="padding:0 0 28px;">
              <a href="${escapeHtml(siteDomain)}" style="text-decoration:none;border:0;">
                <img src="${escapeHtml(logoSrc)}" alt="Gwenda" width="160" style="display:block;width:160px;max-width:55%;height:auto;border:0;" />
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
              <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin:18px 0 14px;">
                <tr>
                  <td width="32" height="1" bgcolor="${COLORS.gold}" style="font-size:0;line-height:0;height:1px;background-color:${COLORS.gold};">&nbsp;</td>
                </tr>
              </table>
              <p style="margin:0;font-family:${FONT_BODY};font-size:17px;line-height:1.65;color:${COLORS.text};">
                ${escapeHtml(lead)}
              </p>
              ${changesHtml}
              ${sectionsHtml}
              ${editButton}
              ${closingNote}
            </td>
          </tr>
          <tr>
            <td align="center" class="gw-pad" style="padding:28px 12px 8px;">
              <p style="margin:0 0 0.85rem;font-family:${FONT_DISPLAY};font-size:11px;font-weight:600;letter-spacing:0.28em;text-transform:uppercase;color:${COLORS.gold};">
                Connect
              </p>
              ${addressLink}
              ${socialHtml}
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

export function replyToFromAnswers(answers) {
  const emailRow = answers.find((row) => row.key === "email" && row.value);
  if (emailRow && isValidEmail(emailRow.value)) {
    return String(emailRow.value).trim().toLowerCase();
  }
  return undefined;
}
