/**
 * The parts an email to the list is made of, between its fixed top and foot
 * (campaign.js campaignHtml): a registry of section kinds, each knowing how
 * to clean what ops sends it, and how to draw itself as HTML rows and as
 * plain text. Ops' editor offers the kinds here; adding a kind (the weekly
 * email's "What's on", say) is adding an entry, and the renderer, the store
 * and the editor's list follow.
 *
 * Copy is plain text with two marks only: **bold** and [text](https://link).
 * Everything else is escaped; a link that isn't http(s) or mailto is dropped
 * and its words kept. No raw HTML ever reaches the email.
 */
import { BUTTON_LOOKS, COLOURS, bookingBlock, button, esc, heading, paragraph, row } from "./shell.js";
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

/** @type {Record<string, SectionKind>} */
export const SECTION_KINDS = {
  image: {
    label: "Image",
    blank: () => ({ kind: "image", assetId: "", alt: "" }),
    clean: (raw) => ({ kind: "image", assetId: line(raw?.assetId, 200), alt: line(raw?.alt, 300) }),
    empty: (section) => !section.assetId,
    html(section, { images }) {
      const url = sectionImageUrl(section.assetId, images);
      const picture = emailPicture({ url, whole: true, alt: section.alt }, COLUMN, { fluid: true });
      return picture ? [row(picture, { bottom: 24, align: "center" })] : [];
    },
    text: (section) => (section.alt ? [`[${section.alt}]`, ""] : []),
  },
  heading: {
    label: "Heading",
    blank: () => ({ kind: "heading", text: "" }),
    clean: (raw) => ({ kind: "heading", text: line(raw?.text, 150) }),
    empty: (section) => !section.text,
    html: (section) => [row(heading(section.text), { top: 6, bottom: 20 })],
    text: (section) => [section.text.toUpperCase(), ""],
  },
  copy: {
    label: "Copy",
    blank: () => ({ kind: "copy", text: "" }),
    clean: (raw) => ({ kind: "copy", text: text(raw?.text).trim() }),
    empty: (section) => !paragraphs(section.text).length,
    html: (section) =>
      paragraphs(section.text).map((part) => row(paragraph(copyInlineHtml(part)), { bottom: 18 })),
    text: (section) => paragraphs(section.text).flatMap((part) => [copyInlineText(part), ""]),
  },
  button: {
    label: "Button",
    blank: () => ({ kind: "button", label: "", link: "", look: "filled" }),
    clean: (raw) => ({
      kind: "button",
      label: line(raw?.label, 40),
      link: line(raw?.link, 1000),
      look: BUTTON_LOOKS.includes(raw?.look) ? raw.look : "filled",
    }),
    empty: (section) => !section.label || !safeLink(section.link),
    html: (section) => [
      row(button(section.label, safeLink(section.link), { look: section.look }), { top: 6, bottom: 26, align: "center" }),
    ],
    text: (section) => [`${section.label}: ${safeLink(section.link).replace(/^mailto:/i, "")}`, ""],
  },
  booking: {
    label: "Book a table",
    blank: () => ({ kind: "booking" }),
    clean: () => ({ kind: "booking" }),
    empty: () => false,
    html: (_section, { site }) => [row(bookingBlock(bookingLink(site)), { top: 10, bottom: 30, align: "center" })],
    text: (_section, { site }) => [`Book a table: ${bookingLink(site)}`, ""],
  },
};

/** The site's booking page, where every Book a table goes. */
export function bookingLink(site) {
  return `${String(site?.origin || "").replace(/\/+$/, "")}/bookings`;
}

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
  for (const section of sections) {
    const kind = kinds[section?.kind];
    if (!kind || kind.empty(section)) continue;
    rows.push(...kind.html(section, context));
    lines.push(...kind.text(section, context));
  }
  return { rows, lines };
}
