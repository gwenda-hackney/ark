/**
 * Form emails: subjects, plain text and HTML for the notification (to the
 * form's inbox) and the receipt (to the sender). Used by the website when a
 * form is submitted and by ops when it resends one. They wear the look every
 * Gwenda email shares (shared/email/shell.js), like the weekly email.
 */
import {
  COLOURS,
  FONTS,
  button,
  emailDocument,
  esc,
  heading,
  href,
  logoHeader,
  paragraph,
  row,
  rule,
  table,
  title,
  transactionalFoot,
} from "../email/shell.js";
import {
  SITE_ADDRESS,
  SITE_DOMAIN,
  SITE_INSTAGRAM,
  SITE_NAME,
  SITE_SOCIAL,
  VENUE_MAPS_URL,
} from "../site-location.js";
import { isValidEmail } from "./field-rules.js";
import { APPLICATION_SERIES_PROJECTION } from "./series-choice.js";

/** The Sanity form document the website renders, validates and emails. */
export const FORM_QUERY = `*[_type == "form" && enabled == true && slug.current == $slug][0] {
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
  },
  ${APPLICATION_SERIES_PROJECTION}
}`;

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

/** "Saturday 12 December 2026" as "Sat 12 Dec"; anything else as it is. */
function shortDay(value) {
  const match = /^([A-Za-z]+) (\d{1,2}) ([A-Za-z]+) \d{4}$/.exec(String(value ?? "").trim());
  return match ? `${match[1].slice(0, 3)} ${match[2]} ${match[3].slice(0, 3)}` : String(value ?? "").trim();
}

/**
 * What a submission is about, at a glance: the day and the head count, when
 * the form asks for them under the keys `date` and `people` (the party
 * enquiry does). Empty for a form with neither.
 */
function atAGlance(answers, { short = false } = {}) {
  const date = answerValue(answers, "date");
  const people = answerValue(answers, "people");
  return [
    date ? (short ? shortDay(date) : date) : "",
    people ? `${people} ${people === "1" ? "person" : "people"}` : "",
  ].filter(Boolean);
}

/**
 * The team's subject, what it is at a glance: "Play at Gwenda: DJ Alex",
 * "Party enquiry: Sam, Sat 12 Dec, 40 people", "Party enquiry updated: …".
 */
export function formatFormNotifySubject(form, answers, { updated = false } = {}) {
  const title = `${form?.title || "Form"}${updated ? " updated" : ""}`;
  const bits = [displayWho(answers), ...atAGlance(answers, { short: true })].filter(Boolean);
  return bits.length ? `${title}: ${bits.join(", ")}` : title;
}

/** The sender's subject: "Got it: Play at Gwenda" / "Got your changes: …". */
export function formatFormReceiptSubject(form, { updated = false } = {}) {
  const title = form?.title || "Gwenda";
  return updated ? `Got your changes: ${title}` : `Got it: ${title}`;
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

const LINK_STYLE = `color:${COLOURS.mustard};text-decoration:underline;word-break:break-word;`;
const STRUCK_STYLE = `color:${COLOURS.ink2};text-decoration-color:${COLOURS.ink2};`;

function formatAnswerHtml(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const escaped = esc(raw).replaceAll("\n", "<br>");

  if (/^https?:\/\/\S+$/i.test(raw)) {
    return `<a href="${href(raw)}" style="${LINK_STYLE}">${escaped}</a>`;
  }
  if (/^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(raw)) {
    return `<a href="mailto:${esc(raw)}" style="${LINK_STYLE}">${escaped}</a>`;
  }
  if (/^@[\w.]+$/.test(raw)) {
    const handle = raw.slice(1);
    return `<a href="https://instagram.com/${esc(handle)}" style="${LINK_STYLE}">${escaped}</a>`;
  }
  return escaped;
}

function formatStruckHtml(value) {
  const raw = String(value ?? "").trim();
  return `<s style="${STRUCK_STYLE}">${raw ? formatAnswerHtml(raw) : "(empty)"}</s>`;
}

function formatChangeHtml(change) {
  const cleared = `<span style="color:${COLOURS.ink2};">(cleared)</span>`;
  if (change.kind === "multi") {
    const removed = Array.isArray(change.removed) ? change.removed : [];
    const struck =
      removed.length > 0
        ? removed
            .map((item) => `<s style="${STRUCK_STYLE}margin-right:0.35em;">${esc(item)}</s>`)
            .join("")
        : !change.from
          ? `<s style="${STRUCK_STYLE}margin-right:0.35em;">(empty)</s>`
          : "";
    return `${struck}${change.to ? formatAnswerHtml(change.to) : cleared}`;
  }

  if (!change.from && change.to) {
    return formatAnswerHtml(change.to);
  }
  if (change.from && !change.to) {
    return `${formatStruckHtml(change.from)} ${cleared}`;
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
 * The words both the HTML and the plain-text email say, so they can't drift:
 * the line over the name, the name, what happens next, and the foot's reason.
 */
function emailWords({ form, answers, updated, isApplicant }) {
  const title = form?.title || "Form";
  const first = firstNameFromAnswers(answers);
  const who = displayWho(answers);
  if (isApplicant) {
    const thanks = first ? `Thanks, ${first}.` : "Thanks.";
    return {
      kicker: title,
      heading: updated ? "Got your changes" : "Got it",
      lead: updated
        ? `${thanks} We’ve got your changes and we’ll come back to you soon. Here’s how it reads now.`
        : `${thanks} That’s landed with us and we’ll come back to you soon. Here’s what you sent.`,
      glance: "",
      why: `You’re getting this because you filled in ${title} on gwenda.co.uk.`,
    };
  }
  return {
    kicker: updated ? `${title} · updated` : title,
    heading: who || title,
    lead: updated
      ? `${who || "Someone"} sent ${title} again with changes.`
      : `New from the website’s ${title} form.`,
    glance: atAGlance(answers).join(" · "),
    why: `Sent to the team because someone filled in ${title} on the website.`,
  };
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
  opsUrl = "",
}) {
  const groups = groupAnswersBySection(form, answers);
  const hasChanges = Array.isArray(changes) && changes.length > 0;
  const updated = Boolean(updatedFlag) || hasChanges;
  const isApplicant = variant === "applicant";
  const words = emailWords({ form, answers, updated, isApplicant });

  const header = isApplicant
    ? [words.heading, "", words.lead]
    : [words.kicker, words.heading, ...(words.glance ? [words.glance] : []), "", words.lead];

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
    body.push("Need to change something?");
    body.push(editUrl);
    body.push("Or send the form again with the same email and we’ll update it.");
    body.push("");
  }
  if (!isApplicant) {
    body.push("Reply to this email to write back to them.");
    if (opsUrl) body.push(`In ops: ${opsUrl}`);
    body.push("");
  }

  body.push("--", `${SITE_NAME} ${SITE_SOCIAL}, ${SITE_ADDRESS}`, words.why);

  return [...header, "", ...body].join("\n").trimEnd() + "\n";
}

/** A small line in capitals: over the name, and each question's label. */
function caps(text, { size = 13, colour = COLOURS.mustard, spacing = "0.08em" } = {}) {
  return `<div class="slab" style="font-family:${FONTS.slab};font-size:${size}px;line-height:1.4;font-weight:700;letter-spacing:${spacing};text-transform:uppercase;color:${colour};">${esc(text)}</div>`;
}

/** The answers as a list: each question in small capitals, what they said under it. */
function answerRows(rows, value) {
  return table(
    rows
      .map(
        (item, index) =>
          `<tr><td style="padding:${index ? 14 : 0}px 0 0;">${caps(item.label)}<div class="slab" style="font-family:${FONTS.slab};font-size:18px;line-height:1.45;color:${COLOURS.ink};padding-top:3px;word-break:break-word;overflow-wrap:anywhere;">${value(item)}</div></td></tr>`,
      )
      .join(""),
  );
}

/**
 * The form emails as HTML, in the look every Gwenda email shares
 * (shared/email/shell.js): the team's notification (`variant: "ops"`) and the
 * sender's receipt (`variant: "applicant"`).
 *
 * @param {object} email
 * @param {string} [email.editUrl] receipt: where the sender changes what they sent
 * @param {string} [email.opsUrl] notification: the submission in ops
 * @param {string} [email.logoUrl] the logo's address; the site's own copy unless given
 * @param {string|null} [email.logoCid] the logo as an inline attachment, when it travels with the email
 */
export function formatFormNotifyHtml({
  form,
  answers,
  changes,
  updated: updatedFlag = false,
  variant = "ops",
  editUrl = "",
  opsUrl = "",
  logoUrl = "",
  logoCid = null,
  siteAddress = SITE_ADDRESS,
  siteDomain = SITE_DOMAIN,
  siteInstagram = SITE_INSTAGRAM,
  venueMapsUrl = VENUE_MAPS_URL,
}) {
  const groups = groupAnswersBySection(form, answers);
  const hasChanges = Array.isArray(changes) && changes.length > 0;
  const updated = Boolean(updatedFlag) || hasChanges;
  const isApplicant = variant === "applicant";
  const words = emailWords({ form, answers, updated, isApplicant });
  const subject = isApplicant
    ? formatFormReceiptSubject(form, { updated })
    : formatFormNotifySubject(form, answers, { updated });

  const rows = [
    ...logoHeader({
      origin: siteDomain,
      name: SITE_NAME,
      social: SITE_SOCIAL,
      logo: logoCid ? `cid:${logoCid}` : logoUrl,
    }),
    row(
      `<div style="padding-bottom:8px;">${caps(words.kicker, { spacing: "0.14em" })}</div>${title(words.heading)}` +
        (words.glance
          ? `<div class="pen" style="font-family:${FONTS.pen};font-size:26px;line-height:1.15;font-weight:700;font-style:italic;font-synthesis:none;color:${COLOURS.mustard};padding-top:12px;">${esc(words.glance)}</div>`
          : "") +
        paragraph(esc(words.lead), { margin: "14px 0 0" }),
    ),
  ];

  if (!isApplicant && hasChanges) {
    rows.push(
      rule(),
      row(heading("What changed"), { bottom: 18 }),
      row(answerRows(changes, formatChangeHtml)),
    );
  }

  for (const group of groups) {
    rows.push(
      rule(),
      row(heading(group.title), { bottom: 18 }),
      row(answerRows(group.rows, (item) => formatAnswerHtml(item.value))),
    );
  }

  if (isApplicant && editUrl) {
    rows.push(
      rule(),
      row(
        paragraph("Need to change something?", { margin: "0 0 18px", align: "center" }) +
          button("Change it", editUrl) +
          paragraph("Or send the form again with the same email and we’ll update it.", {
            size: 15,
            colour: COLOURS.ink2,
            margin: "16px 0 0",
            align: "center",
          }),
        { align: "center" },
      ),
    );
  }
  if (!isApplicant) {
    rows.push(
      rule(),
      row(
        paragraph("Reply to this email to write back to them.", { margin: opsUrl ? "0 0 18px" : "0", align: "center" }) +
          (opsUrl ? button("Open in ops", opsUrl) : ""),
        { align: "center" },
      ),
    );
  }

  rows.push(
    ...transactionalFoot({
      name: SITE_NAME,
      social: SITE_SOCIAL,
      address: siteAddress,
      links: [
        { text: "Instagram", href: siteInstagram },
        { text: "What’s on", href: `${String(siteDomain).replace(/\/+$/, "")}/whats-on` },
        { text: "Find us", href: venueMapsUrl },
      ],
      why: words.why,
    }),
  );

  return emailDocument({
    title: subject,
    preheader: [words.glance, words.lead].filter(Boolean).join(" · "),
    rows,
    css: "@media (max-width:420px){.h1{font-size:36px !important}}",
  });
}

export function replyToFromAnswers(answers) {
  const emailRow = answers.find((row) => row.key === "email" && row.value);
  if (emailRow && isValidEmail(emailRow.value)) {
    return String(emailRow.value).trim().toLowerCase();
  }
  return undefined;
}
