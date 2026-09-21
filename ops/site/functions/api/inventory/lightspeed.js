import { jsonResponse, readJsonBody, withApiHandler } from "../../_lib/http.js";
import { getConfigString, setConfigString } from "../../_lib/config-store.js";
import { assertUniqueItemName } from "../../_lib/item-key.js";
import {
  applyLightspeedMenuMatch,
  createMenuItem,
  loadMenuTree,
} from "../../_lib/menu-store.js";
import {
  DEFAULT_LIGHTSPEED_MENU,
  LIGHTSPEED_ARCHIVE_KEY,
  matchLightspeedRows,
  menuItemFromLightspeed,
  menuPatchesFromMatch,
  mergeArchiveEntries,
  parseArchiveEntries,
  parseLightspeedItemCsv,
  removeArchiveSkus,
  resolveManualLinks,
  summarizeMatch,
} from "../../_lib/lightspeed-stock.js";

function menuNameFrom(body) {
  return typeof body.menuName === "string" && body.menuName.trim()
    ? body.menuName.trim()
    : DEFAULT_LIGHTSPEED_MENU;
}

async function loadArchiveEntries(env) {
  return parseArchiveEntries(
    await getConfigString(env, LIGHTSPEED_ARCHIVE_KEY),
  );
}

async function saveArchiveEntries(env, entries) {
  await setConfigString(env, LIGHTSPEED_ARCHIVE_KEY, JSON.stringify(entries));
}

async function previewFromCsv(env, text, menuName, archiveEntries, { apply } = {}) {
  const rows = parseLightspeedItemCsv(text);
  if (!rows.length) {
    const error = new Error("No Lightspeed item rows found.");
    error.status = 400;
    throw error;
  }

  const { items } = await loadMenuTree(env);
  const match = matchLightspeedRows(items, rows);

  if (apply) {
    await applyLightspeedMenuMatch(env, menuPatchesFromMatch(match));
  }

  const nextItems = apply ? (await loadMenuTree(env)).items : items;
  const nextMatch = apply ? matchLightspeedRows(nextItems, rows) : match;
  return summarizeMatch(nextMatch, menuName, { archiveEntries });
}

export const onRequestPost = withApiHandler(async (context) => {
  const body = await readJsonBody(context.request);
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid request." }, 400);
  }

  const env = context.env;
  const menuName = menuNameFrom(body);
  const action =
    typeof body.action === "string" && body.action.trim()
      ? body.action.trim()
      : body.apply === true
        ? "save"
        : "preview";
  const text = typeof body.text === "string" ? body.text : "";

  let archiveEntries = await loadArchiveEntries(env);

  if (action === "archive") {
    archiveEntries = mergeArchiveEntries(archiveEntries, body.rows || []);
    await saveArchiveEntries(env, archiveEntries);
  } else if (action === "unarchive") {
    archiveEntries = removeArchiveSkus(archiveEntries, body.skus || []);
    await saveArchiveEntries(env, archiveEntries);
  } else if (action === "add") {
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) {
      return jsonResponse({ error: "Pick a Lightspeed item to add." }, 400);
    }
    const addedSkus = [];
    for (const item of items) {
      const payload = menuItemFromLightspeed(item);
      await createMenuItem(env, payload);
      if (payload.lightspeedSku) addedSkus.push(payload.lightspeedSku);
    }
    if (addedSkus.length) {
      archiveEntries = removeArchiveSkus(archiveEntries, addedSkus);
      await saveArchiveEntries(env, archiveEntries);
    }
  } else if (action === "link") {
    if (!text) {
      return jsonResponse({ error: "Upload the item list first." }, 400);
    }
    const rows = parseLightspeedItemCsv(text);
    const { items } = await loadMenuTree(env);
    const patches = resolveManualLinks(items, rows, body.links);
    if (!patches.length) {
      return jsonResponse(
        { error: "Pick a menu item and a Lightspeed row to match." },
        400,
      );
    }
    const names = items.map((item) => ({
      id: item._id || item.id,
      name: item.name,
    }));
    for (const patch of patches) {
      if (patch.adoptName && patch.name) {
        assertUniqueItemName(names, patch.name, {
          exceptId: patch.id,
          kind: "drink",
        });
        const hit = names.find((row) => String(row.id) === String(patch.id));
        if (hit) hit.name = patch.name;
      }
    }
    await applyLightspeedMenuMatch(env, patches);
    const linkedSkus = patches
      .map((patch) => patch.lightspeedSku)
      .filter(Boolean);
    if (linkedSkus.length) {
      archiveEntries = removeArchiveSkus(archiveEntries, linkedSkus);
      await saveArchiveEntries(env, archiveEntries);
    }
  }

  if (!text && action !== "preview" && action !== "save") {
    return jsonResponse({
      ok: true,
      applied: false,
      menuName,
      archive: archiveEntries,
    });
  }

  const summary = await previewFromCsv(env, text, menuName, archiveEntries, {
    apply: action === "save",
  });

  return jsonResponse({
    ok: true,
    applied: action === "save",
    menuName,
    ...summary,
  });
});
