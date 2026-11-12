/**
 * The venue's details on the website (#240): one Sanity document,
 * `venueDetails`, that the website reads with one query
 * (marketing/web/src/lib/venue-details.js VENUE_DETAILS_QUERY and
 * readVenueDetails: its opening hours, the party facts beside them, and the
 * venue's gallery of photos, #291), and putting it there. A save of any of
 * them puts the whole document there, so they never disagree about what ops
 * holds.
 *
 * The gallery is part of this document, not one of its own, as the party
 * facts are: it is the venue's, ops alone writes it, and one document keeps
 * one way onto the website (this one), one "on the website" state, and one
 * read-only document in Studio. Its photos are the Sanity image assets ops
 * uploaded (#183), referenced in the gallery's order; the website reads their
 * sizes from the assets' metadata.
 *
 * Saving writes the draft, which the preview site shows at once; then, as
 * for a saved event, the website itself unless `website.auto_update` is
 * "off" (website/server/auto-update.js), in which case it waits for Update
 * website on the Website page. Built pages follow on the next automatic
 * website update (website/server/site-pending.js), as they do for events.
 *
 * The document is ops' own: nothing else writes it, and Studio only shows
 * it (marketing/studio/schemaTypes/venueDetails.ts).
 */
import { draftId, sanityMutate, sanityQuery } from "../../platform/sanity.js";
import { partyFacts } from "../parties-model.js";
import { websiteFollowsSaves } from "../../website/server/auto-update.js";
import { publishRelease, stableStringify } from "../../website/server/release.js";

export const VENUE_DOC_ID = "venueDetails";
export const VENUE_DOC_TYPE = "venueDetails";

/**
 * @typedef {{
 *   openingHours: import("../hours-model.js").OpeningDay[] | null,
 *   parties?: import("../parties-model.js").PartyFacts | null,
 *   gallery?: import("../gallery-model.js").GalleryPhoto[] | null,
 * }} VenueDetails
 */

/**
 * The gallery as the website reads it: each photo a Sanity image, in the
 * gallery's order, its description the alt text, `menu` the board on home it
 * may be pinned up on (left out for none); `_key` is the photo's key, so the
 * same gallery always makes the same array. Null when there are no photos.
 * @param {import("../gallery-model.js").GalleryPhoto[] | null | undefined} gallery
 */
export function galleryOnWebsite(gallery) {
  if (!gallery?.length) return null;
  return gallery.map((photo) => ({
    _type: "image",
    _key: photo.key,
    alt: photo.description || "",
    ...(photo.menu ? { menu: photo.menu } : {}),
    asset: { _type: "reference", _ref: photo.asset },
  }));
}

/**
 * The party facts as the website reads them: only the ones filled in
 * (`standing`, `seated`: whole numbers; `included`: one thing a line;
 * `replyWithin`: "a day"); null when none is, so the website says nothing.
 * @param {import("../parties-model.js").PartyFacts | null | undefined} parties
 */
export function partiesOnWebsite(parties) {
  if (!parties) return null;
  const facts = partyFacts(parties);
  const out = {
    ...(facts.standing != null ? { standing: facts.standing } : {}),
    ...(facts.seated != null ? { seated: facts.seated } : {}),
    ...(facts.included ? { included: facts.included } : {}),
    ...(facts.replyWithin ? { replyWithin: facts.replyWithin } : {}),
  };
  return Object.keys(out).length ? out : null;
}

/**
 * The details as the website reads them. Opening hours: seven
 * `{ day, closed, opens, closes }`, Monday first; a closed day has no
 * times; `_key` is the day, so the same hours always make the same array.
 * Hours never saved are left out, so the website says none. Party facts:
 * partiesOnWebsite, left out when there are none. Gallery:
 * galleryOnWebsite, left out when it has no photos.
 * @param {VenueDetails} details
 */
export function venueDocument({ openingHours, parties = null, gallery = null }) {
  const partyFields = partiesOnWebsite(parties);
  const photos = galleryOnWebsite(gallery);
  return {
    _id: VENUE_DOC_ID,
    _type: VENUE_DOC_TYPE,
    ...(openingHours
      ? {
          openingHours: openingHours.map((day) =>
            day.closed
              ? { _key: day.day, day: day.day, closed: true }
              : { _key: day.day, day: day.day, closed: false, opens: day.opens, closes: day.closes },
          ),
        }
      : {}),
    ...(partyFields ? { parties: partyFields } : {}),
    ...(photos ? { gallery: photos } : {}),
  };
}

/** The content of the document, without its id, type or Sanity's own fields. */
function content(doc) {
  if (!doc) return null;
  const { _id, _type, _rev, _createdAt, _updatedAt, _originalId, ...rest } = doc;
  return stableStringify(rest);
}

/**
 * Where the details stand: "live" (the website shows them), "preview" (only
 * the preview does: waiting for Update website), "behind" (the website shows
 * something else) or "none" (the website has none yet).
 * @param {VenueDetails} details
 * @returns {Promise<"live" | "preview" | "behind" | "none">}
 */
export async function venueOnWebsite(env, details, { query = sanityQuery } = {}) {
  const docs = (await query(env, "raw", "*[_id in $ids]", { ids: [VENUE_DOC_ID, draftId(VENUE_DOC_ID)] })) || [];
  const want = content(venueDocument(details));
  const published = docs.find((doc) => doc._id === VENUE_DOC_ID);
  const draft = docs.find((doc) => doc._id === draftId(VENUE_DOC_ID));
  if (published && content(published) === want) return "live";
  if (draft && content(draft) === want) return "preview";
  return published ? "behind" : "none";
}

/**
 * Put the details on the preview, then on the website unless the setting
 * says to wait. `published` says which happened.
 * @param {VenueDetails} details
 * @returns {Promise<{ published: boolean, warnings: string[] }>}
 */
export async function putVenueOnWebsite(
  env,
  details,
  { mutate = sanityMutate, publish = publishRelease, followsSaves = websiteFollowsSaves } = {},
) {
  await mutate(env, [{ createOrReplace: venueDocument(details) }]);
  if (!(await followsSaves(env))) return { published: false, warnings: [] };
  const result = await publish(env, { ids: [VENUE_DOC_ID] });
  return { published: true, warnings: result?.warnings || [] };
}
