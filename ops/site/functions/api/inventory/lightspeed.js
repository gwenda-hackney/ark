import { jsonResponse, readJsonBody, withApiHandler } from "../../_lib/http.js";
import {
  applyLightspeedActual,
  createInventoryFromLightspeed,
  listInventory,
} from "../../_lib/inventory-store.js";
import {
  canCreateFromLightspeed,
  lightspeedItemImportCsv,
  matchLightspeedRows,
  parseLightspeedCsv,
  patchesFromMatch,
  summarizeMatch,
} from "../../_lib/lightspeed-stock.js";

function createKeySet(value) {
  if (!Array.isArray(value)) return new Set();
  return new Set(value.map((key) => String(key || "").trim()).filter(Boolean));
}

export const onRequestPost = withApiHandler(async (context) => {
  const body = await readJsonBody(context.request);
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid request." }, 400);
  }
  const text = typeof body.text === "string" ? body.text : "";
  const rows = parseLightspeedCsv(text);
  if (!rows.length) {
    return jsonResponse({ error: "No Lightspeed item rows found." }, 400);
  }

  const apply = body.apply === true;
  const createKeys = createKeySet(body.createKeys);
  const countedAt = new Date().toISOString();
  const items = await listInventory(context.env, { includeInactive: true });
  const match = matchLightspeedRows(items, rows);

  const created = [];
  if (apply) {
    await applyLightspeedActual(
      context.env,
      patchesFromMatch(match),
      countedAt,
    );
    for (const row of match.lightspeedOnly) {
      if (!createKeys.has(row.key)) continue;
      if (!canCreateFromLightspeed(row)) continue;
      created.push(await createInventoryFromLightspeed(context.env, row, countedAt));
    }
  }

  const nextItems = apply
    ? await listInventory(context.env, { includeInactive: true })
    : items;
  const nextMatch = apply ? matchLightspeedRows(nextItems, rows) : match;
  const summary = summarizeMatch(nextMatch);

  return jsonResponse({
    ok: true,
    applied: apply,
    countedAt: apply ? countedAt : undefined,
    created,
    ...summary,
    itemImportCsv: lightspeedItemImportCsv(nextMatch.opsOnly),
  });
});
