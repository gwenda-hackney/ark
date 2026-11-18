import { jsonResponse, withApiHandler } from "../../../src/platform/http.js";
import { menuToWebsite, menuWebsiteChanges } from "../../../src/menu/server/menu-website.js";

/**
 * What Update website would change now, by menu, read without writing
 * (menu-website.js): { menus: { <menu id>: count }, other, follows }. A
 * menu's page says from it where the menu stands with the website.
 */
export const onRequestGet = withApiHandler(async (context) => {
  return jsonResponse({ ok: true, ...(await menuWebsiteChanges(context.env)) });
});

/**
 * The menu's Update website (#42): every menu change on the website now,
 * and `/menu` built now, instead of after the quiet period; one already
 * running picks the change up next (menuToWebsite).
 */
export const onRequestPost = withApiHandler(async (context) => {
  const { sync, published, building, warnings } = await menuToWebsite(context.env, { now: true });
  return jsonResponse({ ok: true, sync, published, building, warnings });
});
