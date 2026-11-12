/**
 * Each event's gallery (its Images tab, #183), for the venue's Gallery page
 * (#291): under the venue's own photos it shows the ones from events, as the
 * website's Photos page does, read-only; they're managed on each event.
 *
 * This is all the venue knows of events;
 * event-galleries.venue.contract.test.js holds it to what the venue relies on.
 */
import { sanityProjectId } from "../../platform/sanity.js";
import { eventImage } from "./event-model.js";
import { eventRepository } from "./event-repository.js";

/**
 * Every event that isn't deleted and has photos, by name. Each photo as ops
 * shows it, newest first: its key, its Sanity asset, its address on the
 * Sanity CDN and its size (both from the asset), and when it was added.
 *
 * @returns {Promise<Array<{ id: string, name: string, photos: Array<{
 *   key: string, asset: string, url: string, width: number, height: number, added: string,
 * }> }>>}
 */
export async function listEventGalleries(env) {
  const options = { projectId: sanityProjectId(env) };
  return (await eventRepository(env).listEvents())
    .filter((record) => String(record.name || "").trim() && !record.deletedAt)
    .map((record) => ({
      id: String(record.id),
      name: String(record.name).trim(),
      photos: (record.gallery || []).flatMap((photo) => {
        const image = eventImage({ asset: photo?.asset }, options);
        if (!image) return [];
        const { url, width, height } = image;
        return [{ key: String(photo.key), asset: image.asset, url, width, height, added: String(photo.added || "") }];
      }),
    }))
    .filter((event) => event.photos.length)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}
