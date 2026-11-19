/**
 * Seasons on the website (#353): one Sanity document, `seasons`, that home
 * reads with one query (marketing/web/src/lib/sanity/seasons.ts), holding
 * every season ops has; the website shows the ones whose days include today
 * and hides the rest in the browser, so a season comes and goes on its own
 * days without a save or a build. A save puts the whole document there, as
 * the venue's details do (venue/server/venue-website.js): the preview first,
 * then the website unless `website.auto_update` is "off".
 *
 * The document is ops' own: nothing else writes it, and Studio only shows it
 * (marketing/studio/schemaTypes/seasons.ts).
 */
import { draftId, sanityMutate, sanityQuery } from "../../platform/sanity.js";
import { websiteFollowsSaves } from "../../website/server/auto-update.js";
import { publishRelease, stableStringify } from "../../website/server/release.js";

export const SEASONS_DOC_ID = "seasons";
export const SEASONS_DOC_TYPE = "seasons";

/**
 * The seasons as the website reads them: each with its name, line, what's
 * included (an array, one a line), when it's for, its show days and its
 * picture (a Sanity image); blank fields left out. `_key` is the season's
 * id, so the same seasons always make the same document.
 * @param {import("../season-model.js").Season[]} seasons
 */
export function seasonsDocument(seasons) {
  return {
    _id: SEASONS_DOC_ID,
    _type: SEASONS_DOC_TYPE,
    items: (seasons || []).map((item) => ({
      _key: `season-${item.id}`,
      name: item.name,
      ...(item.line ? { line: item.line } : {}),
      ...(item.included ? { included: item.included.split("\n") } : {}),
      ...(item.covers ? { covers: item.covers } : {}),
      showFrom: item.showFrom,
      showUntil: item.showUntil,
      ...(item.image
        ? {
            image: {
              _type: "image",
              alt: item.image.alt || "",
              asset: { _type: "reference", _ref: item.image.asset },
            },
          }
        : {}),
    })),
  };
}

function content(doc) {
  if (!doc) return null;
  const { _id, _type, _rev, _createdAt, _updatedAt, _originalId, ...rest } = doc;
  return stableStringify(rest);
}

/**
 * Where the seasons stand: "live" (the website has them as ops does),
 * "preview" (only the preview does), "behind" (the website has something
 * else) or "none" (the website has none yet).
 * @returns {Promise<"live" | "preview" | "behind" | "none">}
 */
export async function seasonsOnWebsite(env, seasons, { query = sanityQuery } = {}) {
  const docs = (await query(env, "raw", "*[_id in $ids]", { ids: [SEASONS_DOC_ID, draftId(SEASONS_DOC_ID)] })) || [];
  const want = content(seasonsDocument(seasons));
  const published = docs.find((doc) => doc._id === SEASONS_DOC_ID);
  const draft = docs.find((doc) => doc._id === draftId(SEASONS_DOC_ID));
  if (published && content(published) === want) return "live";
  if (draft && content(draft) === want) return "preview";
  return published ? "behind" : "none";
}

/**
 * Put the seasons on the preview, then on the website unless the setting
 * says to wait. `published` says which happened.
 * @returns {Promise<{ published: boolean, warnings: string[] }>}
 */
export async function putSeasonsOnWebsite(
  env,
  seasons,
  { mutate = sanityMutate, publish = publishRelease, followsSaves = websiteFollowsSaves } = {},
) {
  await mutate(env, [{ createOrReplace: seasonsDocument(seasons) }]);
  if (!(await followsSaves(env))) return { published: false, warnings: [] };
  const result = await publish(env, { ids: [SEASONS_DOC_ID] });
  return { published: true, warnings: result?.warnings || [] };
}
