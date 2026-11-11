/**
 * An event's own page (#240), `/whats-on/<series>`: what a night card, a deal
 * or the pop-up kitchen leads to. One page for all three: a night shows its
 * next date and the ones after, an event over several days shows each day, a
 * deal shows the days and hours it runs, a pop-up kitchen when it's in and
 * the way to its menu.
 *
 * eventPageModel decides what the page shows; renderEventPage turns it into
 * HTML. The page is filled in on request (functions/_lib/event-pages.js), in
 * the Pages Function and the dev server alike, so nothing here needs the
 * build: what only the build knows (whether bookings are on, the logo, a
 * guest chef's mark, where a pop-up's menu is) comes in as `parts`, cut from
 * the built shell (src/pages/whats-on/series-shell.astro).
 */
import {
  eventDescriptionParagraphs,
  eventPageLink,
  formatEventRecurrence,
  formatEventSpan,
} from "../data/events";
import {
  formPublicPath,
  isReservedFormSlug,
  slugFromFormPath,
} from "../../functions/_lib/form-paths.js";
import { richParagraphHtml } from "../../functions/_lib/rich-text.js";
import { SITE_DOMAIN } from "../../../../shared/site-location.js";
import {
  IMAGE_LARGEST,
  imageSrcset,
  isWholeFit,
  sizedImageUrl,
  tinyImageUrl,
} from "../../functions/_lib/sanity-image-url.js";
import { bookingUrlFor } from "../config/booking";
import { SafeHtml, attrs, html, renderGallery } from "./event-card.js";
import { daysAway } from "./london-day.js";
import { nightDay, nightRuns, runDay } from "./night-cards.js";
import { popupWhen } from "./popup-kitchen.js";
import { daysLabel } from "./promotions.js";

/** How many dates "More dates" lists under a repeating night. */
export const MORE_DATES = 8;

/** A photo's frame when it isn't a flyer shown whole: 4:5, as on the cards. */
const PHOTO_SHAPE = 0.8;

/**
 * How wide the page shows its pictures, for the browser to pick a size by
 * (an <img>'s `sizes`); these follow styles/chart-event.css. The flyer
 * beside the words is 26rem, 20rem on a tablet, and the screen less its
 * gutters (up to 26rem) on a phone; a flyer wider than tall goes above the
 * words, up to 44rem; a day's own flyer is 11rem.
 */
const FLYER_SIZES =
  "(min-width: 64.0625rem) 26rem, (min-width: 48.0625rem) 20rem, (min-width: 28.5rem) 26rem, calc(100vw - 2.5rem)";
const WIDE_FLYER_SIZES = "(min-width: 46.5rem) 44rem, calc(100vw - 2.5rem)";
const DAY_FLYER_SIZES = "11rem";

function text(value) {
  return String(value ?? "").trim();
}

/** "Thu 12 Nov" */
function shortDate(dateIso) {
  const { weekday, day, month } = nightDay(dateIso);
  return `${weekday} ${day} ${month}`;
}

/** A label as the built shell hands it over, back to plain words. */
function partText(value) {
  return text(value)
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

/**
 * Book a table for one night (#240), when bookings are on (the shell's part
 * `book` is the button's words) and the night is still to come: OpenTable
 * opened on that night, at its start time. The menu bar's Book a table is
 * the plain one.
 * @returns {{ href: string, label: string } | null}
 */
function bookModel(night, today, words) {
  const date = text(night?.date);
  if (!words || !date || date < today) return null;
  const away = daysAway(date, today);
  const day =
    away === 0 ? "tonight" : away === 1 ? "tomorrow" : shortDate(date);
  return {
    href: bookingUrlFor({ date, time: night.startTime }),
    label: `${words} for ${day}`,
  };
}

/** Tonight or Tomorrow; "Next up" only where the page says so. */
function dayLabel(dateIso, todayIso, nextUp) {
  const away = daysAway(dateIso, todayIso);
  if (away === 0) return "Tonight";
  if (away === 1) return "Tomorrow";
  return nextUp ? "Next up" : "";
}

/**
 * The picture's frame: a flyer ops marks "show whole image" (#27) keeps its
 * own shape, read from the size in its Sanity address, so none of it is
 * cropped; a photo is 4:5 as on the cards.
 */
function pictureModel(url, { alt = "", position = "" } = {}) {
  const src = text(url);
  if (!src) return null;
  const whole = isWholeFit(src);
  const size = /-(\d+)x(\d+)\.[a-z0-9]+(?:[?#]|$)/i.exec(src);
  const own = size ? Number(size[1]) / Number(size[2]) : 0;
  const shape =
    whole && own > 0
      ? Math.round(Math.min(2.4, Math.max(0.5, own)) * 10000) / 10000
      : PHOTO_SHAPE;
  return {
    src,
    alt: text(alt),
    whole,
    shape,
    position: whole ? "" : text(position),
    placeholder: tinyImageUrl(src),
  };
}

function scheduleRows(slots) {
  return (Array.isArray(slots) ? slots : [])
    .map((slot) => ({
      label: text(slot?.label),
      when: formatEventSpan(slot?.startTime, slot?.endTime),
    }))
    .filter((row) => row.label);
}

/** Who's on: their link (usually Instagram) sits on the name. */
function guestModel(name, url) {
  const guest = text(name);
  if (!guest) return null;
  return { name: guest, href: eventPageLink(url)?.href || "" };
}

const SITE_HOST = new URL(SITE_DOMAIN).hostname;

/**
 * An event whose link (ops' Link field) is one of this site's own forms,
 * `gwenda.co.uk/contact/<form>`: its page gets that form's button ("Book
 * your party") in place of Book a table. The button's words are the form's
 * heading, which the built shell hands over as the part `form:<slug>`; a link
 * to a form the site doesn't have is no form link.
 * @returns {{ href: string, label: string } | null}
 */
export function siteFormLink(value, parts = new Map()) {
  const raw = text(value);
  if (!raw) return null;
  let path = "";
  if (raw.startsWith("/") && !raw.startsWith("//")) path = raw;
  else {
    try {
      const url = new URL(raw);
      const host = url.hostname.replace(/^www\./i, "");
      if (/^https?:$/.test(url.protocol) && host === SITE_HOST) {
        path = url.pathname;
      }
    } catch {
      return null;
    }
  }
  const slug = slugFromFormPath(path);
  if (!slug || isReservedFormSlug(slug)) return null;
  const label = partText(parts.get(`form:${slug}`));
  return label ? { href: formPublicPath(slug), label } : null;
}

function span(row) {
  return formatEventSpan(row?.startTime, row?.endTime, row?.time);
}

/** The line over the title: when it comes round. */
function kicker(detail, kind, upcoming) {
  if (kind !== "event") return "";
  if (detail.datesPending) return "Dates to be announced";
  if (detail.schedule === "repeating") {
    const days = daysLabel(detail.recurrence);
    // "Every Tuesday" for one day; "Wed to Sat" for several.
    return / (to|and) /.test(days)
      ? days
      : formatEventRecurrence(text(detail.recurrence));
  }
  if (upcoming.length > 1) return `${upcoming.length} dates`;
  return "One-off";
}

/**
 * The day on the flyer's sticker: the next night's, or for an event on days
 * in a row the whole run ("Sat–Sun, 21–22, Nov"), as its card on What's on
 * has it (nightRuns says what a run is: never a weekly night).
 */
function stickerDay(detail, nextIso) {
  const seriesId = text(detail.seriesId) || "series";
  const run = nightRuns(
    (detail.nights || []).map((night) => ({
      date: text(night.date),
      seriesId,
    })),
    [{ ...detail, seriesId }],
  ).find((row) => row.start <= nextIso && nextIso <= row.end);
  return run && run.end !== run.start
    ? runDay(run.start, run.end)
    : nightDay(nextIso);
}

/**
 * @param {object} detail buildSeriesDetail's (functions/_lib/event-series.js)
 * @param {object} options
 * @param {"event"|"promotion"|"popup"} [options.category]
 * @param {Array<object>} [options.nights] every night of the series, in date order
 * @param {string} options.today YYYY-MM-DD at the bar
 * @param {Map<string, string>} [options.parts] HTML only the build knows
 */
export function eventPageModel(
  detail,
  { category = "event", nights = [], today, parts = new Map() } = {},
) {
  const kind =
    category === "promotion" || category === "popup" ? category : "event";
  const title = text(detail.title);
  const upcoming = nights.filter((night) => text(night.date) >= today);
  const repeating = detail.schedule === "repeating";
  const featured = detail.featuredGuest || null;
  const next = featured || detail.nights?.[0] || null;
  /** An event over several days: each day gets its own block. */
  const days = kind === "event" && !repeating ? detail.nights || [] : [];
  const severalDays = days.length > 1;
  const nextSpan = span(next || detail);
  /** The Book a table button's words, when bookings are on. */
  const bookWords = partText(parts.get("book"));

  const guestKey = title.toLowerCase();
  const logo = kind === "popup" ? parts.get(`logo:${guestKey}`) || "" : "";
  const picture = logo
    ? null
    : pictureModel(featured?.heroImageUrl || detail.heroImageUrl, {
        alt: featured?.heroImage?.alt || `${title} flyer`,
        position:
          featured?.heroObjectPosition ||
          detail.heroImage?.objectPosition ||
          detail.heroObjectPosition,
      });

  let when = "";
  if (kind === "promotion") {
    when = [daysLabel(detail.recurrence || next?.recurrence), nextSpan]
      .filter(Boolean)
      .join(", ");
  } else if (kind === "popup") {
    when = [popupWhen(detail, nights, today), nextSpan]
      .filter(Boolean)
      .join(", ");
  } else if (severalDays) {
    when = `${shortDate(days[0].date)} to ${shortDate(days.at(-1).date)}`;
  } else if (next?.date) {
    when = [shortDate(next.date), nextSpan].filter(Boolean).join(", ");
  }

  const guest =
    kind === "event" && !severalDays
      ? guestModel(next?.artist, next?.pageUrl)
      : null;
  // The night's link, else the series' own (a series with no dates has no night).
  const link = text(next?.pageUrl) || text(detail.pageUrl);
  const form = severalDays ? null : siteFormLink(link, parts);
  const external = form ? null : eventPageLink(link);
  const fallbackPage = kind === "popup" ? parts.get(`page:${guestKey}`) : "";
  const page = severalDays
    ? null
    : external || (fallbackPage ? eventPageLink(fallbackPage) : null);

  const words = severalDays
    ? text(detail.fullDescription || detail.description)
    : text(
        featured?.description ||
          detail.fullDescription ||
          next?.description ||
          detail.description,
      ) || (kind === "popup" ? text(parts.get(`line:${guestKey}`)) : "");

  const lead = {
    picture,
    logo,
    mark: parts.get("mark") || "",
    tag:
      kind === "promotion" ? "Deal" : kind === "popup" ? "Pop-up kitchen" : "",
    date: kind === "event" && next?.date ? stickerDay(detail, next.date) : null,
    tonight: kind === "event" && next?.date === today,
    label:
      kind === "event" && next?.date
        ? dayLabel(next.date, today, repeating)
        : "",
    when,
    offer: severalDays
      ? text(detail.offer)
      : text(featured?.offer || detail.offer || next?.offer),
    guest,
    schedule: severalDays
      ? []
      : scheduleRows(
          scheduleRows(next?.nightSchedule).length
            ? next.nightSchedule
            : detail.nightSchedule,
        ),
    description: eventDescriptionParagraphs(words),
    links: [
      form
        ? { href: form.href, label: form.label, button: true, solid: true }
        : null,
      kind === "popup"
        ? {
            href: parts.get(`menu:${text(detail.seriesId)}`) || "/kitchen",
            label: "See the menu",
            button: true,
          }
        : null,
      page && !guest?.href
        ? { href: page.href, label: page.label, external: true }
        : null,
    ].filter(Boolean),
    // A table for the night the page leads with. Not for an event that sends
    // people to a form (a party enquiry), nor a deal, which names no night;
    // an event over several days books each day in its own block.
    book:
      form || kind === "promotion" || severalDays
        ? null
        : bookModel(next, today, bookWords),
  };

  const dayBlocks = severalDays
    ? days.map((night) => {
        const own = text(night.description);
        const photo = text(night.heroImageUrl);
        const link = eventPageLink(night.pageUrl);
        const who = guestModel(night.artist, night.pageUrl);
        return {
          date: text(night.date),
          ...nightDay(night.date),
          tonight: night.date === today,
          label: dayLabel(night.date, today, false),
          title: text(night.title) !== title ? text(night.title) : "",
          when: span(night),
          offer: text(night.offer),
          guest: who,
          schedule: scheduleRows(night.nightSchedule),
          description:
            own && own !== words ? eventDescriptionParagraphs(own) : [],
          link: link && !who?.href ? link : null,
          book: bookModel(night, today, bookWords),
          picture:
            photo && photo !== picture?.src
              ? pictureModel(photo, { alt: `${text(night.title)} flyer` })
              : null,
        };
      })
    : [];

  /** A repeating night: the dates after the next one. */
  let moreDates = [];
  if (kind === "event" && repeating && next?.date) {
    const listed = (detail.upcomingDates || []).filter(
      (row) => row.displaced || row.date !== next.date,
    );
    const seen = new Set([next.date, ...listed.map((row) => row.date)]);
    const later = upcoming
      .filter((night) => !seen.has(night.date) && night.date > next.date)
      .map((night) => ({
        date: night.date,
        artist: night.artist || "",
        isSpecialEdition: Boolean(night.isSpecialEdition),
        startTime: night.startTime || "",
        endTime: night.endTime || "",
        time: night.time || "",
        note: "",
      }));
    moreDates = [...listed, ...later]
      .sort((a, b) => text(a.date).localeCompare(text(b.date)))
      .slice(0, MORE_DATES)
      .map((row) => {
        const rowSpan = span(row);
        return {
          date: text(row.date),
          day: shortDate(row.date),
          // The time only where it isn't the usual one.
          when: rowSpan && rowSpan !== nextSpan ? rowSpan : "",
          guest: row.isSpecialEdition ? text(row.artist) : "",
          note: text(row.note),
          instead:
            row.displaced && row.href
              ? { href: row.href, line: text(row.line) }
              : null,
        };
      });
  }

  return {
    kind,
    title,
    kicker: kicker(detail, kind, upcoming),
    wide: Boolean(picture && picture.shape > 1.15),
    lead,
    days: dayBlocks,
    moreDates,
    pending: Boolean(detail.datesPending),
    gallery: detail.gallery || [],
  };
}

function raw(value) {
  return new SafeHtml(String(value || ""));
}

function dateSticker(date) {
  if (!date) return "";
  return html`<span class="ch-night-date"
    >${[
      html`<span>${date.weekday}</span>`,
      html`<b>${date.day}</b>`,
      html`<span>${date.month}</span>`,
    ]}</span
  >`;
}

function pictureHtml(picture, { sizes, eager = false, sticker = "" }) {
  const srcset = imageSrcset(picture.src);
  return html`<a${attrs({
    class: `ch-night-photo ch-event-photo${picture.whole ? " ch-night-photo--whole" : ""}`,
    // The flyer opened large, in its own tab
    href: sizedImageUrl(picture.src, IMAGE_LARGEST),
    target: "_blank",
    rel: "noopener",
    style: [
      `--shape: ${picture.shape}`,
      picture.whole && picture.placeholder
        ? `--placeholder: url("${picture.placeholder}")`
        : "",
    ]
      .filter(Boolean)
      .join("; "),
  })}><img${attrs({
    src: sizedImageUrl(picture.src, 640),
    srcset,
    sizes: srcset ? sizes : "",
    alt: picture.alt,
    loading: eager ? "eager" : "lazy",
    style: picture.position ? `object-position: ${picture.position}` : "",
  })} />${sticker}</a>`;
}

function bookHtml(book) {
  if (!book) return "";
  return html`<a${attrs({
    class: "ch-btn ch-btn--solid",
    href: book.href,
    target: "_blank",
    rel: "noopener noreferrer",
  })}>${book.label}</a>`;
}

function guestHtml(guest) {
  if (!guest) return "";
  const name = guest.href
    ? html`<a${attrs({ href: guest.href, rel: "noopener noreferrer", target: "_blank" })}>${guest.name}</a>`
    : guest.name;
  return html`<p class="ch-event-guest">With ${name}</p>`;
}

function scheduleHtml(rows) {
  if (!rows.length) return "";
  return html`<ul class="ch-event-slots">
    ${rows.map(
      (row) =>
        html`<li>
          <span class="ch-event-slot-name">${row.label}</span>${
            row.when
              ? html`<span class="ch-event-slot-time">${row.when}</span>`
              : ""
          }
        </li>`,
    )}
  </ul>`;
}

function wordsHtml(paragraphs) {
  if (!paragraphs.length) return "";
  return html`<div class="ch-event-words">
    ${paragraphs.map((paragraph) => raw(richParagraphHtml(paragraph)))}
  </div>`;
}

function leadHtml(model) {
  const { lead } = model;
  const sticker = lead.tag
    ? html`<span class="ch-stand-tag">${lead.tag}</span>`
    : dateSticker(lead.date);
  const frame = lead.picture
    ? pictureHtml(lead.picture, {
        sizes: model.wide ? WIDE_FLYER_SIZES : FLYER_SIZES,
        eager: true,
        sticker,
      })
    : lead.logo
      ? html`<span class="ch-night-photo ch-event-photo ch-stand-photo--logo"
          >${raw(lead.logo)}${sticker}</span
        >`
      : html`<span class="ch-night-photo ch-event-photo ch-event-photo--mark"
          >${raw(lead.mark)}${sticker}</span
        >`;
  const actions =
    lead.book || lead.links.length
      ? html`<p class="ch-event-actions">
          ${bookHtml(lead.book)}${lead.links.map((link) =>
            link.button
              ? html`<a${attrs({
                  class: link.solid ? "ch-btn ch-btn--solid" : "ch-btn",
                  href: link.href,
                })}>${link.label}</a>`
              : html`<a${attrs({
                  class: "ch-event-link",
                  href: link.href,
                  target: "_blank",
                  rel: "noopener noreferrer",
                })}>${link.label}</a>`,
          )}
        </p>`
      : "";
  return html`<section${attrs({
    class: `ch-event-top${model.wide ? " ch-event-top--wide" : ""}`,
  })}>
    <figure${attrs({
      class: [
        "ch-event-flyer",
        lead.tonight && "ch-night--tonight",
        model.kind === "promotion" && "ch-stand--deal",
      ]
        .filter(Boolean)
        .join(" "),
    })}>${frame}</figure>
    <div class="ch-event-info">
      ${lead.label ? html`<p class="ch-night-label">${lead.label}</p>` : ""}${
        lead.when ? html`<p class="ch-night-time">${lead.when}</p>` : ""
      }${lead.offer ? html`<p class="ch-night-offer">${lead.offer}</p>` : ""}${guestHtml(
        lead.guest,
      )}${scheduleHtml(lead.schedule)}${wordsHtml(lead.description)}${actions}
    </div>
  </section>`;
}

function daysHtml(days) {
  if (!days.length) return "";
  return html`<section class="ch-event-section">
    <h2 class="ch-poster">Day by day</h2>
    <ol class="ch-event-days">
      ${days.map(
        (day) =>
          html`<li${attrs({
            class: `ch-event-day${day.tonight ? " ch-night--tonight" : ""}`,
          })}>
            <time datetime="${day.date}">${dateSticker(day)}</time>
            <div class="ch-event-day-body">
              ${day.label ? html`<p class="ch-night-label">${day.label}</p>` : ""}${
                day.title
                  ? html`<h3 class="ch-night-name">${day.title}</h3>`
                  : ""
              }${day.when ? html`<p class="ch-night-time">${day.when}</p>` : ""}${
                day.offer
                  ? html`<p class="ch-night-offer">${day.offer}</p>`
                  : ""
              }${guestHtml(day.guest)}${scheduleHtml(day.schedule)}${wordsHtml(
                day.description,
              )}${
                day.book || day.link
                  ? html`<p class="ch-event-actions">
                      ${bookHtml(day.book)}${
                        day.link
                          ? html`<a${attrs({
                              class: "ch-event-link",
                              href: day.link.href,
                              target: "_blank",
                              rel: "noopener noreferrer",
                            })}>${day.link.label}</a>`
                          : ""
                      }
                    </p>`
                  : ""
              }
            </div>
            ${
              day.picture
                ? html`<figure class="ch-event-day-flyer">
                    ${pictureHtml(day.picture, { sizes: DAY_FLYER_SIZES })}
                  </figure>`
                : ""
            }
          </li>`,
      )}
    </ol>
  </section>`;
}

function moreDatesHtml(rows) {
  if (!rows.length) return "";
  return html`<section class="ch-event-section">
    <h2 class="ch-poster">More dates</h2>
    <ol class="ch-event-dates">
      ${rows.map((row) =>
        row.instead
          ? html`<li class="ch-event-date ch-event-date--instead">
              <a href="${row.instead.href}">${row.instead.line}</a>
            </li>`
          : html`<li class="ch-event-date">
              <time datetime="${row.date}">${row.day}</time>${
                row.when
                  ? html`<span class="ch-event-date-time">${row.when}</span>`
                  : ""
              }${
                row.guest
                  ? html`<span class="ch-event-date-note"
                      >with ${row.guest}</span
                    >`
                  : ""
              }${
                row.note
                  ? html`<span class="ch-event-date-note">${row.note}</span>`
                  : ""
              }
            </li>`,
      )}
    </ol>
  </section>`;
}

/**
 * The page under its title. `pending` is the shell's own "check back soon"
 * block, kept only for a series with no dates yet.
 */
export function renderEventPage(model, { pending = "" } = {}) {
  const gallery = renderGallery(model.gallery, { title: model.title });
  return String(
    html`${leadHtml(model)}${model.pending ? raw(pending) : ""}${daysHtml(
      model.days,
    )}${moreDatesHtml(model.moreDates)}${
      gallery
        ? html`<section class="ch-event-section ch-photos">
            <h2 class="ch-poster">Photos</h2>
            ${raw(gallery)}
          </section>`
        : ""
    }`,
  );
}
