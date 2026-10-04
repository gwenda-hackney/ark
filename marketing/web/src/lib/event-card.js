/**
 * One event card for What's on and the series pages, used by the Astro pages
 * (first paint) and by the live refresh in scripts/whats-on.js.
 *
 * A model builder decides what a card shows; renderEventCard turns any model
 * into HTML. Change the card here, not in the pages or the refresh script.
 */
import {
  eventDescriptionParagraphs,
  eventPageLink,
  formatEventDate,
  formatEventDiaryDate,
  formatEventRecurrence,
  formatEventSpan,
} from "../data/events";
import {
  formatShortEventDate,
  seriesCardNextLine,
} from "../../functions/_lib/event-series.js";
import { followUpdatesLink } from "./follow-updates.js";

/** How many nights "Nights ahead" lists under a repeating series. */
const NIGHTS_AHEAD = 3;

const ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

class SafeHtml {
  constructor(value) {
    this.value = value;
  }

  toString() {
    return this.value;
  }
}

function part(value) {
  if (value == null || value === false) return "";
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(part).join("");
  return escapeHtml(value);
}

/** Tagged template: interpolations are escaped unless they are html`` too. */
function html(strings, ...values) {
  let out = strings[0];
  values.forEach((value, index) => {
    out += part(value) + strings[index + 1];
  });
  return new SafeHtml(out);
}

function attrs(map) {
  return new SafeHtml(
    Object.entries(map)
      .filter(([, value]) => value != null && value !== false && value !== "")
      .map(([key, value]) =>
        value === true ? ` ${key}` : ` ${key}="${escapeHtml(value)}"`,
      )
      .join(""),
  );
}

function text(value) {
  return String(value ?? "").trim();
}

/** Sanity image URL at a width, unless it is already framed. */
export function sizedImageUrl(url, width) {
  const src = text(url);
  if (!src) return "";
  if (/[?&](rect|fit|w)=/.test(src)) return src;
  return `${src}${src.includes("?") ? "&" : "?"}w=${width}&auto=format&q=86`;
}

/**
 * A tiny, blurred copy of a Sanity photo (a few hundred bytes) to show while
 * the real one loads. "" for anything that isn't a Sanity image.
 */
export function tinyImageUrl(url) {
  try {
    const tiny = new URL(text(url));
    if (tiny.hostname !== "cdn.sanity.io") return "";
    tiny.searchParams.set("w", "48");
    tiny.searchParams.set("q", "30");
    tiny.searchParams.set("blur", "30");
    tiny.searchParams.set("auto", "format");
    return tiny.href;
  } catch {
    return "";
  }
}

function scheduleRows(slots) {
  return (Array.isArray(slots) ? slots : [])
    .map((slot) => ({
      label: text(slot?.label),
      when: formatEventSpan(slot?.startTime, slot?.endTime),
    }))
    .filter((row) => row.label);
}

function hasSlots(slots) {
  return scheduleRows(slots).length > 0;
}

/** Guest/collaborator: their link (usually Instagram) sits on the name. */
function guestModel(name, url) {
  const guest = text(name);
  if (!guest) return null;
  return { name: guest, href: eventPageLink(url)?.href || "" };
}

function teaser(label, date, name, href = "") {
  const who = text(name);
  return who ? { label, date: text(date), name: who, href: text(href) } : null;
}

function mediaModel({ src, alt, position, eager, captionLabel, captionName }) {
  return {
    src,
    alt: text(alt),
    position: text(position),
    eager: Boolean(eager),
    caption: text(captionName)
      ? { label: text(captionLabel) || "Hosting", name: text(captionName) }
      : null,
  };
}

/** What's on: one card per series. */
export function diaryCardModel(event, { eager = false } = {}) {
  const regular = Boolean(event.regular);
  const href = text(event.href) || "/whats-on";
  const guest = guestModel(event.guestName, event.guestUrl);
  const external = eventPageLink(event.pageUrl);
  const datesPending = Boolean(event.datesPending);
  // A link inside the card: the card becomes a div with a hit area behind it.
  const linked = Boolean(external) || datesPending;
  const hostDate = text(event.hostDate);
  const label = [
    event.title,
    event.imageCaptionName ? `Hosting ${event.imageCaptionName}` : "",
    hostDate
      ? `${event.hostThisWeek ? "This week, " : ""}${formatShortEventDate(hostDate)}`
      : "",
    event.thisWeekName ? `This week, ${event.thisWeekName}` : "",
    event.upcomingName ? `Next, ${event.upcomingName}` : "",
  ]
    .filter(Boolean)
    .join(". ");
  const whenLabel = regular
    ? formatEventRecurrence(text(event.scheduleLabel || event.recurrence))
    : text(event.scheduleLabel);
  const hostName = text(event.hostName);
  return {
    tag: linked ? "div" : "a",
    className: `event-card event-card--series${linked ? " event-card--linked" : ""}${regular ? " event-card--regular" : ""}`,
    href: linked ? "" : href,
    ariaLabel: linked ? "" : label,
    hit: linked ? { href, label } : null,
    media: mediaModel({
      src: sizedImageUrl(event.heroImageUrl || event.heroImage?.url, 960),
      alt:
        event.heroImage?.alt ||
        event.heroImageAlt ||
        event.imageCaptionName ||
        event.title,
      position: event.heroImage?.objectPosition,
      eager,
      captionLabel: event.imageCaption,
      captionName: event.imageCaptionName,
    }),
    when: whenLabel ? { label: whenLabel } : { date: text(event.date) },
    nextLine: seriesCardNextLine(
      event,
      formatEventSpan(event.startTime, event.endTime, event.time),
    ),
    title: text(event.title),
    guest,
    teasers: [
      hostName && !event.hostThisWeek
        ? teaser("Coming up", hostDate, hostName, event.hostHref)
        : null,
      hostName && event.hostThisWeek
        ? teaser("This week", hostDate, hostName)
        : null,
    ].filter(Boolean),
    offer: text(event.offer),
    schedule: scheduleRows(event.nightSchedule),
    description: eventDescriptionParagraphs(text(event.description)),
    pageLink: guest?.href ? null : external,
    followLink: datesPending ? followUpdatesLink() : null,
    follow: [
      teaser("This week", event.thisWeekDate, event.thisWeekName),
      teaser("Next", event.upcomingDate, event.upcomingName),
    ].filter(Boolean),
    moreDates: Number(event.nightCount) > 1,
    dates: [],
  };
}

/**
 * Series page, repeating series: the next night as one large card. The page
 * heading already names the series, so the card leads with the date.
 */
export function seriesCardModel(detail) {
  const featured = detail.featuredGuest || null;
  const next = featured || detail.nights?.[0] || null;
  const guest = guestModel(next?.artist, next?.pageUrl);
  const nextDate = text(detail.nextDate || next?.date);
  return {
    tag: "section",
    className: "whats-on-series-main event-card",
    href: "",
    ariaLabel: "",
    hit: null,
    media: mediaModel({
      src: sizedImageUrl(featured?.heroImageUrl || detail.heroImageUrl, 1800),
      alt: featured?.heroImage?.alt || detail.title,
      position:
        featured?.heroImage?.objectPosition ||
        featured?.heroObjectPosition ||
        detail.heroImage?.objectPosition ||
        detail.heroObjectPosition,
      eager: true,
      captionLabel: featured?.imageCaption,
      captionName: featured?.imageCaptionName,
    }),
    when: nextDate ? { label: "Next night" } : null,
    nextLine: [
      formatShortEventDate(nextDate),
      formatEventSpan(
        next?.startTime || detail.startTime,
        next?.endTime || detail.endTime,
        next?.time || detail.time,
      ),
    ]
      .filter(Boolean)
      .join(" · "),
    title: "",
    guest,
    teasers: [],
    offer: text(featured?.offer || detail.offer),
    schedule: scheduleRows(
      hasSlots(featured?.nightSchedule)
        ? featured.nightSchedule
        : detail.nightSchedule,
    ),
    description: eventDescriptionParagraphs(
      text(featured?.description || detail.description),
    ),
    pageLink: guest?.href ? null : eventPageLink(next?.pageUrl),
    followLink: null,
    follow: [],
    moreDates: false,
    // The next night leads the card, so the list starts after it.
    dates: (Array.isArray(detail.upcomingDates) ? detail.upcomingDates : [])
      .filter((night) => night.displaced || night.date !== nextDate)
      .slice(0, NIGHTS_AHEAD),
  };
}

/** Series page, scheduled series: one card per night. */
export function nightCardModel(
  night,
  { eager = false, seriesSchedule = [] } = {},
) {
  const guest = guestModel(night.artist, night.pageUrl);
  return {
    tag: "li",
    className: "event-card",
    href: "",
    ariaLabel: "",
    hit: null,
    media: mediaModel({
      src: sizedImageUrl(night.heroImageUrl || night.heroImage?.url, 1800),
      alt: night.heroImage?.alt || night.title,
      position: night.heroImage?.objectPosition || night.heroObjectPosition,
      eager,
      captionLabel: night.imageCaption,
      captionName: night.imageCaptionName,
    }),
    when: { date: text(night.date) },
    nextLine: formatEventSpan(night.startTime, night.endTime, night.time),
    title: text(night.title),
    guest,
    teasers: [],
    offer: text(night.offer),
    schedule: scheduleRows(
      hasSlots(night.nightSchedule) ? night.nightSchedule : seriesSchedule,
    ),
    description: eventDescriptionParagraphs(
      text(night.description),
      night.time,
    ),
    pageLink: guest?.href ? null : eventPageLink(night.pageUrl),
    followLink: null,
    follow: [],
    moreDates: false,
    dates: [],
  };
}

function mediaHtml(media) {
  if (!media?.src) {
    return html`<div class="event-media event-media--empty" aria-hidden="true">
      <span>Gwenda</span>
    </div>`;
  }
  const placeholder = tinyImageUrl(media.src);
  return html`<figure${attrs({
    class: "event-media",
    style: placeholder ? `--placeholder: url("${placeholder}")` : "",
  })}>
    <img${attrs({
      class: "event-hero",
      src: media.src,
      alt: media.alt,
      loading: media.eager ? "eager" : "lazy",
      style: media.position ? `object-position: ${media.position}` : "",
    })} />${
      media.caption
        ? html`<figcaption class="event-media-caption">
            <span class="event-media-caption-kicker"
              >${media.caption.label}</span
            ><span class="event-media-caption-name">${media.caption.name}</span>
          </figcaption>`
        : ""
    }
  </figure>`;
}

function whenHtml(when, nextLine) {
  if (!when) return "";
  const main = when.label
    ? html`<span>${when.label}</span>`
    : when.date
      ? html`<time datetime="${when.date}"
          >${formatEventDiaryDate(when.date)}</time
        >`
      : "";
  if (!main && !nextLine) return "";
  return html`<p class="event-date">
    ${main}${nextLine ? html`<span class="event-time">${nextLine}</span>` : ""}
  </p>`;
}

function guestHtml(guest) {
  if (!guest) return "";
  const name = guest.href
    ? html`<a${attrs({ href: guest.href, rel: "noopener noreferrer", target: "_blank" })}>${guest.name}</a>`
    : html`<span class="event-guest-name">${guest.name}</span>`;
  return html`<p class="event-guest">With ${name}</p>`;
}

const SEP = html`<span class="event-next-sep" aria-hidden="true">·</span>`;

function teaserHtml(line) {
  const when = formatShortEventDate(line.date);
  return html`<p${attrs({
    class: "event-next",
    "data-href": line.href,
    role: line.href ? "link" : "",
    tabindex: line.href ? "0" : "",
  })}><span class="event-next-label">${line.label}</span>${
    when ? html`${SEP}<time datetime="${line.date}">${when}</time>` : ""
  }${SEP}<span class="event-next-name">${line.name}</span></p>`;
}

function scheduleHtml(rows) {
  if (!rows.length) return "";
  return html`<div class="night-schedule">
    <ol class="night-schedule-list">
      ${rows.map(
        (row) =>
          html`<li>
            ${
              row.when
                ? html`<span class="night-schedule-time">${row.when}</span>`
                : ""
            }<span class="night-schedule-item">${row.label}</span>
          </li>`,
      )}
    </ol>
  </div>`;
}

function linkHtml(link) {
  if (!link?.href) return "";
  return html`<p class="event-page-link"><a${attrs({
    href: link.href,
    rel: "noopener noreferrer",
    target: "_blank",
  })}>${link.label}</a></p>`;
}

/** "Nights ahead": the nights after the next one, on a line under the time. */
function datesHtml(dates) {
  const rows = dates
    .map((night) => {
      if (night.displaced && night.href) {
        return html`<li>
          <a class="event-dates-instead" href="${night.href}"
            >${night.line || ""}</a
          >
        </li>`;
      }
      if (!night.date) return "";
      const artist = text(night.artist);
      return html`<li><time${attrs({ datetime: night.date, title: formatEventDate(night.date) })}>${formatShortEventDate(night.date)}</time>${
        night.isSpecialEdition && artist
          ? html` <span class="event-dates-guest">with ${artist}</span>`
          : ""
      }${night.note ? html` <span class="event-dates-note">${night.note}</span>` : ""}</li>`;
    })
    .filter(Boolean);
  if (!rows.length) return "";
  return html`<div class="event-dates">
    <h3 class="event-dates-label">Nights ahead</h3>
    <ul>
      ${rows}
    </ul>
  </div>`;
}

/** HTML for a page link on its own (the "follow for updates" line). */
export function pageLinkHtml(link) {
  return String(linkHtml(link));
}

export function renderEventCard(model) {
  const tag = model.tag || "div";
  const follow =
    model.follow.length || model.moreDates
      ? html`<div class="event-follow">
          ${model.follow.map(teaserHtml)}${
            model.moreDates
              ? html`<p class="event-more-dates">More dates and info</p>`
              : ""
          }
        </div>`
      : "";
  return String(
    html`<${new SafeHtml(tag)}${attrs({
      class: model.className,
      href: model.href,
      "aria-label": model.ariaLabel,
    })}>${
      model.hit
        ? html`<a${attrs({ class: "event-card-hit", href: model.hit.href, "aria-label": model.hit.label })}></a>`
        : ""
    }${mediaHtml(model.media)}<article class="event-copy">${whenHtml(
      model.when,
      model.nextLine,
    )}${model.title ? html`<h2 class="event-title">${model.title}</h2>` : ""}${guestHtml(model.guest)}${model.teasers.map(
      teaserHtml,
    )}${model.offer ? html`<p class="event-offer">${model.offer}</p>` : ""}${scheduleHtml(
      model.schedule,
    )}${datesHtml(model.dates)}${
      model.description.length
        ? html`<div class="event-description">
            ${model.description.map((paragraph) => html`<p>${paragraph}</p>`)}
          </div>`
        : ""
    }${linkHtml(model.pageLink)}${linkHtml(model.followLink)}${follow}</article></${new SafeHtml(tag)}>`,
  );
}

/**
 * Series gallery: rows of photos, each as wide as its shape allows, so every
 * row lines up at the same height (flex-grow by aspect ratio).
 */
/** Photos shown before "Show all" (scripts/gallery.js reveals the rest). */
export const GALLERY_FIRST = 12;

export function renderGallery(images, { title = "" } = {}) {
  const photos = (Array.isArray(images) ? images : []).filter(
    (image) => image?.url && image.width > 0 && image.height > 0,
  );
  if (!photos.length) return "";
  const items = photos.map((image, index) => {
    const ratio = Math.round((image.width / image.height) * 1000) / 1000;
    const alt =
      text(image.alt) || (title ? `${title}, photo ${index + 1}` : "");
    // While it loads: the blurred copy for the first rows, the main colour after.
    const blur =
      index < GALLERY_FIRST && image.lqip ? `--lqip: url("${image.lqip}")` : "";
    const color = image.color ? `--photo-color: ${image.color}` : "";
    return html`<li class="series-gallery-item"${attrs({
      style: [`--ratio: ${ratio}`, color, blur].filter(Boolean).join("; "),
      hidden: index >= GALLERY_FIRST,
    })}><a${attrs({
      href: image.url,
      "data-full": sizedImageUrl(image.url, 1800),
      target: "_blank",
      rel: "noopener",
    })}><img${attrs({
      src: sizedImageUrl(image.url, 900),
      alt,
      loading: "lazy",
      width: image.width,
      height: image.height,
    })} /></a></li>`;
  });
  return String(
    html`<section class="series-gallery" aria-label="Photos">
      <ul class="series-gallery-list">
        ${items}
      </ul>
      ${
        photos.length > GALLERY_FIRST
          ? html`<button
              class="series-gallery-more"
              type="button"
              data-gallery-more
            >
              Show all ${photos.length} photos
            </button>`
          : ""
      }
    </section>`,
  );
}
