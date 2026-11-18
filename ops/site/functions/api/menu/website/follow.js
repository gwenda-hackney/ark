import { jsonResponse, withApiHandler } from "../../../../src/platform/http.js";
import { menuToWebsite } from "../../../../src/menu/server/menu-website.js";

/**
 * After the menu is saved (a menu's page, Items): the menu goes on the
 * website by itself, as a saved event does, unless the setting
 * `website.auto_update` says to wait for Update website (menuToWebsite).
 * `released` says which. The website rebuilds `/menu` once edits are quiet.
 */
export const onRequestPost = withApiHandler(async (context) => {
  const { sync, released, published, warnings } = await menuToWebsite(context.env);
  return jsonResponse({ ok: true, missing: sync?.missing || [], released, published, warnings });
});
