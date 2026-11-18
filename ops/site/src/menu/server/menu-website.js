/**
 * Where each menu stands with the website (#305), for its page's Update
 * website: what pressing it would change now. That is what the menu's
 * Update website (functions/api/menu/publish.js) does, read without
 * writing: ops' menu against the preview (planOpsMenuSync), then the
 * preview's menu documents against the website (the release diff). Each
 * change is put down to the menus it is on; one that can't be (a drink
 * taken off every menu) counts for all of them.
 */
import { getReleaseDiff } from "../../website/server/release.js";
import { planOpsMenuSync } from "../../website/server/publish-sync.js";
import { flattenMenuSections } from "../menu-sections.js";
import { loadMenuTree } from "./menu-store.js";

/** The documents the menu's Update website puts on the website. */
export const MENU_DOC_TYPES = new Set(["menuItem", "menuSection"]);

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
    const section = sectionBySanity.get(entry.id);
    const item = itemBySanity.get(entry.id);
    count(section ? [menuOfSection(section._id)].filter(Boolean) : item ? menusOfItem(item) : []);
  }
  return { menus, other };
}

/** What Update website would change now, by menu (menuChangesByMenu). */
export async function menuWebsiteChanges(env, { plan = planOpsMenuSync, diff = getReleaseDiff, tree = loadMenuTree } = {}) {
  const menu = await tree(env);
  const [planned, release] = await Promise.all([plan(env, menu), diff(env)]);
  return menuChangesByMenu(planned, release.entries || [], menu);
}
