/**
 * Pinsa A Roma, the Monday pizza: a pop-up kitchen in Events, cooking every
 * Monday from 23 November 2026 with no end date, and its Food menu (Menus)
 * with its dishes, from the menu the owner sent on 19 November.
 *
 * It goes the way ops does it:
 *
 * 1. The pop-up kitchen is added with the Add's own save (event-store.js
 *    createEvent): weekly on Mondays from the 23rd, no end date (a rolling
 *    run: its nights reach 12 weeks ahead and grow as the days pass), with
 *    its Instagram as its link. Its logo comes later, from the owner, in ops.
 * 2. Its Food menu (menus.js createMenu, the Menus page's own save) belongs
 *    to it and runs on Mondays from the 23rd, ongoing. Its chapter and
 *    groups go on it (menu-store.js createMenuSection) and the dishes in
 *    them (createMenuItem), on the digital menu only: not on print, and
 *    food gets no place on the till.
 * 3. The website then gets both as after a save: the pop-up's nights
 *    (ops-migration.mjs putEventOnWebsiteNow) and the menu
 *    (menu-website.js menuToWebsite).
 *
 * It only adds what is missing and never rewrites what is there: the pop-up,
 * the menu, a section or a dish found by its web address or name is left as
 * the owner has it, so a price changed in ops stays changed. Dish names are
 * unique across the menu and section addresses too, so anything in the way
 * stops it before it writes a thing, saying what to rename.
 *
 * Safe to run again: once everything is there and the website is in step,
 * there is nothing to do, and a run that stopped halfway is finished.
 *
 * --dry-run (with --only) changes nothing anywhere. It checks what stands in
 * the way and says what it would add: adding the pop-up makes its Drive
 * folder, which a dry run can't rehearse, so with no pop-up yet it lists the
 * plan; with one, the saves run on a copy of the data
 * (scripts/lib/d1-rehearsal.mjs). For the website it says what would happen,
 * since Sanity has no copy to rehearse on.
 */
import { createEvent, listEvents } from "../ops/site/src/events/server/event-store.js";
import { namesClash } from "../ops/site/src/menu/item-key.js";
import { flattenMenuSections } from "../ops/site/src/menu/menu-sections.js";
import { createMenuItem, createMenuSection, loadMenuTree } from "../ops/site/src/menu/server/menu-store.js";
import { menuToWebsite } from "../ops/site/src/menu/server/menu-website.js";
import { createMenu, listMenus } from "../ops/site/src/menu/server/menus.js";
import { eventInStepWithWebsite, opsDataForMigration, putEventOnWebsiteNow } from "../scripts/lib/ops-migration.mjs";

export const app = "ops";
export const phase = "post";
export const about = "Events and Menus: Pinsa A Roma, the Monday pizza pop-up, with its menu";

/** /whats-on/pinsa-a-roma, and the menu's own web address. */
export const SLUG = "pinsa-a-roma";

export const POPUP = {
  name: "Pinsa A Roma",
  category: "popup",
  description: "Roman pinsa on Mondays: a light, crisp base with tomato, mozzarella and good olive oil, plus fries, dips and tiramisù.",
  startsOn: "2026-11-23",
  startTime: "17:00",
  endTime: "22:00",
  repeatUnit: "week",
  repeatEvery: 1,
  weekdays: ["mon"],
  endsOn: "",
  /** Its Instagram, as its link (Details). */
  pageUrl: "https://www.instagram.com/aroma.ldn/",
};

export const MENU = { name: "Pinsa A Roma", slug: SLUG, kind: "kitchen", startsOn: "2026-11-23", endsOn: "", days: "mon" };

export const CHAPTER = {
  title: "Pinsa A Roma",
  slug: SLUG,
  subtitle: "(V) vegetarian, (VE) vegan. Tell us about any allergies.",
  groups: [
    {
      title: "Pinsa",
      slug: "pinsa-a-roma-pinsa",
      subtitle: "Each on 250g of dough",
      items: [
        {
          name: "Trastevere (V)",
          price: "13.50",
          description: "Margherita: tomato sauce, mozzarella, extra virgin olive oil and basil.",
        },
        {
          name: "Colosseo",
          price: "14.50",
          description: "Spicy salami: tomato sauce, mozzarella, extra virgin olive oil and spicy salami.",
        },
        {
          name: "Villa Borghese (V)",
          price: "15.50",
          description: "Vegetarian: tomato sauce, mozzarella, extra virgin olive oil and mixed veg.",
        },
        {
          name: "Giulio Cesare",
          price: "16",
          description: "Chicken: tomato sauce, mozzarella, extra virgin olive oil and basil.",
        },
      ],
    },
    {
      title: "Sides and dips",
      slug: "pinsa-a-roma-sides",
      items: [
        { name: "Spicy sauce (VE)", price: "1.50", description: "Added to any pinsa." },
        { name: "Side of fries", price: "6", description: "" },
        { name: "Garlic dip", price: "1.50", description: "" },
        { name: "Hot honey dip", price: "1.50", description: "" },
      ],
    },
    {
      title: "Dessert",
      slug: "pinsa-a-roma-dessert",
      items: [{ name: "Tiramisù", price: "6.50", description: "" }],
    },
  ],
};

const title = (event) => `"${event.name}" (event ${event.id})`;

async function menuTree(env) {
  const { sections, items } = await loadMenuTree(env);
  const flat = flattenMenuSections(sections);
  return { flat, items, bySlug: new Map(flat.map((section) => [section.slug, section])) };
}

/**
 * What stands in the way, found before anything is written: a menu, section
 * address or dish name this needs that something else already has. Empty
 * when the way is clear.
 */
export function clashes({ menus, flat, items, bySlug }, popupId) {
  const problems = [];
  const menu = menus.find((row) => row.slug === MENU.slug);
  if (menu && (menu.kind !== "kitchen" || (popupId && menu.popupSeriesId && String(menu.popupSeriesId) !== String(popupId)))) {
    problems.push(`a menu "${menu.name}" (/${menu.slug}) is already there and isn't Pinsa A Roma's Food menu`);
  }
  const chapter = bySlug.get(CHAPTER.slug);
  if (chapter && (chapter.parentId || (menu && String(chapter.menuId ?? "") !== String(menu.id)))) {
    problems.push(`a section "${chapter.title}" (${CHAPTER.slug}) is already on the menu somewhere else`);
  }
  for (const group of CHAPTER.groups) {
    const found = bySlug.get(group.slug);
    if (found && (!chapter || found.parentId !== chapter._id)) {
      problems.push(`a section "${found.title}" (${group.slug}) is already on the menu, not under ${CHAPTER.title}`);
    }
    for (const dish of group.items) {
      for (const item of items) {
        if (!namesClash(item.name, dish.name)) continue;
        if (found && found.parentId === chapter?._id && item.sectionId === found._id) continue;
        const where = flat.find((section) => section._id === item.sectionId);
        problems.push(
          `"${dish.name}" would clash with "${item.name}" (item ${item._id}${where ? `, in "${where.title}"` : ""}): names are unique across the menu`,
        );
      }
    }
  }
  return problems;
}

/** How many of the menu, chapter, groups and dishes are missing. */
export function planned({ bySlug, items }, menuThere) {
  let count = (menuThere ? 0 : 1) + (bySlug.has(CHAPTER.slug) ? 0 : 1);
  for (const group of CHAPTER.groups) {
    const section = bySlug.get(group.slug);
    count += section ? 0 : 1;
    count += group.items.filter((dish) => !section || !items.some((item) => item.sectionId === section._id && namesClash(item.name, dish.name))).length;
  }
  return count;
}

/** The pop-up by its web address (or one it had), else made. */
async function popupFor(env, say) {
  const events = await listEvents(env, { withDeleted: true });
  const found = events.find((event) => event.slug === SLUG) || events.find((event) => (event.formerSlugs || []).includes(SLUG));
  if (found) {
    if (found.deletedAt) {
      throw new Error(
        `${title(found)} is deleted in ops and waits on the Website page. Nothing was changed. Restore it or let it go, then run this again.`,
      );
    }
    if (found.category !== "popup") say(`note: ${title(found)} is there but isn't a pop-up kitchen in ops; left as it is`);
    return { event: found, added: false };
  }
  const event = await createEvent(env, POPUP);
  say(`added the pop-up kitchen ${title(event)}: every Monday from ${POPUP.startsOn}, ${POPUP.startTime}–${POPUP.endTime}, no end date`);
  say(`    its first nights: ${event.dates.slice(0, 6).map((night) => night.date).join(", ")}`);
  return { event, added: true };
}

/** The menu, its chapter, groups and dishes, where missing. */
async function addMenu(env, popup, say) {
  let menu = (await listMenus(env)).menus.find((row) => row.slug === MENU.slug);
  let added = 0;
  if (!menu) {
    menu = await createMenu(env, { ...MENU, popupSeriesId: popup.id });
    say(`added the Food menu "${menu.name}" (menu ${menu.id}): Pinsa A Roma's, on Mondays from ${MENU.startsOn}, ongoing`);
    added += 1;
  }
  let state = await menuTree(env);
  let chapter = state.bySlug.get(CHAPTER.slug);
  if (!chapter) {
    chapter = await createMenuSection(env, { title: CHAPTER.title, slug: CHAPTER.slug, subtitle: CHAPTER.subtitle, menuId: menu.id });
    added += 1;
  }
  for (const group of CHAPTER.groups) {
    state = await menuTree(env);
    let section = state.bySlug.get(group.slug);
    if (!section) {
      section = await createMenuSection(env, { title: group.title, slug: group.slug, subtitle: group.subtitle || "", parentId: chapter._id });
      added += 1;
    }
    const dishes = [];
    for (const dish of group.items) {
      if (state.items.some((item) => item.sectionId === section._id && namesClash(item.name, dish.name))) continue;
      await createMenuItem(env, {
        name: dish.name,
        description: dish.description,
        price: dish.price,
        sectionId: section._id,
        // The digital menu only: no print, and food gets no place on the till.
        placements: [{ channel: "digital", sectionId: section._id }],
      });
      dishes.push(`${dish.name} £${dish.price}`);
      added += 1;
    }
    if (dishes.length) say(`    ${group.title}: ${dishes.join(", ")}`);
  }
  return added;
}

export async function up({ env, d1, processEnv, log, dryRun = false }) {
  const data = await opsDataForMigration({ env, d1, dryRun, log, processEnv });
  const say = (line) => log(dryRun ? `would have: ${line}` : line);

  // Everything in the way is found before anything is written.
  const events = await listEvents(data.env, { withDeleted: true });
  const existing = events.find((event) => event.slug === SLUG);
  const problems = clashes({ menus: (await listMenus(data.env)).menus, ...(await menuTree(data.env)) }, existing?.id);
  if (problems.length) {
    throw new Error(`Pinsa A Roma was not added, and nothing was changed:\n  ${problems.join("\n  ")}\nRename or move what is in the way in ops, then run this again.`);
  }

  if (dryRun && !existing) {
    const state = await menuTree(data.env);
    const menuThere = (await listMenus(data.env)).menus.some((row) => row.slug === MENU.slug);
    const count = planned(state, menuThere);
    say(`added the pop-up kitchen "${POPUP.name}": every Monday from ${POPUP.startsOn}, ${POPUP.startTime}–${POPUP.endTime}, no end date`);
    say(`added its Food menu "${MENU.name}", on Mondays from ${MENU.startsOn}, ongoing, with ${count} menu, sections and dishes`);
    for (const group of CHAPTER.groups) say(`    ${group.title}: ${group.items.map((dish) => `${dish.name} £${dish.price}`).join(", ")}`);
    log(`would put it on the website (/whats-on/${SLUG}), and its menu`);
    return { popup: "added", menu: count, published: false };
  }

  const { event, added: popupAdded } = await popupFor(data.env, say);
  const added = await addMenu(data.env, event, say);

  if (!popupAdded && !added && eventInStepWithWebsite(event)) {
    log(`Nothing to do: ${title(event)} and its menu are there, and the website is in step.`);
    return { popup: "there", menu: 0, published: false };
  }
  if (dryRun) {
    log(`would put it on the website (/whats-on/${event.slug}), and its menu`);
    return { popup: popupAdded ? "added" : "there", menu: added, published: false };
  }
  const live = await putEventOnWebsiteNow(data.env, event.id);
  log(`${title(live)} is on the website: /whats-on/${live.slug}`);
  if (added) {
    const result = await menuToWebsite(data.env);
    for (const warning of result.warnings) log(`warning: ${warning}`);
    log(
      result.released
        ? `its menu is on the website (${result.published} document${result.published === 1 ? "" : "s"}); /menu follows with the next website update`
        : "its menu is on the preview, waiting for Update website (ops, Menus): saves don't go live by themselves here",
    );
  }
  return { popup: popupAdded ? "added" : "there", menu: added, published: true };
}
