import { updateRow } from "./baserow.js";
import { flattenIngredientsForMenu } from "./menu.js";
import { loadMenuTree } from "./menu-store.js";
import {
  sanityDataset,
  sanityMutate,
  sanityQuery,
  sanityUploadImage,
} from "./sanity.js";

async function resolveSanityItemId(env, dataset, item) {
  if (item.sanityId) return item.sanityId;
  const found = await sanityQuery(
    env,
    dataset,
    `*[_type == "menuItem" && name == $name && !(_id in path("drafts.**"))][0]._id`,
    { name: item.name },
  );
  return found || null;
}

async function syncPhoto(env, dataset, item) {
  const url = item.image?.asset?.url;
  if (!url) return undefined;
  const response = await fetch(url);
  if (!response.ok) return undefined;
  const bytes = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") || "image/jpeg";
  const asset = await sanityUploadImage(env, dataset, bytes, {
    filename: `${item.name || "cocktail"}.jpg`,
    contentType,
  });
  if (!asset?._id) return undefined;
  return {
    _type: "image",
    alt: item.name,
    asset: { _type: "reference", _ref: asset._id },
  };
}

/**
 * Push guest-facing fields from Baserow ops → Sanity (marketing site CMS).
 * Recipes / method / glass stay in Baserow only.
 */
export async function syncOpsMenuToSanity(env, { target = "staging" } = {}) {
  const dataset = sanityDataset(env, target);
  const { items, tables } = await loadMenuTree(env);
  const publishable = items.filter((item) => item.onDigitalMenu !== false);

  const synced = [];
  const missing = [];

  for (const item of publishable) {
    const sanityId = await resolveSanityItemId(env, dataset, item);
    if (!sanityId) {
      missing.push(item.name);
      continue;
    }

    const description =
      item.description ||
      flattenIngredientsForMenu(item.ingredients) ||
      undefined;

    const set = {
      name: item.name,
      ...(description ? { description } : {}),
      ...(item.price ? { price: item.price } : {}),
      ...(item.notes ? { notes: item.notes } : {}),
      signature: item.signature === true,
      ...(item.abv ? { abv: item.abv } : {}),
      ...(item.volume ? { volume: item.volume } : {}),
      ...(item.producer ? { producer: item.producer } : {}),
    };

    const unset = [];
    if (!description) unset.push("description");
    if (!item.price) unset.push("price");
    if (!item.notes) unset.push("notes");
    if (!item.abv) unset.push("abv");
    if (!item.volume) unset.push("volume");
    if (!item.producer) unset.push("producer");

    try {
      const image = await syncPhoto(env, dataset, item);
      if (image) set.image = image;
    } catch {
      // Keep previous Sanity image if upload fails.
    }

    await sanityMutate(env, dataset, [
      { patch: { id: sanityId, set, ...(unset.length ? { unset } : {}) } },
    ]);

    if (!item.sanityId) {
      await updateRow(env, tables.items, item._id, { "Sanity ID": sanityId });
    }

    synced.push({ id: item._id, name: item.name, sanityId });
  }

  return { dataset, synced, missing };
}
