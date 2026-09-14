import { jsonResponse, readJsonBody, withApiHandler } from "../../_lib/http.js";
import { groupImportRows, parseImportText } from "../../_lib/menu.js";
import { importIngredientsForItems } from "../../_lib/menu-store.js";

export const onRequestPost = withApiHandler(async (context) => {
  const body = await readJsonBody(context.request);
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid request." }, 400);
  }

  const text = typeof body.text === "string" ? body.text : "";
  const rows = Array.isArray(body.rows) ? body.rows : parseImportText(text);
  if (groupImportRows(rows).size === 0) {
    return jsonResponse({ error: "No ingredient rows found." }, 400);
  }

  const result = await importIngredientsForItems(context.env, rows);
  return jsonResponse({ ok: true, ...result });
});
