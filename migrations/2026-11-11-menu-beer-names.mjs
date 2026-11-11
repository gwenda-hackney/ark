/**
 * Beer's two groups in one word each (#240): "On Draught" becomes "Draught"
 * and "In Bottles" becomes "Bottles". The owner found them a word too many
 * on home's menu. Only the names change, and only from the defaults
 * 2026-11-10-menu-plain-sections.mjs gave them: a name the owner has since
 * edited in ops is left, and said so; a group that isn't there is said so,
 * and the other is still renamed. Each group keeps its slug (its web
 * address, /bar#draught-beer and /bar#bottled-beer), id, drinks and Sanity
 * link, and goes through the menu's own use case (menu-store.js); no drink
 * is touched, so nothing changes on the till.
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
export const about = 'Menu: Beer\'s "On Draught" and "In Bottles" are plain "Draught" and "Bottles"';

/** The groups, by slug; `was`: the default name each replaces. */
export const RENAMES = [
  { slug: "draught-beer", title: "Draught", was: "On Draught" },
  { slug: "bottled-beer", title: "Bottles", was: "In Bottles" },
];

/**
 * Rename the beer groups through the menu's use case. `env` is what they
 * take (its repository says where the menu lives).
 * @returns {Promise<{ changed: number }>}
 */
export async function plainBeerNames(env, log = () => {}) {
  const flat = flattenMenuSections((await loadMenuTree(env)).sections);
  let changed = 0;
  for (const spec of RENAMES) {
    const section = flat.find((row) => row.slug === spec.slug);
    if (!section) {
      log(`not found: no menu section with the slug ${spec.slug}; nothing to rename.`);
      continue;
    }
    const current = section.title || "";
    if (current === spec.title) {
      log(`Nothing to do: ${spec.slug} is already "${spec.title}".`);
      continue;
    }
    if (current !== spec.was) {
      log(`left alone: ${spec.slug}'s name is "${current}", neither "${spec.was}" nor "${spec.title}" (edited in ops since?)`);
      continue;
    }
    await updateMenuSection(env, section._id, { title: spec.title });
    changed += 1;
  }
  return { changed };
}

export async function up({ env, d1, processEnv, log, dryRun = false }) {
  const data = await opsDataForMigration({ env, d1, dryRun, log, processEnv });
  const { changed } = await plainBeerNames(data.env, log);
  if (changed) {
    const one = changed === 1;
    log(
      `${changed} section${one ? "" : "s"} ${dryRun ? "to rename" : "renamed"}; ${one ? "its web address stays" : "their web addresses stay"}. No drink was touched, so nothing changes on the till.`,
    );
    log("The website follows with the menu's next Update website (ops, Menu).");
  }
}
