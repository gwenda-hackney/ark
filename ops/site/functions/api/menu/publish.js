import { jsonResponse, withApiHandler } from "../../../src/platform/http.js";
import { syncOpsMenuToSanity } from "../../../src/website/server/publish-sync.js";
import {
  getReleaseDiff,
  markReleasedInOps,
  publishRelease,
} from "../../../src/website/server/release.js";
import { readState, updateNow } from "../../../src/website/server/site-pending.js";

const MENU_TYPES = new Set(["menuItem", "menuSection"]);

/**
 * The menu's Update website (#42): copy ops' menu to the preview, then put
 * every menu change on the website, as Update website does for an event.
 * `/menu` is a built page, so the build starts now instead of after the
 * quiet period; one already running picks the change up next.
 */
export const onRequestPost = withApiHandler(async (context) => {
  const { env } = context;
  const sync = await syncOpsMenuToSanity(env, { target: "preview" });
  const ids = (await getReleaseDiff(env)).entries
    .filter((entry) => MENU_TYPES.has(entry.doc?._type || entry.type))
    .map((entry) => entry.id);
  const warnings = [];
  let result = { written: [], deleted: [] };
  if (ids.length) {
    result = await publishRelease(env, { ids });
    warnings.push(...result.warnings);
    try {
      await markReleasedInOps(env, [...ids, ...result.written], { deleted: result.deleted });
    } catch (error) {
      warnings.push(`On the website, but ops status did not update: ${error?.message || "unknown error"}.`);
    }
  }
  let building = false;
  if (ids.length) {
    try {
      if (!(await readState(env, "production")).runId) await updateNow(env, "production");
      building = true;
    } catch (error) {
      warnings.push(`The menu page will update with the next website update: ${error?.message || "the build did not start"}.`);
    }
  }
  return jsonResponse({ ok: true, sync, published: ids.length, building, warnings });
});
