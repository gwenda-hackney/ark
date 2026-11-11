/**
 * The look every Gwenda email shares, as email-safe HTML: the leather board,
 * cream type, mustard and the red, the logo at the top, the poster face for
 * headings, the button, the page around it all. The weekly "what's on" email
 * (shared/weekly-email/render.js) and the form emails (shared/forms/format.js,
 * the website's verify email) are built from these pieces, so they read as
 * one family and a change here changes them all.
 *
 * This is email HTML, not the website's CSS: tables for layout, every style
 * inline, one column no wider than 600px, pictures at absolute addresses.
 * Web fonts load where the reader's app allows (Apple Mail); elsewhere each
 * falls back to a face that's on the machine (Impact and the like for the
 * poster face, Georgia for the slab and the pen).
 *
 * Nothing here knows about Mailchimp or about forms: a campaign adds its
 * merge tags to its own foot, a transactional email uses transactionalFoot.
 */

/** The site's colours (marketing/web/src/styles/chart.css), as plain hex. */
export const COLOURS = {
  board: "#1a1510",
  board2: "#27211a",
  ink: "#e8dfcc",
  ink2: "#c2b79f",
  cream: "#f2e8d2",
  mustard: "#dba63c",
  pop: "#d2342a",
  dark: "#0b0a08",
  rule: "#5a5246",
};

export const FONTS = {
  /** Protest Strike, else the heaviest narrow face on the machine. */
  display:
    "'Protest Strike',Impact,'HelveticaNeue-CondensedBlack','Arial Narrow Bold','Roboto Condensed',sans-serif-condensed,'Arial Black',sans-serif",
  slab: "'Zilla Slab',Georgia,'Times New Roman',serif",
  pen: "Caveat,Georgia,'Times New Roman',serif",
};

export const WEB_FONTS =
  "https://fonts.googleapis.com/css2?family=Caveat:wght@600&family=Protest+Strike&family=Zilla+Slab:ital,wght@0,400;0,700;1,400&display=swap";

/** The content's width, and the gutter either side of it. */
export const WIDTH = 600;
export const GUTTER = 20;

/**
 * The logo for email, on the site: a flat 24-bit PNG on the email's own
 * background. Never a see-through image or a WebP: Gmail's image proxy
 * mangles those.
 */
export const EMAIL_LOGO_PATH = "/brand/logo-email-social.png";

export function emailLogoUrl(origin) {
  return `${String(origin || "").replace(/\/+$/, "")}${EMAIL_LOGO_PATH}`;
}

export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Text or a merge tag as an href: only http(s), mailto, or a `*|TAG|*`. */
export function href(value) {
  const raw = String(value ?? "").trim();
  return /^(https?:\/\/|mailto:|\*\|[A-Z_:]+\|\*$)/i.test(raw) ? esc(raw) : "#";
}

/** A layout table: no borders, no gaps, and not a table to a screen reader. */
export function table(rows, { width = "100%", style = "", attrs = "" } = {}) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${width}"${attrs ? ` ${attrs}` : ""} style="border-collapse:collapse;${style}">${rows}</table>`;
}

export function spacer(height) {
  return `<tr><td height="${height}" style="height:${height}px;font-size:0;line-height:0;">&nbsp;</td></tr>`;
}

/** One row of the email's column, inside the gutter. */
export function row(content, { top = 0, bottom = 0, align = "left" } = {}) {
  return `<tr><td align="${align}" style="padding:${top}px ${GUTTER}px ${bottom}px;">${content}</td></tr>`;
}

/** A dashed line between two parts. */
export function rule({ top = 28, bottom = 28 } = {}) {
  return row(
    table(
      `<tr><td height="1" style="height:1px;border-top:1px dashed ${COLOURS.rule};font-size:0;line-height:0;">&nbsp;</td></tr>`,
    ),
    { top, bottom },
  );
}

/** The email's name in the poster face, with the mustard stroke under it. */
export function title(text) {
  return table(
    `<tr><td style="border-bottom:5px solid ${COLOURS.mustard};padding:0 4px 6px 0;"><h1 class="display h1" style="margin:0;font-family:${FONTS.display};font-size:42px;line-height:1.05;font-weight:700;font-synthesis:none;color:${COLOURS.cream};">${esc(text)}</h1></td></tr>`,
    { width: "", style: "width:auto;" },
  );
}

/** A section's name in the poster face, with the red stroke under it. */
export function heading(text) {
  return table(
    `<tr><td style="border-bottom:4px solid ${COLOURS.pop};padding:0 2px 4px 0;"><h2 class="display" style="margin:0;font-family:${FONTS.display};font-size:30px;line-height:1.1;font-weight:700;font-synthesis:none;color:${COLOURS.cream};">${esc(text)}</h2></td></tr>`,
    { width: "", style: "width:auto;" },
  );
}

/** A paragraph in the slab. `html` is already safe; escape text before it gets here. */
export function paragraph(html, { size = 18, colour = COLOURS.ink, margin = "0", italic = false, align = "" } = {}) {
  return `<p class="slab" style="margin:${margin};font-family:${FONTS.slab};font-size:${size}px;line-height:1.45;${italic ? "font-style:italic;" : ""}color:${colour};${align ? `text-align:${align};` : ""}">${html}</p>`;
}

/** A button that's a button in Outlook too (VML there, a padded link elsewhere). */
export function button(text, link) {
  const label = esc(text);
  return `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href(link)}" style="height:50px;v-text-anchor:middle;width:230px;" arcsize="8%" stroke="f" fillcolor="${COLOURS.mustard}"><w:anchorlock/><center style="color:${COLOURS.dark};font-family:Georgia,serif;font-size:16px;font-weight:bold;letter-spacing:1px;">${label.toUpperCase()}</center></v:roundrect><![endif]--><!--[if !mso]><!--><a href="${href(link)}" class="slab" style="display:inline-block;background-color:${COLOURS.mustard};border-radius:4px;color:${COLOURS.dark};font-family:${FONTS.slab};font-size:16px;line-height:50px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;text-align:center;text-decoration:none;width:230px;-webkit-text-size-adjust:none;">${label}</a><!--<![endif]-->`;
}

/** A link in capitals, mustard, underlined. */
export function textLink(text, link) {
  return `<a href="${href(link)}" class="slab" style="font-family:${FONTS.slab};font-size:14px;line-height:1.4;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${COLOURS.mustard};text-decoration:underline;">${esc(text)}</a>`;
}

/**
 * The top of every email: the logo, linked to the site, and what the place
 * is under it. Two rows.
 * @param {{ origin: string, name: string, social: string, logo?: string }} site
 *   `logo` is the picture's address (or a `cid:`); the site's own copy unless given
 */
export function logoHeader({ origin, name, social, logo }) {
  const src = logo || emailLogoUrl(origin);
  return [
    row(
      `<a href="${href(origin)}" style="text-decoration:none;"><img src="${esc(src)}" width="200" alt="${esc(`${name} ${social}`)}" style="display:block;width:200px;max-width:100%;height:auto;margin:0 auto;border:0;outline:none;color:${COLOURS.cream};font-family:${FONTS.display};font-size:34px;font-weight:700;line-height:1.1;text-align:center;"></a>`,
      { top: 32, bottom: 0, align: "center" },
    ),
    row(
      `<div class="slab" style="font-family:${FONTS.slab};font-size:13px;line-height:1.3;font-weight:700;letter-spacing:0.34em;text-transform:uppercase;color:${COLOURS.mustard};text-align:center;">${esc(social)} · Hackney Wick</div>`,
      { top: 10, bottom: 30, align: "center" },
    ),
  ];
}

/** The small print's type, and its links. */
export const FOOT_SMALL = `font-family:${FONTS.slab};font-size:13px;line-height:1.6;color:${COLOURS.ink2};text-align:center;`;
export const FOOT_LINK = `color:${COLOURS.ink};text-decoration:underline;`;

/** The foot's links, in capitals: Instagram · What's on · Find us. */
export function footLinks(links) {
  return `<p class="slab" style="margin:0;font-family:${FONTS.slab};font-size:13px;line-height:1.9;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;text-align:center;">${links
    .map(
      (link) =>
        `<a href="${href(link.href)}" style="color:${COLOURS.mustard};text-decoration:underline;white-space:nowrap;">${esc(link.text)}</a>`,
    )
    .join(" &nbsp;·&nbsp; ")}</p>`;
}

/**
 * The foot of an email sent to one person because of something they did (a
 * form, a confirmation): the links, why they got it, and who we are and
 * where. No unsubscribe: it isn't a mailing list.
 * @param {{ name: string, social: string, address: string, links: Array<{ text: string, href: string }>, why: string }} foot
 */
export function transactionalFoot({ name, social, address, links, why }) {
  return [
    rule(),
    row(
      footLinks(links) +
        `<p class="slab" style="margin:22px 0 0;${FOOT_SMALL}">${esc(why)}</p>` +
        `<p class="slab" style="margin:8px 0 0;${FOOT_SMALL}">${esc(name)} ${esc(social)} · ${esc(address)}</p>`,
      { bottom: 40, align: "center" },
    ),
  ];
}

/**
 * The whole email around its rows: the head (dark only, the web fonts, the
 * few rules that can't be inline), the line an inbox shows after the subject,
 * and the one centred column.
 * @param {object} page
 * @param {string} page.title the subject, for the <title>
 * @param {string} [page.preheader] the preview line; left out when empty
 * @param {string[]} page.rows rows of the column (row(), rule(), logoHeader()…)
 * @param {string} [page.css] more rules for the <style>, one per line
 */
export function emailDocument({ title: subject, preheader = "", rows, css = "" }) {
  const preview = preheader
    ? `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${COLOURS.board};">${esc(preheader)}${"&#847;&zwnj;&nbsp;".repeat(60)}</div>\n`
    : "";
  return `<!doctype html>
<html lang="en-GB" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${esc(subject)}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><style>.display{font-family:Impact,'Arial Narrow',Arial,sans-serif !important;font-weight:normal !important}.slab,.pen{font-family:Georgia,'Times New Roman',serif !important}</style><![endif]-->
<!--[if !mso]><!--><link href="${WEB_FONTS}" rel="stylesheet"><!--<![endif]-->
<style>
:root{color-scheme:dark;supported-color-schemes:dark}
body{margin:0;padding:0;width:100%;background-color:${COLOURS.board};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0}
img{-ms-interpolation-mode:bicubic}
a{color:${COLOURS.mustard}}
${css ? `${css}\n` : ""}</style>
</head>
<body bgcolor="${COLOURS.board}" style="margin:0;padding:0;width:100%;background-color:${COLOURS.board};">
${preview}<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${COLOURS.board}" style="border-collapse:collapse;background-color:${COLOURS.board};">
<tr><td align="center" style="padding:0;">
<!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${WIDTH}" align="center"><tr><td><![endif]-->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;max-width:${WIDTH}px;margin:0 auto;">
${rows.join("\n")}
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>
`;
}
