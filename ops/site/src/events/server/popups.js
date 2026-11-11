/**
 * Pop-up kitchens, for the menu: the event series whose category is "popup"
 * (event-model.js EVENT_CATEGORIES). A chapter of the menu can belong to one
 * (menu-store.js), and its Sanity section then refers to the series'
 * document (publish-sync.js). This is all the menu knows of events;
 * popups.menu.contract.test.js holds it to what the menu relies on.
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
