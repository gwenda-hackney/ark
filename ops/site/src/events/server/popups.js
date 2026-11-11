/**
 * Pop-up kitchens: the event series whose category is "popup"
 * (event-model.js EVENT_CATEGORIES).
 *
 * For the menu: a chapter of the menu can belong to one (menu-store.js), and
 * its Sanity section then refers to the series' document (publish-sync.js).
 * This is all the menu knows of events; popups.menu.contract.test.js holds it
 * to what the menu relies on.
 *
 * For the website's scheduler: each one's last night, so the site is rebuilt
 * the morning after it (site-pending.js); popups.website.contract.test.js.
 */
import { sanitySeriesId, seriesSlug } from "./event-content.js";
import { eventCategory } from "./event-model.js";
import { eventRepository } from "./event-repository.js";

/**
 * Every pop-up kitchen that isn't deleted, by name.
 * @returns {Promise<{ id: string, name: string, slug: string, sanityId: string }[]>}
 *   `sanityId`: the series' Sanity document, there once the series was published
 */
export async function listPopupSeries(env) {
  return (await eventRepository(env).listEvents())
    .filter((record) => eventCategory(record.category) === "popup" && !record.deletedAt)
    .map((record) => {
      const slug = record.slug || seriesSlug(record.name);
      return { id: String(record.id), name: String(record.name || "").trim(), slug, sanityId: sanitySeriesId(slug) };
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
