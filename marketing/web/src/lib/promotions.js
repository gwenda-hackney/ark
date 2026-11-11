/**
 * Promotions (#240): a standing deal such as the cocktail hour is entered in
 * ops as a series, with a night for every day it runs. What's on shows nights
 * only; a promotion shows once, on a card marked "Deal", with the days and
 * hours it runs. Ops says what each series is (`category`: a promotion, a pop-up
 * kitchen, or nothing for a night).
 */

const DAYS = [
  ["monday", "Mon"],
  ["tuesday", "Tue"],
  ["wednesday", "Wed"],
  ["thursday", "Thu"],
  ["friday", "Fri"],
  ["saturday", "Sat"],
  ["sunday", "Sun"],
];

/** "promotion", "popup", or "event" for anything else (a night). */
export function categoryOf(row) {
  const raw = String(row?.category || "")
    .trim()
    .toLowerCase();
  return raw === "promotion" || raw === "popup" ? raw : "event";
}

/**
 * Each night with its series' category: a night follows its series, so one
 * written before ops knew about categories is still kept out of What's on.
 */
export function withSeriesCategory(occurrences, series) {
  const bySeries = new Map(
    (series || []).map((row) => [row.seriesId, categoryOf(row)]),
  );
  return (occurrences || []).map((night) => {
    const own = categoryOf(night);
    const category =
      own !== "event" ? own : bySeries.get(night.seriesId) || "event";
    return { ...night, category };
  });
}

/** What's on: nights only, no promotions and no pop-up kitchens. */
export function nightsOnly(occurrences) {
  return (occurrences || []).filter((night) => categoryOf(night) === "event");
}

/**
 * The days a series runs, short, from the line ops writes ("Every Wednesday
 * and Thursday and Friday"): "Wed to Fri" for a run of three or more,
 * "Fri and Sat" for two, "Mon, Wed and Fri" for a scatter, "Fridays" for
 * one, "Every day" for all seven. "" when it names no day.
 */
export function daysLabel(recurrence) {
  const text = String(recurrence || "").toLowerCase();
  if (/\bevery\s+day\b|\bdaily\b/.test(text)) return "Every day";
  const on = DAYS.map(([name]) => new RegExp(`\\b${name}s?\\b`).test(text));
  const days = DAYS.map(([, short]) => short).filter((_, index) => on[index]);
  if (!days.length) return "";
  if (days.length === 7) return "Every day";
  if (days.length === 1) {
    const [name] = DAYS[on.indexOf(true)];
    return `${name[0].toUpperCase()}${name.slice(1)}s`;
  }
  // One unbroken run, which may go round the weekend (Fri to Mon).
  const gaps = on
    .map((is, index) => (is && !on[(index + 1) % 7] ? index : -1))
    .filter((index) => index >= 0);
  if (gaps.length === 1 && days.length > 2) {
    const last = gaps[0];
    const first = (last - days.length + 1 + 7) % 7;
    return `${DAYS[first][1]} to ${DAYS[last][1]}`;
  }
  return `${days.slice(0, -1).join(", ")} and ${days.at(-1)}`;
}

/**
 * A series' next night, today or later; undefined when it has none left.
 * A series with one is running now (a deal, a pop-up kitchen).
 */
export function nextNight(seriesId, occurrences, todayIso) {
  return upcomingNights(seriesId, occurrences, todayIso)[0];
}

/** A series' nights from today on, in date order. */
export function upcomingNights(seriesId, occurrences, todayIso) {
  return (occurrences || [])
    .filter((night) => night.seriesId === seriesId)
    .filter((night) => String(night.date) >= todayIso)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/** A series' picture for a card: its own, else its next night's. */
export function seriesPhoto(row, next) {
  return {
    photo:
      row?.heroImageUrl ||
      next?.seriesHeroImageUrl ||
      next?.heroImage?.url ||
      "",
    photoPosition:
      row?.heroObjectPosition || next?.seriesHeroObjectPosition || "",
  };
}

/** The offer and the card line, without saying the same thing twice. */
function dealLines(offer, note) {
  const said = (text) => text.toLowerCase().replace(/[^a-z0-9%]+/g, " ");
  if (offer && note && said(note).includes(said(offer).trim())) {
    return { offer: "", note };
  }
  return { offer, note };
}

/**
 * The promotions running now, each once, in the order they next come round:
 * a promotion series with a night today or later. The hours and the offer
 * are its next night's.
 *
 * @param {Array<object>} series the catalog's series
 * @param {Array<object>} occurrences every night, in date order
 * @param {string} todayIso YYYY-MM-DD
 */
export function promotionDeals(series, occurrences, todayIso) {
  const deals = [];
  for (const row of series || []) {
    if (categoryOf(row) !== "promotion") continue;
    const next = nextNight(row.seriesId, occurrences, todayIso);
    if (!next) continue;
    deals.push({
      id: row.seriesId,
      title: row.title,
      days: daysLabel(row.recurrence || next.recurrence),
      startTime: next.startTime || "",
      endTime: next.endTime || "",
      time: next.time || "",
      ...dealLines(
        String(next.offer || "").trim(),
        String(row.shortDescription || next.shortDescription || "").trim(),
      ),
      ...seriesPhoto(row, next),
      next: next.date,
      href: `/whats-on/${encodeURIComponent(row.seriesId)}`,
    });
  }
  return deals.sort(
    (a, b) => a.next.localeCompare(b.next) || a.title.localeCompare(b.title),
  );
}
