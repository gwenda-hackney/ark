/**
 * Beer's draught group is plain "Draught" (#240): the owner found "On
 * Draught" a word too many on home's menu. Only the name changes, and only
 * from the default 2026-11-10-menu-plain-sections.mjs gave it: a name the
 * owner has since edited in ops is left, and said so. The group keeps its
 * slug (its web address, /bar#draught-beer), id, drinks and Sanity link, and
 * goes through the menu's own use case (menu-store.js); no drink is touched,
 * so nothing changes on the till.
 *
 * Safe to run again: it writes only what differs. Supports --dry-run (with
 * --only), which runs the same steps on a copy (scripts/lib/d1-rehearsal.mjs).
 * The website follows with the menu's next Update website.
 */
import { flattenMenuSections } from "../ops/site/src/menu/menu-sections.js";
import { loadMenuTree, updateMenuSection } from "../ops/site/src/menu/server/menu-store.js";
import { opsDataForMigration } from "../scripts/lib/ops-migration.mjs";

export const app = "ops";
export const phase = "post";
export const about = 'Menu: Beer\'s "On Draught" is plain "Draught"';

/** The group, by slug; `was`: the default name this replaces. */
export const DRAUGHT = { slug: "draught-beer", title: "Draught", was: "On Draught" };

/**
 * Rename the draught group through the menu's use case. `env` is what they
 * take (its repository says where the menu lives).
 * @returns {Promise<{ changed: number }>}
 */
export async function plainDraught(env, log = () => {}) {
  const flat = flattenMenuSections((await loadMenuTree(env)).sections);
  const section = flat.find((row) => row.slug === DRAUGHT.slug);
  if (!section) {
    log(`not found: no menu section with the slug ${DRAUGHT.slug}; nothing to rename.`);
    return { changed: 0 };
  }
  const current = section.title || "";
  if (current === DRAUGHT.title) {
    log(`Nothing to do: ${DRAUGHT.slug} is already "${DRAUGHT.title}".`);
    return { changed: 0 };
  }
  if (current !== DRAUGHT.was) {
    log(`left alone: ${DRAUGHT.slug}'s name is "${current}", neither "${DRAUGHT.was}" nor "${DRAUGHT.title}" (edited in ops since?)`);
    return { changed: 0 };
  }
  await updateMenuSection(env, section._id, { title: DRAUGHT.title });
  return { changed: 1 };
}

export async function up({ env, d1, processEnv, log, dryRun = false }) {
  const data = await opsDataForMigration({ env, d1, dryRun, log, processEnv });
  const { changed } = await plainDraught(data.env, log);
  if (changed) {
    log(`1 section ${dryRun ? "to rename" : "renamed"}; its web address stays. No drink was touched, so nothing changes on the till.`);
    log("The website follows with the menu's next Update website (ops, Menu).");
  }
}
