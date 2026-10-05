import { jsonResponse, withApiHandler } from "../../../src/platform/http.js";
import { requireAdmin } from "../../../src/access/server/admin.js";
import { compareDatabasePair, databasePairs } from "../../../src/platform/db-diff.js";

/**
 * GET ?pair=ops|website compares one pair; without it, lists the pairs.
 * Copying production over a copy is POST /api/web/dev-copy.
 */
export const onRequestGet = withApiHandler(async (context) => {
  await requireAdmin(context.env, context.request);
  const pair = new URL(context.request.url).searchParams.get("pair");
  if (!pair) {
    const pairs = Object.values(databasePairs(context.env)).map((row) => ({
      id: row.id,
      label: row.label,
      copyLabel: row.copyLabel,
    }));
    return jsonResponse({ ok: true, pairs });
  }
  const result = await compareDatabasePair(context.env, pair);
  return jsonResponse({ ok: true, ...result });
});
