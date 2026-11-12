/**
 * VenueRepository (#240): the only way ops reads or writes the venue's
 * details: the opening hours, the party facts (how many fit, what's
 * included, how fast we reply), each with its own pair of methods, and the
 * venue's gallery of photos (#291). It speaks in the domain (hours-model.js,
 * parties-model.js, gallery-model.js), never in tables or columns. Every
 * adapter implements all of it, and venue-repository.contract.test.js holds
 * them to the same behaviour:
 *
 *   getOpeningHours()          { days, updatedAt, updatedBy }: seven days, Monday
 *                              first; null when the week was never saved
 *   saveOpeningHours(week)     replaces the whole week ({ days, updatedAt, updatedBy },
 *                              days already checked: hours-model.js assertValidWeek)
 *                              and returns it as getOpeningHours() would
 *   getParties()               { standing, seated, included, replyWithin, updatedAt,
 *                              updatedBy }: a blank capacity is null, blank text "";
 *                              null when they were never saved
 *   saveParties(facts)         replaces all of them (facts already checked:
 *                              parties-model.js assertValidParties, plus updatedAt,
 *                              updatedBy) and returns them as getParties() would
 *   listGallery()              GalleryPhoto[] in the gallery's order, first first;
 *                              [] when there are none
 *   addGalleryPhotos(photos)   puts them first, in the order given (photos already
 *                              clean: gallery-model.js galleryPhoto); one whose asset
 *                              the gallery already has isn't added again. Returns
 *                              listGallery()
 *   updateGalleryPhoto(key, changes)
 *                              sets `description` and/or `menu` (already checked:
 *                              assertValidPhotoChanges); returns the photo, or null
 *                              when the gallery hasn't got it
 *   orderGallery(keys)         puts the photos in this order (every key once, already
 *                              checked: assertWholeOrder); returns listGallery()
 *   removeGalleryPhoto(key)    takes it out; no such photo is no change. Returns
 *                              listGallery()
 *   exportAll()                { openingHours: [...], parties: [...], gallery: [...] }
 *                              with who and when, for a copy
 *   importAll(snapshot)        replace everything with a copy's
 *
 * Born on D1: there is no Baserow adapter.
 */
import { databaseFor } from "../../../../../shared/d1-env.js";
import { d1VenueRepository } from "./adapters/d1-venue.js";

/** The repository for this runtime. Tests and migrations may hand one in as env.venueRepository. */
export function venueRepository(env) {
  return env?.venueRepository || d1VenueRepository(databaseFor(env, "ops"));
}
