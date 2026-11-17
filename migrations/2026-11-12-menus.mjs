/**
 * Menus (#305): every chapter of the menu goes on a menu, so Menu → Menus
 * in ops lists them and a pop-up kitchen's menus show in Events.
 *
 * - "Drinks" (drinks, ongoing, every day) holds every drinks chapter.
 * - Each food chapter of a pop-up kitchen becomes a Food menu of its own,
 *   named as the chapter is and belonging to that pop-up kitchen, dated to
 *   its nights (no end date when its run has none) and on its cooking days
 *   (events' popups.js).
 * - A food chapter of no pop-up kitchen (or of one that is no longer one)
 *   becomes a Food menu of its own, ongoing, every day.
 *
 * It goes the way ops does it: menus.js createMenu, then each chapter moved
 * onto its menu with the sections' own save (menu-store.js
 * updateMenuSection). A chapter keeps its drinks or food and its pop-up
 * kitchen, so what the website gets doesn't change and there is nothing to
 * publish.
 *
 * Safe to run again: a chapter already on a menu is left as it is, and a
 * menu made by a run that stopped halfway (found by its web address) is used
 * rather than made twice. Runs after the deploy (post), so the ops before
 * menus is no longer live to make chapters on no menu.
 *
 * --dry-run (with --only) changes nothing: it runs on a copy of the data
 * (scripts/lib/d1-rehearsal.mjs) and says what it would do.
 */
import { listPopupSeries } from "../ops/site/src/events/server/popups.js";
import { itemSlug } from "../ops/site/src/menu/item-key.js";
import { menuDatesLabel, menuDaysLabel } from "../ops/site/src/menu/menu-days.js";
import { loadMenuTree, updateMenuSection } from "../ops/site/src/menu/server/menu-store.js";
import { createMenu } from "../ops/site/src/menu/server/menus.js";
import { opsDataForMigration } from "../scripts/lib/ops-migration.mjs";

export const app = "ops";
export const phase = "post";
export const about = "Menu: every chapter goes on a menu (Drinks, and a Food menu for each pop-up kitchen)";

/** The menu every drinks chapter goes on. */
export const DRINKS = { name: "Drinks", slug: "drinks", kind: "bar" };

const title = (section) => `"${section.title}" (section ${section._id})`;
const describe = (menu) => `${menuDatesLabel(menu)}, ${menuDaysLabel(menu.days).replace("Every day", "every day")}`;

/**
 * The menu each chapter on no menu goes on: [{ menu, chapters }], drinks
 * first. `menu` is what to make, or find by its slug.
 */
export function planMenus(chapters, popups) {
  const plans = [];
  const drinks = chapters.filter((chapter) => chapter.kind !== "kitchen");
  if (drinks.length) plans.push({ menu: { ...DRINKS }, chapters: drinks });
  for (const chapter of chapters.filter((section) => section.kind === "kitchen")) {
    const popup = chapter.popupSeriesId ? popups.find((series) => series.id === chapter.popupSeriesId) : null;
    plans.push({
      menu: {
        name: chapter.title,
        slug: itemSlug(chapter.slug || chapter.title),
        kind: "kitchen",
        ...(popup
          ? { popupSeriesId: popup.id, startsOn: popup.startsOn, endsOn: popup.endsOn, days: popup.days }
          : { startsOn: "", endsOn: "", days: [] }),
      },
      chapters: [chapter],
      lostPopup: Boolean(chapter.popupSeriesId && !popup),
    });
  }
  return plans;
}

/**
 * The menu a plan goes on: one there already with its web address (made by
 * an earlier run, or by the owner), or a new one.
 */
async function menuFor(env, plan, menus, say, { dryRun = false } = {}) {
  const there = menus.find((menu) => menu.slug === plan.menu.slug);
  if (there) {
    if (there.kind !== plan.menu.kind) {
      throw new Error(
        `There's already a ${there.kind === "kitchen" ? "Food" : "Drinks"} menu called "${there.name}" (/${there.slug}), so ${plan.chapters.map(title).join(", ")} can't go on it. Nothing more was changed. Rename that menu in ops (Menu → Menus), then run this again.`,
      );
    }
    say(`${dryRun ? "would use" : "using"} the menu "${there.name}" (menu ${there.id}) that is already there`);
    return { id: there.id, name: there.name, made: false };
  }
  const made = await createMenu(env, plan.menu);
  say(`${dryRun ? "would make" : "made"} the menu "${made.name}" (menu ${made.id}): ${made.kind === "kitchen" ? "Food" : "Drinks"}, ${describe(made)}${made.popupName ? `, ${made.popupName}'s` : ""}`);
  return { id: Number(made.id), name: made.name, made: true };
}

/**
 * Put every chapter on no menu on its menu. `dryRun` only changes how it says so.
 * @returns {Promise<{ made: number, moved: number }>}
 */
export async function putChaptersOnMenus(env, log = () => {}, { dryRun = false } = {}) {
  const { sections, menus } = await loadMenuTree(env);
  const loose = sections.filter((chapter) => !chapter.menuId);
  if (!loose.length) return { made: 0, moved: 0 };
  const plans = planMenus(loose, await listPopupSeries(env));
  let made = 0;
  let moved = 0;
  for (const plan of plans) {
    if (plan.lostPopup) {
      log(`note: ${title(plan.chapters[0])} belonged to a pop-up kitchen that is gone from Events: its menu has none`);
    }
    const menu = await menuFor(env, plan, menus, log, { dryRun });
    if (menu.made) made += 1;
    for (const chapter of plan.chapters) {
      await updateMenuSection(env, chapter._id, { menuId: String(menu.id) });
      log(`  ${title(chapter)} ${dryRun ? "would go" : "is now"} on ${menu.name}`);
      moved += 1;
    }
  }
  return { made, moved };
}

export async function up({ env, d1, processEnv, log, dryRun = false }) {
  const data = await opsDataForMigration({ env, d1, dryRun, log, processEnv });
  const { made, moved } = await putChaptersOnMenus(data.env, log, { dryRun });
  if (!moved) {
    log("Nothing to do: every chapter is on a menu.");
    return { made, moved };
  }
  log(
    `${moved} chapter${moved === 1 ? "" : "s"} ${dryRun ? "would go" : "went"} on ${made} new menu${made === 1 ? "" : "s"}. The website doesn't change: each chapter keeps its drinks or food and its pop-up kitchen.`,
  );
  return { made, moved };
}
