/**
 * Wall artists, as ops keeps them: one current guest, one next, any number
 * of previous. Ops edits them (ops/site/src/artists/server/artist-store.js);
 * the website reads them with listArtists.
 *
 * Storage is behind the ArtistRepository (shared/artists/artist-repository.js):
 * Baserow's Gwenda Ops database until the move to D1 (#127). Their photos
 * live in Sanity (#183) and both ops and the website show them from
 * cdn.sanity.io; photos still kept as Baserow files show until the backfill
 * moves them.
 */
import { artistRepository } from "./artists/artist-repository.js";
import { artistImageProject, artistView, orderArtists } from "./artists/artist-model.js";

export {
  ARTIST_SLOTS,
  artistImage,
  artistImageProject,
  artistView,
  normalizeArtistMonth,
  normalizeArtistSlot,
  orderArtists,
} from "./artists/artist-model.js";
export { artistRepository } from "./artists/artist-repository.js";

/** Artist records as shown, from the Sanity project this runtime uses. */
export function artistViews(env, records) {
  const options = { projectId: artistImageProject(env) };
  return orderArtists(records.map((record) => artistView(record, options)));
}

/** Every artist with a slot: current, then next, then previous by name. */
export async function listArtists(env) {
  return artistViews(env, await artistRepository(env).listArtists());
}
