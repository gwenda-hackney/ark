/**
 * The parts an email to the list is made of, between its fixed top and foot
 * (campaign.js campaignHtml): a registry of section kinds, each knowing how
 * to clean what ops sends it, and how to draw itself as HTML rows and as
 * plain text. Ops' editor offers the kinds here; adding a kind (the weekly
 * email's "What's on", say) is adding an entry, and the renderer, the store
 * and the editor's list follow.
 *
 * Copy is plain text with two marks only: **bold** and [text](https://link).
 *
 * Drawn for ops' editor (`marks` in the context), the same HTML carries
 * where each part came from: every row its section's place (data-section),
 * and the words that can be typed over in the preview (data-edit, with what
 * an empty one says), and a place for adding before each part and after the
 * last (data-insert). Empty parts are drawn there too: headings and copy to
 * be typed into, a picture or button as a dashed box saying what it needs.
 * The email that's sent never has any of it.
 * Everything else is escaped; a link that isn't http(s) or mailto is dropped
 * and its words kept. No raw HTML ever reaches the email.
 */
import { COLOURS, bookingButton, emailLogoUrl, esc, heading, outlineButton, paragraph, row, textLink } from "./shell.js";
import { bookingUrl } from "../../marketing/web/src/config/booking.ts";
import { siteConfig } from "../../marketing/web/src/config/site.ts";
import { emailPicture } from "./image.js";
import { sanityImageUrl } from "../sanity-image.js";

/** The column's width inside its gutter: a picture across it. */
export const COLUMN = 560;

const text = (value, max = 4000) =>
  String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .slice(0, max);
const line = (value, max = 200) => text(value, max).replace(/\s+/g, " ").trim();

/** An address a reader can follow: http(s) or mailto, else "". */
export function safeLink(value) {
  const raw = String(value ?? "").trim();
  if (/^https?:\/\/[^\s"'<>]+$/i.test(raw)) {
    try {
      new URL(raw);
      return raw;
    } catch {
      return "";
    }
  }
  if (/^mailto:[^\s"'<>]+@[^\s"'<>]+$/i.test(raw)) return raw;
  return "";
}

/** The editor's marks on words that can be typed over in the preview; nothing in an email that's sent. */
function editable(context, kind, placeholder) {
  return context?.marks ? ` data-edit="${kind}" data-placeholder="${esc(placeholder)}"` : "";
}

/** What an empty picture or button says in the editor, in place of itself. */
const WAITING = {
  image: "Picture: click here, then Change picture",
  button: "Button: click here to give it words and a link",
};

/** The editor's dashed box for a part that isn't filled in yet. */
function waitingRow(words) {
  return row(
    `<div data-waiting style="border:2px dashed ${COLOURS.mustard};border-radius:6px;padding:28px 16px;text-align:center;font-family:Georgia,serif;font-size:16px;line-height:1.4;color:${COLOURS.ink2};">${esc(words)}</div>`,
    { bottom: 20 },
  );
}

/** The editor's place for adding a part, before section `at`. */
const insertRow = (at) => `<tr data-insert="${at}"><td style="padding:0 40px;"></td></tr>`;

/** Space under each paragraph of copy. */
const PARAGRAPH_GAP = 18;

/** **bold**, and [words](address) whose address may hold one level of brackets (Wikipedia's do). */
const MARKS = /\*\*(.+?)\*\*|\[([^\]\n]+)\]\(((?:[^()\s]|\([^()\s]*\))*)\)/g;

/** One paragraph's marks as HTML: bold and safe links, everything else escaped. */
export function copyInlineHtml(source) {
  const value = String(source ?? "");
  let out = "";
  let at = 0;
  for (const match of value.matchAll(MARKS)) {
    out += esc(value.slice(at, match.index)).replace(/\n/g, "<br>");
    if (match[1] !== undefined) {
      out += `<strong style="font-weight:700;color:${COLOURS.cream};">${copyInlineHtml(match[1])}</strong>`;
    } else {
      const link = safeLink(match[3]);
      const words = esc(match[2]);
      out += link
        ? `<a href="${esc(link)}" style="color:${COLOURS.mustard};text-decoration:underline;">${words}</a>`
        : words;
    }
    at = match.index + match[0].length;
  }
  return out + esc(value.slice(at)).replace(/\n/g, "<br>");
}

/** The same marks as plain text: bold as it is, a link as "words (address)". */
export function copyInlineText(source) {
  return String(source ?? "").replace(MARKS, (_all, bold, words, link) => {
    if (bold !== undefined) return copyInlineText(bold);
    const safe = safeLink(link);
    return safe ? `${words} (${safe.replace(/^mailto:/i, "")})` : words;
  });
}

/** Copy's paragraphs: split at blank lines, each trimmed, empty ones dropped. */
export function paragraphs(source) {
  return text(source)
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * The address of an uploaded picture (a Sanity asset id) at the email's
 * size, for the Sanity project the email is rendered for.
 * @param {string} assetId
 * @param {{ projectId?: string, dataset?: string } | undefined} images
 */
export function sectionImageUrl(assetId, images) {
  return sanityImageUrl(images?.projectId || "", assetId, {}, images?.dataset || "production");
}

/**
 * @typedef {{ site: import("./campaign.js").CampaignSite,
 *   images?: { projectId: string, dataset: string } }} SectionContext
 * @typedef {{ label: string, blank: () => object, clean: (raw: any) => object,
 *   empty: (section: any) => boolean,
 *   html: (section: any, context: SectionContext) => string[],
 *   text: (section: any, context: SectionContext) => string[] }} SectionKind
 */

/**
 * How a button that isn't Book a table looks, as the website's are: an
 * underlined link in gold capitals (the site's "See the menu →"), or a gold
 * frame. Never a gold block: that's Book a table's.
 */
export const BUTTON_LOOKS = ["link", "outline"];

/** Book a table, word for word and link for link the website's (config/site.ts, config/booking.ts). */
export const BOOKING = { label: siteConfig.copy.bookingCta, link: bookingUrl };

/**
 * How an Image section shows: the column's width; small and whole, as a
 * logo; or as a collaboration, Gwenda's logo × theirs (a pop-up kitchen
 * is Gwenda and them together).
 */
export const IMAGE_SIZES = ["full", "logo", "collab"];

/** Each logo's width in a collaboration: the two side by side, the same size. */
export const COLLAB_LOGO_WIDTH = 130;

/** Gwenda's logo (the email's own, as at its top) × theirs, on one centred line. */
function collabLockup(picture, origin) {
  const ours = `<img src="${esc(emailLogoUrl(origin))}" width="${COLLAB_LOGO_WIDTH}" alt="Gwenda" style="display:block;width:${COLLAB_LOGO_WIDTH}px;max-width:100%;height:auto;border:0;">`;
  const times = `font-family:Georgia,serif;font-size:30px;line-height:1;color:${COLOURS.mustard};padding:0 16px;`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;margin:0 auto;"><tr><td valign="middle">${ours}</td><td valign="middle" style="${times}">&times;</td><td valign="middle">${picture}</td></tr></table>`;
}

/** A logo's width in the email: big enough to read, small beside a photo. */
export const LOGO_WIDTH = 160;

/** @type {Record<string, SectionKind>} */
export const SECTION_KINDS = {
  image: {
    label: "Image",
    blank: () => ({ kind: "image", assetId: "", alt: "", size: "full" }),
    clean: (raw) => ({
      kind: "image",
      assetId: line(raw?.assetId, 200),
      alt: line(raw?.alt, 300),
      size: IMAGE_SIZES.includes(raw?.size) ? raw.size : "full",
    }),
    empty: (section) => !section.assetId,
    html(section, { images, site }) {
      const url = sectionImageUrl(section.assetId, images);
      const photo = { url, whole: true, alt: section.alt };
      if (section.size === "collab") {
        const picture = emailPicture(photo, COLLAB_LOGO_WIDTH);
        return picture ? [row(collabLockup(picture, site?.origin), { top: 4, bottom: 20, align: "center" })] : [];
      }
      const logo = section.size === "logo";
      const picture = logo ? emailPicture(photo, LOGO_WIDTH) : emailPicture(photo, COLUMN, { fluid: true });
      return picture ? [row(picture, { bottom: logo ? 16 : 24, align: "center" })] : [];
    },
    text: (section) =>
      section.size === "collab"
        ? [`GWENDA × ${(section.alt || "").toUpperCase()}`, ""]
        : section.alt
          ? [`[${section.alt}]`, ""]
          : [],
  },
  heading: {
    label: "Heading",
    blank: () => ({ kind: "heading", text: "" }),
    clean: (raw) => ({ kind: "heading", text: line(raw?.text, 150) }),
    empty: (section) => !section.text,
    html: (section, context) => [
      row(heading(section.text, { attrs: editable(context, "heading", "Type a heading") }), { top: 6, bottom: 20 }),
    ],
    text: (section) => [section.text.toUpperCase(), ""],
  },
  copy: {
    label: "Copy",
    blank: () => ({ kind: "copy", text: "" }),
    clean: (raw) => ({ kind: "copy", text: text(raw?.text).trim() }),
    empty: (section) => !paragraphs(section.text).length,
    // Its paragraphs in one cell, so the editor can type across them (Enter
    // makes the next one); each has its gap under it, as a row of its own did.
    html(section, context) {
      const parts = paragraphs(section.text);
      const drawn = (parts.length ? parts : [""]).map((part) =>
        paragraph(copyInlineHtml(part), { margin: `0 0 ${PARAGRAPH_GAP}px` }),
      );
      return [row(drawn.join(""), { cellAttrs: editable(context, "copy", "Type here") })];
    },
    text: (section) => paragraphs(section.text).flatMap((part) => [copyInlineText(part), ""]),
  },
  button: {
    label: "Button",
    blank: () => ({ kind: "button", label: "", link: "", look: "link" }),
    clean: (raw) => ({
      kind: "button",
      label: line(raw?.label, 40),
      link: line(raw?.link, 1000),
      look: BUTTON_LOOKS.includes(raw?.look) ? raw.look : "link",
    }),
    empty: (section) => !section.label || !safeLink(section.link),
    html(section) {
      const link = safeLink(section.link);
      const drawn =
        section.look === "outline" ? outlineButton(section.label, link) : textLink(section.label, link, { size: 16 });
      return [row(drawn, { top: 6, bottom: 26, align: "center" })];
    },
    text: (section) => [`${section.label}: ${safeLink(section.link).replace(/^mailto:/i, "")}`, ""],
  },
  booking: {
    label: BOOKING.label,
    blank: () => ({ kind: "booking" }),
    clean: () => ({ kind: "booking" }),
    empty: () => false,
    html: (_section, { site }) => [
      row(bookingButton({ ...BOOKING, origin: site?.origin }), {
        top: 6,
        bottom: 28,
        align: "center",
      }),
    ],
    text: () => [`${BOOKING.label}: ${BOOKING.link}`, ""],
  },
};

/** The kinds the editor offers, in its order. */
export const SECTION_KIND_IDS = Object.keys(SECTION_KINDS);

/** The most sections one email has. */
export const MAX_SECTIONS = 40;

/** Sections as ops keeps them: known kinds only, each cleaned; anything else dropped. */
export function cleanSections(raw, kinds = SECTION_KINDS) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((section) => section && Object.hasOwn(kinds, section.kind))
    .slice(0, MAX_SECTIONS)
    .map((section) => kinds[section.kind].clean(section));
}

/**
 * Sections as email rows and text lines. A section with nothing in it yet
 * (no picture, no words, a button without a working link) is left out.
 * @param {object[]} sections already cleaned
 * @param {SectionContext} context
 */
export function renderSections(sections, context, kinds = SECTION_KINDS) {
  const rows = [];
  const lines = [];
  const marks = Boolean(context?.marks);
  sections.forEach((section, index) => {
    const kind = kinds[section?.kind];
    if (!kind) return;
    if (marks) rows.push(insertRow(index));
    const empty = kind.empty(section);
    if (empty && !marks) return;
    if (!empty) lines.push(...kind.text(section, context));
    // In the editor, empty words still show, to be typed into; an empty picture or button says what it needs.
    const drawn = empty && WAITING[section.kind] ? [waitingRow(WAITING[section.kind])] : kind.html(section, context);
    rows.push(...(marks ? drawn.map((part) => part.replace(/^<tr/, `<tr data-section="${index}"`)) : drawn));
  });
  if (marks) rows.push(insertRow(sections.length));
  return { rows, lines };
}
