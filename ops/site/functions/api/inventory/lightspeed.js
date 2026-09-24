import { jsonResponse, readJsonBody, withApiHandler } from "../../_lib/http.js";
import {
  applyLightspeedActual,
  createInventoryFromLightspeed,
  listInventory,
} from "../../_lib/inventory-store.js";
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
  matchLightspeedCatalog,
  menuItemFromLightspeed,
  menuPatchesFromMatch,
  mergeArchiveEntries,
  parseArchiveEntries,
  parseLightspeedItemCsv,
  patchesFromMatch,
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

  const [{ items }, inventory] = await Promise.all([
    loadMenuTree(env),
    listInventory(env).catch(() => []),
  ]);
  const match = matchLightspeedCatalog({ menuItems: items, inventory }, rows);

  if (apply) {
    await applyLightspeedMenuMatch(env, menuPatchesFromMatch(match));
    const stockPatches = patchesFromMatch({
      matched: match.stockMatched,
      conflicts: match.stockConflicts,
    }).filter((patch) => patch.lightspeedSku);
    if (stockPatches.length) {
      await applyLightspeedActual(env, stockPatches);
    }
  }

  const nextItems = apply ? (await loadMenuTree(env)).items : items;
  const nextInventory = apply
    ? await listInventory(env).catch(() => inventory)
    : inventory;
  const nextMatch = apply
    ? matchLightspeedCatalog(
        { menuItems: nextItems, inventory: nextInventory },
        rows,
      )
    : match;
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
  } else if (action === "add-stock") {
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) {
      return jsonResponse({ error: "Pick a Lightspeed item to add to inventory." }, 400);
    }
    const addedSkus = [];
    for (const item of items) {
      const created = await createInventoryFromLightspeed(env, item);
      if (created?.lightspeedSku) addedSkus.push(created.lightspeedSku);
    }
    if (addedSkus.length) {
      archiveEntries = removeArchiveSkus(archiveEntries, addedSkus);
      await saveArchiveEntries(env, archiveEntries);
    }
  } else if (action === "stamp-skus") {
    const patches = Array.isArray(body.patches) ? body.patches : [];
    if (!patches.length) {
      return jsonResponse({ error: "No SKUs to save." }, 400);
    }
    const menuPatches = [];
    const inventoryPatches = [];
    for (const patch of patches) {
      const rawId = String(patch?.id ?? patch?._id ?? "");
      if (rawId.startsWith("inv:")) {
        inventoryPatches.push({
          ...patch,
          id: rawId.slice(4),
          lightspeedSku: patch.lightspeedSku,
        });
      } else if (rawId.startsWith("alt:")) {
        menuPatches.push({
          id: rawId.slice(4),
          lightspeedSkuAlt: patch.lightspeedSku,
        });
      } else {
        menuPatches.push(patch);
      }
    }
    if (menuPatches.length) {
      await applyLightspeedMenuMatch(env, menuPatches);
    }
    if (inventoryPatches.length) {
      await applyLightspeedActual(env, inventoryPatches);
    }
    return jsonResponse({
      ok: true,
      applied: true,
      stamped: patches.length,
      menuName,
    });
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
