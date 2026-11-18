import { jsonResponse, withApiHandler } from "../../../src/platform/http.js";
import { requireAdmin } from "../../../src/access/server/admin.js";
import { STATUS_DATABASES, databaseStatus } from "../../../src/platform/d1-status.js";

/**
 * GET ?db=ops|website: that D1 database's status in this environment;
 * without it, the databases there are. Copying production over dev is POST
 * /api/web/dev-copy.
 */
export const onRequestGet = withApiHandler(async (context) => {
  await requireAdmin(context.env, context.request);
  const db = new URL(context.request.url).searchParams.get("db");
  if (!db) {
    const databases = Object.entries(STATUS_DATABASES).map(([id, label]) => ({ id, label }));
    return jsonResponse({ ok: true, databases });
  }
  return jsonResponse({ ok: true, ...(await databaseStatus(context.env, db)) });
});
