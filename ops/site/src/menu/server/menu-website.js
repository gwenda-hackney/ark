/**
 * Where each menu stands with the website (#305), for its page's Update
 * website: what pressing it would change now. That is what the menu's
 * Update website (functions/api/menu/publish.js) does, read without
 * writing: ops' menu against the preview (planOpsMenuSync), then the
 * preview's menu documents against the website (the release diff). Each
 * change is put down to the menus it is on; one that can't be (a drink
 * taken off every menu) counts for all of them.
 */
import { websiteFollowsSaves } from "../../website/server/auto-update.js";
import { getReleaseDiff, markReleasedInOps, publishRelease } from "../../website/server/release.js";
import { planOpsMenuSync, syncOpsMenuToSanity } from "../../website/server/publish-sync.js";
import { readState, updateNow } from "../../website/server/site-pending.js";
import { flattenMenuSections } from "../menu-sections.js";
import { loadMenuTree } from "./menu-store.js";

/**
 * The documents the menu puts on the website: drinks, sections, and the
 * menus themselves (name, dates, days), so a change to those alone goes
 * too (#330).
 */
export const MENU_DOC_TYPES = new Set(["menu", "menuItem", "menuSection"]);

/**
 * Pending changes by menu: `menus` (ops menu id → how many), and `other`,
 * those that belong to no menu in particular.
 * @param {{ menus: string[], sections: string[], items: string[], goneMenus: string[] }} plan
 * @param {{ id: string, type: string }[]} released preview documents the website doesn't show yet
 * @param {{ sections: object[], items: object[] }} tree
 */
export function menuChangesByMenu(plan, released, { sections, items }) {
  const flat = flattenMenuSections(sections);
  const byId = new Map(flat.map((section) => [String(section._id), section]));
  const menuOfSection = (id) => {
    const section = byId.get(String(id));
    if (!section) return "";
    const chapter = section.parentId ? byId.get(String(section.parentId)) : section;
    return chapter?.menuId ? String(chapter.menuId) : "";
  };
  const itemById = new Map(items.map((item) => [String(item._id), item]));
  const menusOfItem = (item) =>
    [
      ...new Set(
        [item.sectionId, ...(item.placements || []).filter((row) => row.channel !== "pos").map((row) => row.sectionId)]
          .map(menuOfSection)
          .filter(Boolean),
      ),
    ];
  const sectionBySanity = new Map(flat.filter((section) => section.sanityId).map((section) => [section.sanityId, section]));
  const itemBySanity = new Map(items.filter((item) => item.sanityId).map((item) => [item.sanityId, item]));

  const menus = {};
  let other = 0;
  const count = (ids) => {
    if (!ids.length) other += 1;
    for (const id of ids) menus[id] = (menus[id] || 0) + 1;
  };
  for (const id of plan.menus) count([String(id)]);
  for (const id of plan.goneMenus) count([String(id).replace(/^menu-/, "")]);
  for (const id of plan.sections) count([menuOfSection(id)].filter(Boolean));
  for (const id of plan.items) count(itemById.has(String(id)) ? menusOfItem(itemById.get(String(id))) : []);
  for (const entry of released) {
    if (!MENU_DOC_TYPES.has(entry.type)) continue;
    if (entry.type === "menu") {
      count([String(entry.id).replace(/^menu-/, "")]);
      continue;
    }
    const section = sectionBySanity.get(entry.id);
    const item = itemBySanity.get(entry.id);
    count(section ? [menuOfSection(section._id)].filter(Boolean) : item ? menusOfItem(item) : []);
  }
  return { menus, other };
}

/**
 * What Update website would change now, by menu (menuChangesByMenu), and
 * `follows`: whether a save goes on the website by itself.
 */
export async function menuWebsiteChanges(
  env,
  { plan = planOpsMenuSync, diff = getReleaseDiff, tree = loadMenuTree, followsSaves = websiteFollowsSaves } = {},
) {
  const menu = await tree(env);
  const [planned, release, follows] = await Promise.all([plan(env, menu), diff(env), followsSaves(env)]);
  return { ...menuChangesByMenu(planned, release.entries || [], menu), follows };
}

/**
 * The menu to the website, the one way it gets there: ops' menu to the
 * preview (syncOpsMenuToSanity), then every menu document the website
 * doesn't show yet onto it (publishRelease).
 *
 * - After a save (`now` false), it goes on the website when the setting
 *   lets saves follow (websiteFollowsSaves), else it stops at the preview,
 *   waiting for Update website. The website's own tick rebuilds `/menu`
 *   once edits have been quiet (site-pending.js), so saves don't pile up
 *   builds.
 * - Update website (`now`) always puts it there, and starts the build now
 *   when one isn't running: also for documents a save already put there.
 *
 * @returns {Promise<{ sync: object, released: boolean, published: number, building: boolean, warnings: string[] }>}
 */
export async function menuToWebsite(
  env,
  {
    now = false,
    sync = syncOpsMenuToSanity,
    diff = getReleaseDiff,
    publish = publishRelease,
    mark = markReleasedInOps,
    followsSaves = websiteFollowsSaves,
    state = readState,
    build = updateNow,
  } = {},
) {
  const synced = await sync(env, { target: "preview" });
  const warnings = [];
  if (!now && !(await followsSaves(env))) return { sync: synced, released: false, published: 0, building: false, warnings };
  const ids = (await diff(env)).entries.filter((entry) => MENU_DOC_TYPES.has(entry.type)).map((entry) => entry.id);
  if (ids.length) {
    const result = await publish(env, { ids });
    warnings.push(...(result.warnings || []));
    try {
      await mark(env, [...ids, ...(result.written || [])], { deleted: result.deleted || [] });
    } catch (error) {
      warnings.push(`On the website, but ops status did not update: ${error?.message || "unknown error"}.`);
    }
  }
  let building = false;
  if (now) {
    try {
      if (!(await state(env, "production")).runId) await build(env, "production");
      building = true;
    } catch (error) {
      warnings.push(`The menu page will update with the next website update: ${error?.message || "the build did not start"}.`);
    }
  }
  return { sync: synced, released: true, published: ids.length, building, warnings };
}
