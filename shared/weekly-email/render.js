/**
 * The monthly "what’s on" email as HTML, plain text, a subject and the
 * preview line, from its model (model.js).
 *
 * The look (colours, faces, the logo at the top, the button, the page around
 * it) is the shell every Gwenda email shares, shared/email/shell.js; what is
 * the what's on email's own is here: date stickers, the night cards, the deals.
 *
 * The top (the logo) and the foot, with Mailchimp's merge tags, are every
 * campaign's (shared/email/campaign.js campaignHtml): this file gives only
 * what goes between them.
 */

import {
  COLOURS,
  FONTS,
  bookingButton,
  esc,
  heading,
  href,
  row,
  rule,
  table,
  textLink,
  title,
} from "../email/shell.js";
import { MAILCHIMP_TAGS, campaignFootText, campaignHtml } from "../email/campaign.js";
import { emailImageUrl, emailPicture as image } from "../email/image.js";

/** The colours are the shell's; the tags and picture sizes the campaign's; kept here for what reads them from this file. */
export { COLOURS, MAILCHIMP_TAGS, emailImageUrl };

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

function name(text, link, size) {
  return `<a href="${href(link)}" class="display" style="font-family:${FONTS.display};font-size:${size}px;line-height:1.1;font-weight:700;font-synthesis:none;color:${COLOURS.cream};text-decoration:none;">${esc(text)}</a>`;
}

function timeLine(text, size = 22) {
  return `<div class="pen" style="font-family:${FONTS.pen};font-size:${size}px;line-height:1.15;font-weight:700;font-style:italic;font-synthesis:none;color:${COLOURS.mustard};padding-top:4px;">${esc(text)}</div>`;
}

function noteLine(text) {
  return `<div class="slab" style="font-family:${FONTS.slab};font-size:16px;line-height:1.4;color:${COLOURS.ink2};padding-top:6px;">${esc(text)}</div>`;
}

/** A series' other nights this month: "Also 11, 18 and 25 Dec". */
function alsoLine(text) {
  return `<div class="slab" style="font-family:${FONTS.slab};font-size:15px;line-height:1.4;font-weight:700;letter-spacing:0.04em;color:${COLOURS.cream};padding-top:6px;">${esc(text)}</div>`;
}

/** What goes beside or under a picture: the name, the hours, a line, the offer. */
function words(card, { size, label = "", links = [] }) {
  const parts = [];
  if (label) parts.push(`<div style="padding-bottom:8px;">${slip(label, SLIPS.tonight)}</div>`);
  parts.push(`<div>${name(card.title, card.href, size)}</div>`);
  const times = card.times || (card.when ? [card.when] : []);
  if (times.length) parts.push(timeLine(times.join(" · ")));
  if (card.also) parts.push(alsoLine(card.also));
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

/**
 * One night, deal or pop-up kitchen on its own, for a one-off email's Event
 * card (shared/email/sections.js): a night as this email's first night (its
 * picture across the column, the date sticker beside its name); a deal or a
 * pop-up kitchen as here, its tag over its name.
 * @param {{ title: string, href: string, photo: { url: string, whole?: boolean, alt?: string } | null,
 *   sticker?: { weekday: string, day: string, month: string } | null, tag?: string, when?: string, note?: string }} card
 */
export function standaloneCard(card) {
  if (card.sticker) return leadNight({ ...card, times: card.when ? [card.when] : [] });
  const slipStyle = card.tag === "Deal" ? SLIPS.deal : SLIPS.popup;
  return standing({ ...card, times: card.when ? [card.when] : [] }, card.tag || "Pop-up kitchen", slipStyle);
}

/** One half of Bookings: its heading, its line, its link (text, not a button: Book a table is the one button). */
function bookingHalf(half) {
  return table(
    `<tr><td class="half-in" style="padding:0 20px 24px 0;"><h3 class="display" style="margin:0;font-family:${FONTS.display};font-size:28px;line-height:1.1;font-weight:700;font-synthesis:none;color:${COLOURS.cream};">${esc(half.heading)}</h3><p class="slab" style="margin:10px 0 18px;font-family:${FONTS.slab};font-size:17px;line-height:1.45;color:${COLOURS.ink2};">${esc(half.line)}</p><a href="${href(half.href)}" class="slab" style="font-family:${FONTS.slab};font-size:17px;font-weight:700;color:${COLOURS.mustard};text-decoration:underline;">${esc(half.cta)} &rarr;</a></td></tr>`,
  );
}

/**
 * Bookings' two halves, as the website has them (#315): side by side on a
 * desktop, one under the other on a phone. Each half is an inline block no
 * wider than half the column, so a narrow screen wraps them even where the
 * app ignores the media query; Outlook gets a two-cell table instead.
 */
function bookingHalves(halves) {
  const column = (half) =>
    `<div class="half" style="display:inline-block;width:100%;max-width:280px;vertical-align:top;text-align:left;">${bookingHalf(half)}</div>`;
  const cell = '<td width="280" valign="top">';
  return (
    `<div style="font-size:0;line-height:0;text-align:left;">` +
    `<!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560"><tr>${cell}<![endif]-->` +
    halves.map(column).join(`<!--[if mso]></td>${cell}<![endif]-->`) +
    `<!--[if mso]></td></tr></table><![endif]-->` +
    `</div>`
  );
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

/** The subject: "December at Gwenda: " and two or three names. */
export function weeklySubject(model) {
  const start = `${model.month.name} at ${model.site.name}`;
  const names = (model.nights.length ? model.nights : [...model.deals, ...model.kitchens]).map((card) =>
    String(card.title).replace(/\s+/g, " ").trim(),
  );
  if (!names.length) return `What’s on at ${model.site.name}`;
  return clip(`${start}: ${subjectNames(names, 78 - start.length - 2)}`, 110);
}

/** The line an inbox shows after the subject: the month's first nights, date by date. */
export function weeklyPreheader(model) {
  const days = model.nights.map(
    (card) =>
      `${card.tonight ? "Tonight" : `${card.sticker.weekday} ${card.sticker.day}`}: ${String(card.title).replace(/\s+/g, " ").trim()}`,
  );
  const [deal] = model.deals;
  if (deal) days.push([deal.title, deal.when].filter(Boolean).join(", "));
  if (!days.length) return "Nothing in the diary for the rest of the month. Here’s what’s coming up.";
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
  const [lead, ...rest] = model.nights;
  const rows = [];

  // What's on this month, centred under the logo like the flyer below it
  rows.push(
    row(
      `${title(`What’s on in ${model.month.name}`, { align: "center" })}<p class="slab" style="margin:12px 0 0;font-family:${FONTS.slab};font-size:18px;line-height:1.4;font-style:italic;color:${COLOURS.ink2};text-align:center;">${esc(model.month.span)}.</p>`,
      { bottom: 28, align: "center" },
    ),
  );

  if (lead) {
    rows.push(row(leadNight(lead), { bottom: 8 }));
    rest.forEach((card, index) => rows.push(row(night(card, index), { top: 26 })));
  } else {
    rows.push(
      row(
        `<p class="slab" style="margin:0;font-family:${FONTS.slab};font-size:18px;line-height:1.45;color:${COLOURS.ink};">Nothing in the diary for the rest of the month. The bar’s open all the same, so come down.</p>`,
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
    rows.push(rule(), row(heading(model.kitchens.length > 1 ? "Pop-up kitchens" : "Pop-up kitchen"), { bottom: 22 }));
    model.kitchens.forEach((card, index) =>
      rows.push(row(standing(card, "Pop-up kitchen", SLIPS.popup), { top: index ? 24 : 0 })),
    );
  }

  if (model.nextMonth.nights.length) {
    const lines = model.nextMonth.nights
      .map(
        (card) =>
          `<tr><td width="104" valign="top" class="slab" style="width:104px;padding:8px 10px 8px 0;font-family:${FONTS.slab};font-size:13px;line-height:1.5;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${COLOURS.mustard};">${esc(stickerText(card.sticker))}</td><td valign="top" style="padding:7px 0 8px;"><a href="${href(card.href)}" class="slab" style="font-family:${FONTS.slab};font-size:17px;line-height:1.3;font-weight:700;color:${COLOURS.cream};text-decoration:none;">${esc(card.title)}</a>${card.times.length ? `<div class="slab" style="font-family:${FONTS.slab};font-size:15px;line-height:1.4;color:${COLOURS.ink2};">${esc(card.times.join(" · "))}</div>` : ""}${card.also ? `<div class="slab" style="font-family:${FONTS.slab};font-size:15px;line-height:1.4;color:${COLOURS.ink2};">${esc(card.also)}</div>` : ""}</td></tr>`,
      )
      .join("");
    const more = model.nextMonth.more
      ? `<p class="slab" style="margin:8px 0 0;font-family:${FONTS.slab};font-size:15px;line-height:1.4;font-style:italic;color:${COLOURS.ink2};">And ${model.nextMonth.more} more.</p>`
      : "";
    rows.push(rule(), row(heading(`Early ${model.nextMonth.name}`), { bottom: 14 }), row(`${table(lines)}${more}`));
  }

  // Bookings: a party, or playing here, as the website's Bookings page has them
  const { bookings } = model;
  if (bookings?.halves?.length) {
    rows.push(
      rule(),
      row(
        `${heading(bookings.heading)}<p class="slab" style="margin:14px 0 0;font-family:${FONTS.slab};font-size:18px;line-height:1.4;font-style:italic;color:${COLOURS.ink2};">${esc(bookings.note)}</p>`,
        { bottom: 22 },
      ),
      row(bookingHalves(bookings.halves)),
    );
  }

  // Book a table
  rows.push(
    rule(),
    row(
      `<p class="slab" style="margin:0 0 18px;font-family:${FONTS.slab};font-size:18px;line-height:1.4;color:${COLOURS.ink};text-align:center;">Coming down? Grab a table before they go.</p>${bookingButton({ label: site.bookingLabel, link: site.booking, origin: site.origin })}`,
      { align: "center" },
    ),
  );

  // The logo on top and the foot (the way off the list) are every campaign's.
  const html = campaignHtml({
    site,
    subject,
    preheader,
    rows,
    logoUrl,
    tags,
    css: "@media (min-width:600px){.thumb{width:150px !important}.thumb-img{width:150px !important}}\n@media (max-width:420px){.h1{font-size:36px !important}}\n@media (max-width:599px){.half{max-width:100% !important}.half-in{padding-right:0 !important}}",
  });

  return { subject, preheader, html, text: renderText(model, tags) };
}

/** The same email for an app that shows no HTML. */
function renderText(model, tags) {
  const { site } = model;
  const out = [`WHAT'S ON IN ${model.month.name.toUpperCase()} AT ${site.name.toUpperCase()}`, `${model.month.span}.`, ""];
  const card = (item, when) => {
    out.push(`${when ? `${when}: ` : ""}${item.title}`);
    const times = item.times || (item.when ? [item.when] : []);
    if (times.length) out.push(times.join(" · "));
    if (item.also) out.push(item.also);
    if (item.note) out.push(item.note);
    if (item.offer) out.push(item.offer);
    out.push(item.href, "");
  };
  if (model.nights.length) {
    for (const item of model.nights) card(item, `${item.tonight ? "Tonight, " : ""}${stickerText(item.sticker)}`);
  } else {
    out.push("Nothing in the diary for the rest of the month. The bar's open all the same, so come down.", "");
  }
  out.push(`Everything that's on: ${site.whatsOn}`, "");
  if (model.deals.length) {
    out.push("DEALS", "");
    for (const item of model.deals) card(item, "");
  }
  if (model.kitchens.length) {
    out.push(model.kitchens.length > 1 ? "POP-UP KITCHENS" : "POP-UP KITCHEN", "");
    for (const item of model.kitchens) {
      card(item, "");
      for (const link of item.links) out.splice(out.length - 1, 0, `${link.text}: ${link.href}`);
    }
  }
  if (model.nextMonth.nights.length) {
    out.push(`EARLY ${model.nextMonth.name.toUpperCase()}`, "");
    for (const item of model.nextMonth.nights) {
      out.push(`${stickerText(item.sticker)}: ${item.title}${item.times.length ? `, ${item.times.join(" · ")}` : ""}${item.also ? ` (${item.also})` : ""}`);
    }
    if (model.nextMonth.more) out.push(`And ${model.nextMonth.more} more.`);
    out.push("");
  }
  if (model.bookings?.halves?.length) {
    out.push(model.bookings.heading.toUpperCase(), model.bookings.note, "");
    for (const half of model.bookings.halves) out.push(half.heading, half.line, `${half.cta}: ${half.href}`, "");
  }
  out.push(`${site.bookingLabel}: ${site.booking}`, "", ...campaignFootText(site, tags));
  return out.join("\n");
}
