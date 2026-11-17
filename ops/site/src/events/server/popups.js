/**
 * Pop-up kitchens: the event series whose category is "popup"
 * (event-model.js EVENT_CATEGORIES).
 *
 * For the menu: a menu can belong to one (#305), starting from its dates and
 * cooking days, and a chapter's Sanity section then refers to the series'
 * document (publish-sync.js). This is all the menu knows of events;
 * popups.menu.contract.test.js holds it to what the menu relies on.
 *
 * For the website's scheduler: each one's last night, so the site is rebuilt
 * the morning after it (site-pending.js); popups.website.contract.test.js.
 */
import { WEEKDAYS, expandSeriesOccurrenceDates, normalizeWeekdays, parseIsoDate } from "../event-recurrence.js";
import { sanitySeriesId, seriesSlug } from "./event-content.js";
import { eventCategory } from "./event-model.js";
import { eventRepository } from "./event-repository.js";

/** A run with no end date: it repeats, and its nights keep rolling forward. */
function rolling(record) {
  return ["day", "week", "month"].includes(String(record.repeatUnit || "").toLowerCase()) && !record.endsOn;
}

/**
 * When a pop-up kitchen cooks: from its first night to its last ("" when
 * its run has no end date), and on which weekdays, Monday first ([] when it
 * has no nights yet).
 */
function cookingRun(record, today) {
  const nights = expandSeriesOccurrenceDates(record, { today });
  const cooks = new Set(nights.map((date) => WEEKDAYS[(parseIsoDate(date).getUTCDay() + 6) % 7]));
  const days = nights.length ? WEEKDAYS.filter((day) => cooks.has(day)) : normalizeWeekdays(record.weekdays);
  return {
    startsOn: nights[0] || String(record.startsOn || ""),
    endsOn: rolling(record) ? "" : nights.at(-1) || String(record.endsOn || ""),
    days,
  };
}

/**
 * Every pop-up kitchen that isn't deleted, by name, with when it cooks.
 * @param {{ today?: string }} [options]  the day a rolling run's nights count from
 * @returns {Promise<{ id: string, name: string, slug: string, sanityId: string,
 *   startsOn: string, endsOn: string, days: string[] }[]>}
 *   `sanityId`: the series' Sanity document, there once the series was published;
 *   `startsOn` and `endsOn`: its first and last nights, YYYY-MM-DD ("" for a
 *   run with no end date); `days`: the weekdays it cooks ("mon" … "sun")
 */
export async function listPopupSeries(env, { today } = {}) {
  return (await eventRepository(env).listEvents())
    .filter((record) => eventCategory(record.category) === "popup" && !record.deletedAt)
    .map((record) => {
      const slug = record.slug || seriesSlug(record.name);
      return {
        id: String(record.id),
        name: String(record.name || "").trim(),
        slug,
        sanityId: sanitySeriesId(slug),
        ...cookingRun(record, today),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/**
 * Each pop-up kitchen that isn't deleted and has nights, with its last one.
 * The website shows a pop-up until then, decided when it is built.
 * @returns {Promise<{ id: string, name: string, lastNight: string }[]>} `lastNight`: YYYY-MM-DD
 */
export async function popupLastNights(env) {
  const out = [];
  for (const { event, nights } of await eventRepository(env).listEventsWithNights()) {
    if (eventCategory(event.category) !== "popup" || event.deletedAt) continue;
    const lastNight = nights.reduce((last, night) => {
      const date = String(night.date || "");
      return date > last ? date : last;
    }, "");
    if (lastNight) out.push({ id: String(event.id), name: String(event.name || "").trim(), lastNight });
  }
  return out;
}
