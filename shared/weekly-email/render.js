/**
 * The weekly "what's on" email as HTML, plain text, a subject and the
 * preview line, from its model (model.js).
 *
 * This is email HTML, not the website's CSS: tables for layout, every style
 * inline, one column no wider than 600px, pictures at absolute addresses.
 * It's the website's sibling all the same: the leather board, cream type,
 * mustard and the red, date stickers, the poster face for names. Web fonts
 * load where the reader's app allows (Apple Mail); elsewhere each falls back
 * to a face that's on the machine (Impact and the like for the poster face,
 * Georgia for the slab and the pen).
 *
 * The foot carries Mailchimp's merge tags (unsubscribe, update details, the
 * postal address), which a campaign needs to be sent at all.
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

const FONTS = {
  /** Protest Strike, else the heaviest narrow face on the machine. */
  display:
    "'Protest Strike',Impact,'HelveticaNeue-CondensedBlack','Arial Narrow Bold','Roboto Condensed',sans-serif-condensed,'Arial Black',sans-serif",
  slab: "'Zilla Slab',Georgia,'Times New Roman',serif",
  pen: "Caveat,Georgia,'Times New Roman',serif",
};

const WEB_FONTS =
  "https://fonts.googleapis.com/css2?family=Caveat:wght@600&family=Protest+Strike&family=Zilla+Slab:ital,wght@0,400;0,700;1,400&display=swap";

/** Mailchimp's merge tags, filled in for each reader when a campaign goes out. */
export const MAILCHIMP_TAGS = {
  unsubscribe: "*|UNSUB|*",
  updateProfile: "*|UPDATE_PROFILE|*",
  archive: "*|ARCHIVE|*",
  addressLine: "*|LIST:ADDRESSLINE|*",
};

/** The content's width, and the gutter either side of it. */
const WIDTH = 600;
const GUTTER = 20;
const INNER = WIDTH - GUTTER * 2;

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Text or a merge tag as an href: only http(s), mailto, or a `*|TAG|*`. */
function href(value) {
  const raw = String(value ?? "").trim();
  return /^(https?:\/\/|mailto:|\*\|[A-Z_:]+\|\*$)/i.test(raw) ? esc(raw) : "#";
}

/**
 * A picture at the size the email shows it (twice over, for sharp screens):
 * a flyer whole, at its own shape; a photo cut to 4:5 around its focal
 * point, as the website frames it. Always a JPEG unless the app asks for
 * better, with white behind anything see-through.
 */
export function emailImageUrl(photo, shownWidth) {
  if (!photo?.url) return "";
  let url;
  try {
    url = new URL(photo.url);
  } catch {
    return "";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "";
  if (url.hostname !== "cdn.sanity.io") return url.toString();
  const width = Math.min(1200, Math.round(shownWidth * 2));
  url.searchParams.set("w", String(width));
  if (!photo.whole) {
    url.searchParams.set("h", String(Math.round(width * 1.25)));
    url.searchParams.set("fit", "crop");
    if (url.searchParams.has("fp-x")) url.searchParams.set("crop", "focalpoint");
  } else {
    url.searchParams.delete("fp-x");
    url.searchParams.delete("fp-y");
  }
  url.searchParams.set("fm", "jpg");
  url.searchParams.set("bg", "ffffff");
  url.searchParams.set("q", "80");
  url.searchParams.set("auto", "format");
  return url.toString();
}

function image(photo, shownWidth, { fluid = false, className = "" } = {}) {
  const src = emailImageUrl(photo, shownWidth);
  if (!src) return "";
  const size = fluid ? `width:100%;max-width:${shownWidth}px;` : `width:${shownWidth}px;max-width:100%;`;
  return `<img src="${esc(src)}" width="${shownWidth}" alt="${esc(photo.alt || "")}"${className ? ` class="${className}"` : ""} style="display:block;${size}height:auto;border:0;outline:none;text-decoration:none;border-radius:4px;color:${COLOURS.cream};font-family:${FONTS.slab};font-size:14px;line-height:1.3;">`;
}

/** A layout table: no borders, no gaps, and not a table to a screen reader. */
function table(rows, { width = "100%", style = "", attrs = "" } = {}) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${width}"${attrs ? ` ${attrs}` : ""} style="border-collapse:collapse;${style}">${rows}</table>`;
}

/** The date, on a sticker: mustard, or red on the day it goes out. */
function sticker({ weekday, day, month }, { red = false, tilt = -3 } = {}) {
  const paper = red ? COLOURS.pop : COLOURS.mustard;
  const print = red ? COLOURS.cream : COLOURS.dark;
  const long = String(day).length > 2;
  const line = (text, size, extra = "") =>
    `<tr><td align="center" class="slab" style="font-family:${FONTS.slab};font-size:${size}px;line-height:1.1;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${print};white-space:nowrap;${extra}">${esc(text)}</td></tr>`;
  return table(
    `<tr><td bgcolor="${paper}" style="background-color:${paper};padding:6px 5px 7px;border-radius:2px;">${table(
      line(weekday, long ? 10 : 12) +
        line(day, long ? 17 : 24, "letter-spacing:0;padding:1px 0;") +
        line(month, long ? 10 : 12),
    )}</td></tr>`,
    { width: "54", style: `width:54px;transform:rotate(${tilt}deg);` },
  );
}

/** A word on a slip of paper: "Tonight", "Deal", the offer. */
function slip(text, { paper, print, size = 12 }) {
  return table(
    `<tr><td bgcolor="${paper}" class="slab" style="background-color:${paper};padding:4px 9px 5px;border-radius:2px;font-family:${FONTS.slab};font-size:${size}px;line-height:1.2;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${print};">${esc(text)}</td></tr>`,
    { width: "", style: "width:auto;" },
  );
}

const SLIPS = {
  tonight: { paper: COLOURS.pop, print: COLOURS.cream, size: 14 },
  deal: { paper: COLOURS.pop, print: COLOURS.cream },
  popup: { paper: COLOURS.mustard, print: COLOURS.dark },
  offer: { paper: COLOURS.cream, print: COLOURS.dark },
};

function spacer(height) {
  return `<tr><td height="${height}" style="height:${height}px;font-size:0;line-height:0;">&nbsp;</td></tr>`;
}

function name(title, link, size) {
  return `<a href="${href(link)}" class="display" style="font-family:${FONTS.display};font-size:${size}px;line-height:1.1;font-weight:700;font-synthesis:none;color:${COLOURS.cream};text-decoration:none;">${esc(title)}</a>`;
}

function timeLine(text, size = 22) {
  return `<div class="pen" style="font-family:${FONTS.pen};font-size:${size}px;line-height:1.15;font-weight:700;font-style:italic;font-synthesis:none;color:${COLOURS.mustard};padding-top:4px;">${esc(text)}</div>`;
}

function noteLine(text) {
  return `<div class="slab" style="font-family:${FONTS.slab};font-size:16px;line-height:1.4;color:${COLOURS.ink2};padding-top:6px;">${esc(text)}</div>`;
}

/** What goes beside or under a picture: the name, the hours, a line, the offer. */
function words(card, { size, label = "", links = [] }) {
  const parts = [];
  if (label) parts.push(`<div style="padding-bottom:8px;">${slip(label, SLIPS.tonight)}</div>`);
  parts.push(`<div>${name(card.title, card.href, size)}</div>`);
  const times = card.times || (card.when ? [card.when] : []);
  if (times.length) parts.push(timeLine(times.join(" · ")));
  if (card.note) parts.push(noteLine(card.note));
  if (card.offer) parts.push(`<div style="padding-top:10px;">${slip(card.offer, SLIPS.offer)}</div>`);
  if (links.length) {
    parts.push(
      `<div class="slab" style="font-family:${FONTS.slab};font-size:13px;line-height:1.6;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding-top:10px;">${links
        .map(
          (link) =>
            `<a href="${href(link.href)}" style="color:${COLOURS.mustard};text-decoration:underline;white-space:nowrap;">${esc(link.text)}</a>`,
        )
        .join(" &nbsp;&nbsp; ")}</div>`,
    );
  }
  return parts.join("");
}

/** The first night, big: its picture across the column, the date beside its name. */
function leadNight(card) {
  const picture = card.photo
    ? `<tr><td align="center" style="padding-bottom:16px;"><a href="${href(card.href)}" style="text-decoration:none;">${image(card.photo, 400, { fluid: true })}</a></td></tr>`
    : "";
  return table(
    `${picture}<tr><td>${table(
      `<tr><td width="54" valign="top" style="width:54px;padding-top:2px;">${sticker(card.sticker, { red: card.tonight })}</td><td width="16" style="width:16px;font-size:0;line-height:0;">&nbsp;</td><td valign="top">${words(card, { size: 30, label: card.tonight ? "Tonight" : "" })}</td></tr>`,
    )}</td></tr>`,
  );
}

const TILTS = [3, -4, 2, -2];

/** A night after the first: date, a small picture, the words. */
function night(card, index) {
  const picture = card.photo
    ? `<td width="100" valign="top" class="thumb" style="width:100px;"><a href="${href(card.href)}" style="text-decoration:none;">${image(card.photo, 100, { className: "thumb-img" })}</a></td><td width="14" style="width:14px;font-size:0;line-height:0;">&nbsp;</td>`
    : "";
  return table(
    `<tr><td width="54" valign="top" style="width:54px;padding-top:2px;">${sticker(card.sticker, { red: card.tonight, tilt: TILTS[index % TILTS.length] })}</td><td width="12" style="width:12px;font-size:0;line-height:0;">&nbsp;</td>${picture}<td valign="top">${words(card, { size: 22, label: card.tonight ? "Tonight" : "" })}</td></tr>`,
  );
}

/** A deal or the pop-up kitchen: its tag, a small picture, the words. */
function standing(card, tag, slipStyle) {
  const picture = card.photo
    ? `<td width="100" valign="top" class="thumb" style="width:100px;"><a href="${href(card.href)}" style="text-decoration:none;">${image(card.photo, 100, { className: "thumb-img" })}</a></td><td width="14" style="width:14px;font-size:0;line-height:0;">&nbsp;</td>`
    : "";
  return table(
    `<tr>${picture}<td valign="top"><div style="padding-bottom:8px;">${slip(tag, slipStyle)}</div>${words(card, { size: 22, links: card.links || [] })}</td></tr>`,
  );
}

/** A section's name in the poster face, with the red stroke under it. */
function heading(text) {
  return table(
    `<tr><td style="border-bottom:4px solid ${COLOURS.pop};padding:0 2px 4px 0;"><h2 class="display" style="margin:0;font-family:${FONTS.display};font-size:30px;line-height:1.1;font-weight:700;font-synthesis:none;color:${COLOURS.cream};">${esc(text)}</h2></td></tr>`,
    { width: "", style: "width:auto;" },
  );
}

function row(content, { top = 0, bottom = 0, align = "left" } = {}) {
  return `<tr><td align="${align}" style="padding:${top}px ${GUTTER}px ${bottom}px;">${content}</td></tr>`;
}

function rule() {
  return row(
    table(
      `<tr><td height="1" style="height:1px;border-top:1px dashed ${COLOURS.rule};font-size:0;line-height:0;">&nbsp;</td></tr>`,
    ),
    { top: 28, bottom: 28 },
  );
}

/** A button that's a button in Outlook too (VML there, a padded link elsewhere). */
function button(text, link) {
  const label = esc(text);
  return `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href(link)}" style="height:50px;v-text-anchor:middle;width:230px;" arcsize="8%" stroke="f" fillcolor="${COLOURS.mustard}"><w:anchorlock/><center style="color:${COLOURS.dark};font-family:Georgia,serif;font-size:16px;font-weight:bold;letter-spacing:1px;">${label.toUpperCase()}</center></v:roundrect><![endif]--><!--[if !mso]><!--><a href="${href(link)}" class="slab" style="display:inline-block;background-color:${COLOURS.mustard};border-radius:4px;color:${COLOURS.dark};font-family:${FONTS.slab};font-size:16px;line-height:50px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;text-align:center;text-decoration:none;width:230px;-webkit-text-size-adjust:none;">${label}</a><!--<![endif]-->`;
}

function textLink(text, link) {
  return `<a href="${href(link)}" class="slab" style="font-family:${FONTS.slab};font-size:14px;line-height:1.4;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${COLOURS.mustard};text-decoration:underline;">${esc(text)}</a>`;
}

/** "Wed 11 Nov", "Sat–Sun 21–22 Nov". */
function stickerText({ weekday, day, month }) {
  return `${weekday} ${day} ${month}`;
}

/** Up to three names that fit a subject line; the first always. */
function subjectNames(names, room) {
  const picked = [];
  for (const title of names) {
    const next = [...picked, title].join(", ");
    if (picked.length && next.length > room) break;
    picked.push(title);
    if (picked.length === 3) break;
  }
  return picked.join(", ");
}

function clip(text, length) {
  const value = String(text).trim();
  return value.length <= length ? value : `${value.slice(0, length - 1).trimEnd()}…`;
}

/** The subject: "This week at Gwenda: " and two or three names. */
export function weeklySubject(model) {
  const start = `This week at ${model.site.name}`;
  const names = (model.nights.length ? model.nights : [...model.deals, ...model.kitchens]).map((card) =>
    String(card.title).replace(/\s+/g, " ").trim(),
  );
  if (!names.length) return `What’s on at ${model.site.name}`;
  return clip(`${start}: ${subjectNames(names, 78 - start.length - 2)}`, 110);
}

/** The line an inbox shows after the subject: the week, day by day. */
export function weeklyPreheader(model) {
  const days = model.nights.map(
    (card) => `${card.tonight ? "Tonight" : card.sticker.weekday}: ${String(card.title).replace(/\s+/g, " ").trim()}`,
  );
  const [deal] = model.deals;
  if (deal) days.push([deal.title, deal.when].filter(Boolean).join(", "));
  if (!days.length) return "Nothing in the diary this week. Here’s what’s coming up.";
  return clip(days.join(" · "), 140);
}

/**
 * @param {ReturnType<import("./model.js").weeklyEmailModel>} model
 * @param {object} [options]
 * @param {string} [options.logoUrl] the logo's public address; the site's
 *   own copy (/brand/logo-email-social.png) unless given
 * @param {typeof MAILCHIMP_TAGS} [options.tags] the sender's merge tags
 * @returns {{ subject: string, preheader: string, html: string, text: string }}
 */
export function renderWeeklyEmail(model, { logoUrl, tags = MAILCHIMP_TAGS } = {}) {
  const { site } = model;
  const subject = weeklySubject(model);
  const preheader = weeklyPreheader(model);
  const logo = logoUrl || `${site.origin}/brand/logo-email-social.png`;
  const [lead, ...rest] = model.nights;
  const rows = [];

  // The logo and what the place is
  rows.push(
    row(
      `<a href="${href(site.origin)}" style="text-decoration:none;"><img src="${esc(logo)}" width="200" alt="${esc(`${site.name} ${site.social}`)}" style="display:block;width:200px;max-width:100%;height:auto;margin:0 auto;border:0;outline:none;color:${COLOURS.cream};font-family:${FONTS.display};font-size:34px;font-weight:700;line-height:1.1;text-align:center;"></a>`,
      { top: 32, bottom: 0, align: "center" },
    ),
    row(
      `<div class="slab" style="font-family:${FONTS.slab};font-size:13px;line-height:1.3;font-weight:700;letter-spacing:0.34em;text-transform:uppercase;color:${COLOURS.mustard};text-align:center;">${esc(site.social)} · Hackney Wick</div>`,
      { top: 10, bottom: 30, align: "center" },
    ),
  );

  // What's on this week
  rows.push(
    row(
      `${table(
        `<tr><td style="border-bottom:5px solid ${COLOURS.mustard};padding:0 4px 6px 0;"><h1 class="display h1" style="margin:0;font-family:${FONTS.display};font-size:42px;line-height:1.05;font-weight:700;font-synthesis:none;color:${COLOURS.cream};">What’s on this week</h1></td></tr>`,
        { width: "", style: "width:auto;" },
      )}<p class="slab" style="margin:12px 0 0;font-family:${FONTS.slab};font-size:18px;line-height:1.4;font-style:italic;color:${COLOURS.ink2};">${esc(model.week.span)}. We’re shut on Mondays.</p>`,
      { bottom: 28 },
    ),
  );

  if (lead) {
    rows.push(row(leadNight(lead), { bottom: 8 }));
    rest.forEach((card, index) => rows.push(row(night(card, index), { top: 26 })));
  } else {
    rows.push(
      row(
        `<p class="slab" style="margin:0;font-family:${FONTS.slab};font-size:18px;line-height:1.45;color:${COLOURS.ink};">Nothing in the diary for the rest of this week. The bar’s open all the same, so come down.</p>`,
      ),
    );
  }
  rows.push(row(textLink("See everything that’s on →", site.whatsOn), { top: 28 }));

  if (model.deals.length) {
    rows.push(rule(), row(heading("Deals"), { bottom: 22 }));
    model.deals.forEach((card, index) =>
      rows.push(row(standing(card, "Deal", SLIPS.deal), { top: index ? 24 : 0 })),
    );
  }

  if (model.kitchens.length) {
    rows.push(rule(), row(heading("Pop-up kitchen"), { bottom: 22 }));
    model.kitchens.forEach((card, index) =>
      rows.push(row(standing(card, "Pop-up kitchen", SLIPS.popup), { top: index ? 24 : 0 })),
    );
  }

  if (model.nextWeek.nights.length) {
    const lines = model.nextWeek.nights
      .map(
        (card) =>
          `<tr><td width="104" valign="top" class="slab" style="width:104px;padding:8px 10px 8px 0;font-family:${FONTS.slab};font-size:13px;line-height:1.5;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${COLOURS.mustard};">${esc(stickerText(card.sticker))}</td><td valign="top" style="padding:7px 0 8px;"><a href="${href(card.href)}" class="slab" style="font-family:${FONTS.slab};font-size:17px;line-height:1.3;font-weight:700;color:${COLOURS.cream};text-decoration:none;">${esc(card.title)}</a>${card.times.length ? `<div class="slab" style="font-family:${FONTS.slab};font-size:15px;line-height:1.4;color:${COLOURS.ink2};">${esc(card.times.join(" · "))}</div>` : ""}</td></tr>`,
      )
      .join("");
    const more = model.nextWeek.more
      ? `<p class="slab" style="margin:8px 0 0;font-family:${FONTS.slab};font-size:15px;line-height:1.4;font-style:italic;color:${COLOURS.ink2};">And ${model.nextWeek.more} more.</p>`
      : "";
    rows.push(rule(), row(heading("Next week"), { bottom: 14 }), row(`${table(lines)}${more}`));
  }

  // Book a table
  rows.push(
    rule(),
    row(
      `<p class="slab" style="margin:0 0 18px;font-family:${FONTS.slab};font-size:18px;line-height:1.4;color:${COLOURS.ink};text-align:center;">Coming down? Grab a table before they go.</p>${button(site.bookingLabel, site.booking)}`,
      { align: "center" },
    ),
  );

  // The foot: where we are, and the way off the list
  const small = `font-family:${FONTS.slab};font-size:13px;line-height:1.6;color:${COLOURS.ink2};text-align:center;`;
  const footLink = `color:${COLOURS.ink};text-decoration:underline;`;
  rows.push(
    rule(),
    row(
      `<p class="slab" style="margin:0;font-family:${FONTS.slab};font-size:13px;line-height:1.9;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;text-align:center;"><a href="${href(site.instagram)}" style="color:${COLOURS.mustard};text-decoration:underline;white-space:nowrap;">Instagram</a> &nbsp;·&nbsp; <a href="${href(site.whatsOn)}" style="color:${COLOURS.mustard};text-decoration:underline;white-space:nowrap;">What’s on</a> &nbsp;·&nbsp; <a href="${href(site.mapsUrl)}" style="color:${COLOURS.mustard};text-decoration:underline;white-space:nowrap;">Find us</a></p>` +
        `<p class="slab" style="margin:22px 0 0;${small}">You’re getting this because you got on the list at ${esc(site.name)}. Had enough? <a href="${href(tags.unsubscribe)}" style="${footLink}">Unsubscribe</a>, or <a href="${href(tags.updateProfile)}" style="${footLink}">change your details</a>.</p>` +
        `<p class="slab" style="margin:8px 0 0;${small}">${esc(site.name)} ${esc(site.social)} · ${esc(tags.addressLine)}</p>` +
        `<p class="slab" style="margin:8px 0 0;${small}"><a href="${href(tags.archive)}" style="${footLink}">Read this in your browser</a></p>`,
      { bottom: 40, align: "center" },
    ),
  );

  const html = `<!doctype html>
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
@media (min-width:600px){.thumb{width:150px !important}.thumb-img{width:150px !important}}
@media (max-width:420px){.h1{font-size:36px !important}}
</style>
</head>
<body bgcolor="${COLOURS.board}" style="margin:0;padding:0;width:100%;background-color:${COLOURS.board};">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${COLOURS.board};">${esc(preheader)}${"&#847;&zwnj;&nbsp;".repeat(60)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${COLOURS.board}" style="border-collapse:collapse;background-color:${COLOURS.board};">
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

  return { subject, preheader, html, text: renderText(model, tags) };
}

/** The same email for an app that shows no HTML. */
function renderText(model, tags) {
  const { site } = model;
  const out = [`WHAT'S ON THIS WEEK AT ${site.name.toUpperCase()}`, `${model.week.span}. We're shut on Mondays.`, ""];
  const card = (item, when) => {
    out.push(`${when ? `${when}: ` : ""}${item.title}`);
    const times = item.times || (item.when ? [item.when] : []);
    if (times.length) out.push(times.join(" · "));
    if (item.note) out.push(item.note);
    if (item.offer) out.push(item.offer);
    out.push(item.href, "");
  };
  if (model.nights.length) {
    for (const item of model.nights) card(item, `${item.tonight ? "Tonight, " : ""}${stickerText(item.sticker)}`);
  } else {
    out.push("Nothing in the diary for the rest of this week. The bar's open all the same, so come down.", "");
  }
  out.push(`Everything that's on: ${site.whatsOn}`, "");
  if (model.deals.length) {
    out.push("DEALS", "");
    for (const item of model.deals) card(item, "");
  }
  if (model.kitchens.length) {
    out.push("POP-UP KITCHEN", "");
    for (const item of model.kitchens) {
      card(item, "");
      for (const link of item.links) out.splice(out.length - 1, 0, `${link.text}: ${link.href}`);
    }
  }
  if (model.nextWeek.nights.length) {
    out.push("NEXT WEEK", "");
    for (const item of model.nextWeek.nights) {
      out.push(`${stickerText(item.sticker)}: ${item.title}${item.times.length ? `, ${item.times.join(" · ")}` : ""}`);
    }
    if (model.nextWeek.more) out.push(`And ${model.nextWeek.more} more.`);
    out.push("");
  }
  out.push(
    `${site.bookingLabel}: ${site.booking}`,
    "",
    "--",
    `${site.name} ${site.social}, ${site.address}`,
    `Instagram: ${site.instagram}`,
    "",
    `You're getting this because you got on the list at ${site.name}.`,
    `Unsubscribe: ${tags.unsubscribe}`,
    `Change your details: ${tags.updateProfile}`,
    tags.addressLine,
    "",
  );
  return out.join("\n");
}
