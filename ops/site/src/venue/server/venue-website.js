/**
 * The venue's details on the website (#240): one Sanity document,
 * `venueDetails`, that the website reads (its opening hours:
 * marketing/web/src/lib/opening-hours.js OPENING_HOURS_QUERY and readWeek),
 * and putting it there. The party facts join this document next, beside
 * `openingHours`.
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
import { websiteFollowsSaves } from "../../website/server/auto-update.js";
import { publishRelease, stableStringify } from "../../website/server/release.js";

export const VENUE_DOC_ID = "venueDetails";
export const VENUE_DOC_TYPE = "venueDetails";

/** @typedef {{ openingHours: import("../hours-model.js").OpeningDay[] | null }} VenueDetails */

/**
 * The details as the website reads them. Opening hours: seven
 * `{ day, closed, opens, closes }`, Monday first; a closed day has no
 * times; `_key` is the day, so the same hours always make the same array.
 * Hours never saved are left out, so the website says none.
 * @param {VenueDetails} details
 */
export function venueDocument({ openingHours }) {
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
