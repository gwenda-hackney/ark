/**
 * Public what's-on is series-first.
 * A series is a template (name, copy, default image, optional recurrence).
 * Occurrences are nights scheduled into that series, each with its own
 * date and optional image/description overrides.
 * Recurrence is optional. Gwenda Nights is still a series.
 */

import { pageEventFeed } from "./event-feed.js";

const WEEKDAY_NAMES = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

function todayIso(now = new Date()) {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function heroUrl(event) {
  return (
    String(event?.heroImageUrl || event?.heroImage?.url || "").trim() || null
  );
}

function seriesKey(event) {
  return String(event?.seriesId || event?.id || "").trim();
}

function compareNights(a, b) {
  return (
    String(a.date).localeCompare(String(b.date)) ||
    String(a.id).localeCompare(String(b.id))
  );
}

/** Strip residency suffixes so "Negroni Night" matches "Negroni Sessions". */
function normalizeLabel(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/\b(nights?|sessions?|editions?)\b/g, " ")
    .replace(/[^a-z0-9]+/g, "");
}

function sameLabel(a, b) {
  const left = normalizeLabel(a);
  const right = normalizeLabel(b);
  return Boolean(left && right && left === right);
}

/**
 * Public identity for a night in the series queue, if it is more than the
 * series name. `index` 0 is the next night; 1 is the one after, and so on.
 */
export function nextNightIdentity(nights, seriesTitle = "", index = 0) {
  const ordered = (Array.isArray(nights) ? nights : [])
    .slice()
    .sort(compareNights);
  const night = ordered[Math.max(0, Math.floor(Number(index) || 0))];
  if (!night) return null;
  const title = String(night.title || "").trim();
  const artist = String(night.artist || "").trim();
  const series = String(seriesTitle || "").trim();
  const ownTitle = Boolean(title && !sameLabel(title, series));
  const guest = Boolean(artist && night.isSpecialEdition);
  if (!ownTitle && !guest) return null;
  return {
    date: String(night.date || ""),
    title: ownTitle ? title : "",
    artist: guest ? artist : "",
  };
}

/** Short calendar date for teasers: Sat 24 Oct */
export function formatShortEventDate(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || "").trim());
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return "";
  const weekday = ["Sun", "Mon", "Tues", "Wed", "Thur", "Fri", "Sat"][
    date.getDay()
  ];
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${weekday} ${day} ${months[month - 1]}`;
}

/**
 * Stamp for a night's own flyer when that night is a guest artist.
 * Series default images stay unlabelled.
 */
export function guestImageCaption(night, seriesTitle = "") {
  if (!heroUrl(night)) return null;
  const artist = String(night?.artist || "").trim();
  if (!artist || !night?.isSpecialEdition) return null;
  const title = String(night.title || "").trim();
  const series = String(seriesTitle || night.seriesTitle || "").trim();
  const ownTitle = Boolean(title && !sameLabel(title, series));
  return {
    label: "Next at Gwenda",
    name: ownTitle ? title : artist,
  };
}

/** Named night or special guest for the home-row teaser. */
export function upcomingEventTeaser(identity) {
  if (!identity) return null;
  if (identity.title) {
    return { date: identity.date || "", name: identity.title };
  }
  if (identity.artist) {
    return {
      date: identity.date || "",
      name: `Special guest · ${identity.artist}`,
    };
  }
  return null;
}

/** Home-row line: Next · Sat 24 Oct · night name. */
export function upcomingEventLine(identity) {
  const teaser = upcomingEventTeaser(identity);
  if (!teaser) return "";
  const when = formatShortEventDate(teaser.date);
  return when ? `Next · ${when} · ${teaser.name}` : `Next · ${teaser.name}`;
}

function addDaysIso(isoDate, days) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || "").trim());
  if (!match) return "";
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setDate(date.getDate() + days);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

/** Monday–Sunday week that contains `now`. */
export function isCurrentWeek(isoDate, now = new Date()) {
  const iso = String(isoDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const today = todayIso(now);
  const [year, month, day] = today.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const mondayOffset = (date.getDay() + 6) % 7;
  const start = addDaysIso(today, -mondayOffset);
  const end = addDaysIso(start, 6);
  return iso >= start && iso <= end;
}

function teaserForNight(night, seriesTitle) {
  return upcomingEventTeaser(nextNightIdentity([night], seriesTitle, 0));
}

/**
 * Diary lines for a What's on series card.
 * Scheduled series name the pictured night (hosts + date).
 * A night in the current week is "This week"; the one after is "Next".
 */
export function seriesDiary(nights, seriesTitle, { now = new Date(), regular = false } = {}) {
  const ordered = (Array.isArray(nights) ? nights : [])
    .slice()
    .sort(compareNights);
  const teasers = ordered.map((night) => teaserForNight(night, seriesTitle));
  const empty = {
    hostName: "",
    hostDate: "",
    hostThisWeek: false,
    thisWeekName: "",
    thisWeekDate: "",
    upcomingName: "",
    upcomingDate: "",
  };

  if (!regular) {
    const host = teasers[0] || null;
    const later = teasers.slice(1).find(Boolean) || null;
    return {
      ...empty,
      hostName: host?.name || "",
      hostDate: host?.date || "",
      hostThisWeek: Boolean(host && isCurrentWeek(host.date, now)),
      upcomingName: later?.name || "",
      upcomingDate: later?.date || "",
    };
  }

  const named = teasers.filter(Boolean);
  const first = named[0] || null;
  if (!first) return empty;
  if (isCurrentWeek(first.date, now)) {
    const next = named[1] || null;
    return {
      ...empty,
      thisWeekName: first.name,
      thisWeekDate: first.date,
      upcomingName: next?.name || "",
      upcomingDate: next?.date || "",
    };
  }
  return {
    ...empty,
    upcomingName: first.name,
    upcomingDate: first.date,
  };
}

/** First upcoming night with its own guest artist. */
export function nextSpecialGuest(nights) {
  const identity = nextNightIdentity(nights);
  if (!identity?.artist) return null;
  return { artist: identity.artist, date: identity.date };
}

function seriesDefaultHero(template, nights) {
  const templateUrl = String(template?.heroImageUrl || "").trim();
  if (templateUrl) {
    return {
      heroImageUrl: templateUrl,
      heroImage: template.heroImage || {
        url: templateUrl,
        alt: template.title || "",
        objectPosition: template.heroObjectPosition || undefined,
      },
      heroImageAlt: template.title || "",
      heroFromDate: "",
    };
  }
  const ordered = (Array.isArray(nights) ? nights : [])
    .slice()
    .sort(compareNights);
  for (const night of ordered) {
    const seriesUrl = String(night?.seriesHeroImageUrl || "").trim();
    if (!seriesUrl) continue;
    return {
      heroImageUrl: seriesUrl,
      heroImage: {
        url: seriesUrl,
        alt: night.seriesTitle || night.title || "",
        objectPosition: night.seriesHeroObjectPosition || undefined,
      },
      heroImageAlt: night.seriesTitle || night.title || "",
      heroFromDate: "",
    };
  }
  return {
    heroImageUrl: null,
    heroImage: null,
    heroImageAlt: "",
    heroFromDate: "",
  };
}

/**
 * What's on card: next night's flyer. Series default only if there is no next night.
 */
function pickWhatsOnCardHero(template, nights) {
  const ordered = (Array.isArray(nights) ? nights : [])
    .slice()
    .sort(compareNights);
  const next = ordered[0];
  const nextUrl = heroUrl(next);
  if (nextUrl) {
    const caption = guestImageCaption(next, template?.title || "");
    return {
      heroImageUrl: nextUrl,
      heroImage: next.heroImage || {
        url: nextUrl,
        alt: next.title || template?.title || "",
        objectPosition: next.heroObjectPosition || undefined,
      },
      heroImageAlt: next.heroImage?.alt || next.title || template?.title || "",
      heroFromDate: next.date || "",
      imageCaption: caption?.label || "",
      imageCaptionName: caption?.name || "",
    };
  }
  const fallback = seriesDefaultHero(template, ordered);
  return {
    ...fallback,
    heroImageAlt: fallback.heroImageAlt || template?.title || "",
    imageCaption: "",
    imageCaptionName: "",
  };
}

function leadParagraph(description) {
  const text = String(description || "").trim();
  if (!text) return "";
  return text.split(/\n{2,}/)[0]?.trim() || text;
}

/** Card blurb: explicit short copy, else the first sentence of the full description. */
export function shortSeriesBlurb(description, { shortDescription } = {}) {
  const short = String(shortDescription || "").trim();
  if (short) return short;
  const lead = leadParagraph(description);
  if (!lead) return "";
  return lead.split(/(?<=[.!?])\s+/)[0]?.trim() || lead;
}

/** True for CMS section titles and bullet blocks (Hours, The room, lists). */
function isUtilityBlock(paragraph) {
  const text = String(paragraph || "").trim();
  if (!text) return true;
  if (/^[•\-*]/.test(text) || /\n[•\-*]\s/.test(text)) return true;
  // Short heading without sentence punctuation: "Hours", "The room"
  if (!/[.!?…]/.test(text) && text.length <= 40 && !text.includes("\n")) {
    return true;
  }
  return false;
}

/**
 * Public What's on copy: lead prose only.
 * Drops ops-style sections (Hours, The room, bullet lists).
 */
export function seriesMarketingCopy(
  description,
  { shortDescription, maxParagraphs = 2 } = {},
) {
  const short = String(shortDescription || "").trim();
  const paragraphs = String(description || "")
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  const prose = [];
  for (const paragraph of paragraphs) {
    if (isUtilityBlock(paragraph)) break;
    prose.push(paragraph);
    if (prose.length >= maxParagraphs) break;
  }

  if (!prose.length) return short;
  if (short && !prose[0].includes(short)) {
    return [short, ...prose].slice(0, maxParagraphs).join("\n\n");
  }
  return prose.slice(0, maxParagraphs).join("\n\n");
}

/**
 * Per-night copy on a series page. Thin stubs fall back to the series
 * marketing description so each event card still reads as a real night.
 */
export function nightPublicDescription(night, series = {}) {
  const own = String(night?.description || "").trim();
  // No shortDescription here: the series header already carries the tagline.
  const marketing = seriesMarketingCopy(
    series.fullDescription || series.description || "",
    { maxParagraphs: 2 },
  );
  if (!own) return marketing;
  if (!marketing) return own;
  if (own.length >= 80) return own;
  if (own.length < 50) {
    if (marketing.includes(own)) return marketing;
    if (own.length >= 24 && /[.!]/.test(own)) {
      const lead = marketing.split(/\n{2,}/)[0] || marketing;
      return `${own}\n\n${lead}`;
    }
    return marketing;
  }
  return own;
}

function weekdayRankFromIso(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || "").trim());
  if (!match) return WEEKDAY_NAMES.length;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  if (Number.isNaN(date.getTime())) return WEEKDAY_NAMES.length;
  return (date.getDay() + 6) % 7; // Monday = 0
}

/** Dominant weekday across nights (open series like Gwenda Nights → Saturday). */
export function seriesWeekdayRankFromNights(nights) {
  const counts = new Map();
  for (const night of Array.isArray(nights) ? nights : []) {
    const rank = weekdayRankFromIso(night?.date);
    if (rank >= WEEKDAY_NAMES.length) continue;
    counts.set(rank, (counts.get(rank) || 0) + 1);
  }
  let best = WEEKDAY_NAMES.length;
  let bestCount = 0;
  for (const [rank, count] of counts) {
    if (count > bestCount || (count === bestCount && rank < best)) {
      best = rank;
      bestCount = count;
    }
  }
  return best;
}

/** Monday is 0. Daily residencies come first. */
export function eventWeekdayRank(recurrence) {
  const text = String(recurrence || "").toLowerCase();
  if (/\bevery day\b/.test(text)) return -1;
  let rank = WEEKDAY_NAMES.length;
  for (let index = 0; index < WEEKDAY_NAMES.length; index += 1) {
    if (text.includes(WEEKDAY_NAMES[index])) rank = Math.min(rank, index);
  }
  return rank;
}

/** Label for a weekday slot, e.g. Saturdays. Not "Every …". */
export function weekdaySlotLabel(rank) {
  if (rank < 0 || rank >= WEEKDAY_NAMES.length) return "";
  const name = WEEKDAY_NAMES[rank];
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}s`;
}

/** Repeating auto-schedule, not "is this a series". */
export function isRecurringSeries(seriesOrRecurrence) {
  if (seriesOrRecurrence && typeof seriesOrRecurrence === "object") {
    if (seriesOrRecurrence.schedule === "repeating") return true;
    if (seriesOrRecurrence.schedule === "manual") return false;
  }
  const label =
    typeof seriesOrRecurrence === "string"
      ? seriesOrRecurrence
      : String(seriesOrRecurrence?.recurrence || "").trim();
  return Boolean(label) && !/^scheduled$/i.test(label);
}

/** Manual series list each scheduled night as its own card under the series. */
export function seriesUsesRichDetail(series) {
  return !isRecurringSeries(series);
}

function groupUpcomingBySeries(events, now = new Date()) {
  const today = todayIso(now);
  const upcoming = (Array.isArray(events) ? events : [])
    .filter((event) => event?.date && event.date >= today)
    .slice()
    .sort(compareNights);

  const groups = new Map();
  for (const event of upcoming) {
    const key = seriesKey(event);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  return groups;
}

function asSeriesTemplate(record) {
  if (!record) return null;
  const seriesId = String(
    record.seriesId || record.slug || record.id || "",
  ).trim();
  if (!seriesId) return null;
  const repeating = isRecurringSeries(record);
  return {
    seriesId,
    title: String(record.title || record.seriesTitle || "").trim(),
    description: String(
      record.description || record.fullDescription || "",
    ).trim(),
    shortDescription: String(record.shortDescription || "").trim(),
    recurrence: String(record.recurrence || "").trim(),
    schedule: repeating ? "repeating" : "manual",
    offer: String(record.offer || "").trim(),
    nightSchedule: Array.isArray(record.nightSchedule)
      ? record.nightSchedule
          .map((slot) => ({
            label: String(slot?.label || "").trim(),
            startTime: String(slot?.startTime || "").trim(),
            endTime: String(slot?.endTime || "").trim(),
          }))
          .filter((slot) => slot.label)
      : [],
    heroImageUrl: record.heroImageUrl || record.heroImage?.url || null,
    heroImage: record.heroImage || null,
    heroObjectPosition:
      record.heroObjectPosition || record.heroImage?.objectPosition || "",
  };
}

function templateFromNights(seriesId, nights) {
  const first = nights[0] || {};
  return asSeriesTemplate({
    seriesId,
    title: first.seriesTitle || "",
    description: "",
    shortDescription: first.shortDescription || "",
    recurrence: first.recurrence || "",
    schedule: first.recurrence ? "repeating" : "manual",
    nightSchedule: Array.isArray(first.nightSchedule) ? first.nightSchedule : [],
    heroImageUrl: first.seriesHeroImageUrl || null,
    heroObjectPosition: first.seriesHeroObjectPosition || "",
  });
}

function summarizeSeries(template, nights) {
  const ordered = nights.slice().sort(compareNights);
  const next = ordered[0];
  const series = asSeriesTemplate(template) || templateFromNights("", ordered);
  const repeating = series.schedule === "repeating";
  const title = series.title || next?.seriesTitle || next?.title || "";
  const fullDescription = series.description || "";
  const shortDescription = series.shortDescription || "";
  const weekdayRank = repeating
    ? eventWeekdayRank(series.recurrence)
    : seriesWeekdayRankFromNights(ordered);
  const scheduleLabel = repeating
    ? series.recurrence
    : weekdaySlotLabel(weekdayRank) || "Scheduled";
  const cardHero = seriesDefaultHero(series, ordered);
  return {
    seriesId: series.seriesId,
    title,
    seriesTitle: title,
    description: shortSeriesBlurb(fullDescription, { shortDescription }),
    fullDescription,
    shortDescription,
    artist: "",
    offer: series.offer || "",
    nightSchedule: Array.isArray(series.nightSchedule)
      ? series.nightSchedule
      : [],
    recurrence: series.recurrence,
    schedule: series.schedule,
    scheduleLabel,
    weekdayRank,
    nextDate: next?.date || "",
    startTime: next?.startTime || "",
    endTime: next?.endTime || "",
    time: next?.time || "",
    nightCount: ordered.length,
    heroImageUrl: cardHero.heroImageUrl,
    heroImage: cardHero.heroImage,
    heroImageAlt: cardHero.heroImageAlt || title,
    heroFromDate: cardHero.heroFromDate,
    nights: ordered,
    regular: repeating,
    richDetail: !repeating,
    href: `/whats-on/${encodeURIComponent(series.seriesId)}`,
  };
}

function compareSeries(a, b) {
  const aRank =
    typeof a.weekdayRank === "number"
      ? a.weekdayRank
      : eventWeekdayRank(a.recurrence);
  const bRank =
    typeof b.weekdayRank === "number"
      ? b.weekdayRank
      : eventWeekdayRank(b.recurrence);
  return aRank - bRank || a.title.localeCompare(b.title);
}

function resolveTemplates(seriesRecords, groups) {
  const templates = new Map();
  for (const record of seriesRecords || []) {
    const template = asSeriesTemplate(record);
    if (template) templates.set(template.seriesId, template);
  }
  for (const [seriesId, nights] of groups) {
    if (templates.has(seriesId)) continue;
    const fallback = templateFromNights(seriesId, nights);
    if (fallback) templates.set(seriesId, fallback);
  }
  return templates;
}

/**
 * @param {Array} events
 * @param {{ now?: Date, series?: Array }} [options]
 */
export function buildSeriesList(
  events,
  { now = new Date(), series = [] } = {},
) {
  const groups = groupUpcomingBySeries(events, now);
  const templates = resolveTemplates(series, groups);
  const rows = [];
  for (const [seriesId, nights] of groups) {
    const template = templates.get(seriesId);
    if (!template) continue;
    const { nights: _nights, ...summary } = summarizeSeries(template, nights);
    rows.push({ ...summary, nights });
  }
  return rows.sort(compareSeries);
}

/**
 * Home diary: one basic, clickable card per series.
 *
 * @param {Array} events
 * @param {{ now?: Date, series?: Array }} [options]
 */
export function buildWhatsOnStack(
  events,
  { now = new Date(), series = [] } = {},
) {
  return buildSeriesList(events, { now, series }).map((row) => {
    const cardHero = pickWhatsOnCardHero(row, row.nights);
    // Manual series already feature night[0] (flyer + date). The teaser
    // is the night after that. Repeating residencies tease the imminent night.
    const identity = nextNightIdentity(
      row.nights,
      row.title,
      row.regular ? 0 : 1,
    );
    const diary = seriesDiary(row.nights, row.title, {
      now,
      regular: row.regular,
    });
    return {
      id: row.seriesId,
      seriesId: row.seriesId,
      title: row.title,
      seriesTitle: row.seriesTitle,
      description: seriesMarketingCopy(row.fullDescription || row.description, {
        shortDescription: row.shortDescription,
        maxParagraphs: 3,
      }),
      artist: identity?.artist || "",
      upcoming: upcomingEventLine(identity),
      hostName: diary.hostName,
      hostDate: diary.hostDate,
      hostThisWeek: diary.hostThisWeek,
      thisWeekDate: diary.thisWeekDate,
      thisWeekName: diary.thisWeekName,
      upcomingDate: diary.upcomingDate,
      upcomingName: diary.upcomingName,
      offer: row.offer,
      nightSchedule: row.nightSchedule || [],
      date: row.nextDate,
      startTime: row.startTime,
      endTime: row.endTime,
      time: row.time,
      recurrence: row.recurrence,
      schedule: row.schedule,
      scheduleLabel: row.scheduleLabel,
      weekdayRank: row.weekdayRank,
      heroImageUrl: cardHero.heroImageUrl,
      heroImage: cardHero.heroImage,
      imageCaption: cardHero.imageCaption || "",
      imageCaptionName: cardHero.imageCaptionName || "",
      regular: row.regular,
      richDetail: row.richDetail,
      href: row.href,
      nightCount: row.nightCount,
      dates: row.nights.map((night) => night.date).slice(0, 3),
      guestEditions: [],
    };
  });
}

/**
 * @param {Array} events
 * @param {{ now?: Date, after?: string, afterId?: string, limit?: number|string, series?: Array }} [options]
 */
export function buildWhatsOnHome(
  events,
  { now = new Date(), after = "", afterId = "", limit, series = [] } = {},
) {
  const stack = buildWhatsOnStack(events, { now, series });
  const size = Math.min(24, Math.max(1, Math.floor(Number(limit) || 24)));
  let start = 0;
  if (after || afterId) {
    const cursorId = String(afterId || after || "");
    const index = stack.findIndex(
      (row) => String(row.id) === cursorId || String(row.seriesId) === cursorId,
    );
    start = index >= 0 ? index + 1 : 0;
  }
  const page = stack.slice(start, start + size);
  const last = page[page.length - 1];
  const hasMore = start + page.length < stack.length;
  return {
    series: page,
    nights: page,
    next:
      hasMore && last ? { after: last.date, afterId: String(last.id) } : null,
  };
}

/**
 * @param {Array} events
 * @param {string} seriesId
 * @param {{ now?: Date, after?: string, afterId?: string, limit?: number|string, series?: Array }} [options]
 */
export function buildSeriesDetail(
  events,
  seriesId,
  { now = new Date(), after = "", afterId = "", limit, series = [] } = {},
) {
  const key = String(seriesId || "").trim();
  if (!key) return null;

  const nights = (groupUpcomingBySeries(events, now).get(key) || [])
    .slice()
    .sort(compareNights)
    .map((event) => ({
      ...event,
      seriesId: key,
      heroImageUrl: heroUrl(event),
    }));

  if (!nights.length) return null;

  const templates = resolveTemplates(series, new Map([[key, nights]]));
  const template = templates.get(key);
  if (!template) return null;

  const summary = summarizeSeries(template, nights);
  const { nights: _grouped, ...seriesSummary } = summary;
  const repeating = seriesSummary.schedule === "repeating";
  const richDetail = !repeating;

  const detailNights = repeating ? nights.slice(0, 2) : nights;
  const page = repeating
    ? { events: detailNights, next: null }
    : pageEventFeed(nights, { after, afterId, limit, now });

  const seriesHero = seriesSummary.heroImageUrl;
  const seriesMarketing = seriesMarketingCopy(
    seriesSummary.fullDescription || seriesSummary.description,
    {
      shortDescription: seriesSummary.shortDescription,
      maxParagraphs: 3,
    },
  );
  const pageNights = page.events.map((night) => {
    const caption = guestImageCaption(night, seriesSummary.title);
    return {
      ...night,
      heroImageUrl: heroUrl(night) || seriesHero,
      imageCaption: caption?.label || "",
      imageCaptionName: caption?.name || "",
      description: nightPublicDescription(night, {
        ...seriesSummary,
        description: seriesSummary.fullDescription || seriesSummary.description,
      }),
    };
  });

  const nextNight = pageNights[0] || null;
  const featuredGuest =
    nextNight?.isSpecialEdition && (nextNight.artist || nextNight.title)
      ? nextNight
      : null;

  return {
    ...seriesSummary,
    description: seriesMarketing,
    nights: pageNights,
    next: page.next,
    richDetail,
    featuredGuest,
    upcomingDates: pageNights.map((night) => ({
      date: night.date,
      artist: night.artist || "",
      title: night.title || "",
      isSpecialEdition: Boolean(night.isSpecialEdition),
      startTime: night.startTime || "",
      endTime: night.endTime || "",
      time: night.time || "",
      offer: night.offer || "",
      heroImageUrl: night.heroImageUrl,
    })),
  };
}

/** Parse `{series}-{YYYY-MM-DD}` occurrence slugs used by Sanity. */
export function parseOccurrenceSlug(slug) {
  const raw = String(slug || "").trim();
  const match = /^(.+)-(\d{4}-\d{2}-\d{2})$/.exec(raw);
  if (!match) return null;
  return { seriesId: match[1], date: match[2] };
}
