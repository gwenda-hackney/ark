/**
 * Chez Pickle's food: a Food chapter of the menu with Burgers, Fries and
 * dips, and Dessert, belonging to the Chez Pickle pop-up kitchen (the event
 * series of that name, once 2026-11-10-a-series-categories.mjs has marked it
 * a pop-up kitchen).
 *
 * Everything goes through the menu's use cases (menu-store.js). The dishes
 * are on the digital menu only: not on the print menu, and not on the till
 * (food gets no POS placement), with no recipe or stock rows.
 *
 * It only adds what is missing, and never rewrites what is there: a chapter,
 * group or dish found by its slug or name is left as the owner has it, so a
 * price changed in ops stays changed. The one thing it fills in later is the
 * chapter's pop-up kitchen, when the chapter has none and the series has
 * since become one. Dish names are unique across the menu and the website
 * matches dishes by name, so a name already used elsewhere on the menu stops
 * the migration before it writes anything.
 *
 * Safe to run again. Supports --dry-run (with --only), which runs the same
 * steps on a copy (scripts/lib/d1-rehearsal.mjs). The website follows with
 * the menu's next Update website.
 */
import { listPopupSeries } from "../ops/site/src/events/server/popups.js";
import { namesClash } from "../ops/site/src/menu/item-key.js";
import { flattenMenuSections } from "../ops/site/src/menu/menu-sections.js";
import {
  createMenuItem,
  createMenuSection,
  loadMenuTree,
  updateMenuSection,
} from "../ops/site/src/menu/server/menu-store.js";
import { opsDataForMigration } from "../scripts/lib/ops-migration.mjs";

export const app = "ops";
export const phase = "post";
export const about = "Menu: Chez Pickle's food (burgers, fries and dips, dessert)";

/** The pop-up kitchen: the event series with exactly this name. */
export const POPUP_NAME = "Chez Pickle";

export const CHAPTER = {
  title: "Chez Pickle",
  slug: "chez-pickle",
  subtitle: "Tell us about any allergies. We take every care, but can't guarantee against cross-contamination.",
  groups: [
    {
      title: "Burgers",
      slug: "burgers",
      subtitle: "For a single patty, take off £2.50",
      items: [
        {
          name: "Liberty Burger",
          price: "15.50",
          description:
            "Two smashed aged beef patties, American cheese and Gruyère, crispy smoked bacon, bone marrow beer onions, pickles and Chez sauce. In a handmade sesame potato bun brushed with garlic-infused smoked aged beef fat.",
        },
        {
          name: "OG Burger",
          price: "14",
          description:
            "Two smashed aged beef patties, American cheese, finely sliced iceberg lettuce and our own burger sauce, pickles and Chez sauce. In a handmade sesame potato bun brushed with herb-infused smoked aged beef fat.",
        },
        {
          name: "Classic Cheeseburger",
          price: "12.50",
          description:
            "Two smashed aged beef patties, American cheese, finely diced sweet Italian onions, pickles and Chez sauce. In a handmade sesame potato bun.",
        },
      ],
    },
    {
      title: "Fries and dips",
      slug: "fries-and-dips",
      items: [
        { name: "Fries", price: "6", description: "Koffmann's skin-on fries, seasoned with Maldon fine Sicilian salt." },
        {
          name: "Disco dust",
          price: "1",
          description:
            "Fries seasoning: chicken, paprika and tarragon; Madras (mild and subtle); or Cajun (a livelier heat).",
        },
        {
          name: "Premium dips",
          price: "2",
          description:
            "Black garlic and port ketchup; blue cheese and chive; aged beef fat confit garlic aioli. Three for £5.",
        },
        { name: "Dips", price: "1", description: "Moscatel vinegar mayo; chive mayo; gochujang mayo." },
      ],
    },
    {
      title: "Dessert",
      slug: "dessert",
      items: [
        {
          name: "Brown butter and almond cake",
          price: "8",
          description: "With blood orange and whipped burnt honey mascarpone.",
        },
      ],
    },
  ],
};

async function menu(env) {
  const { sections, items } = await loadMenuTree(env);
  const flat = flattenMenuSections(sections);
  return { flat, items, bySlug: new Map(flat.map((section) => [section.slug, section])) };
}

/**
 * What stands in the way, found before anything is written: a slug this
 * needs that another part of the menu has, or a dish name already used
 * outside the group it belongs in. Empty when the way is clear.
 */
export function clashes({ flat, items, bySlug }) {
  const problems = [];
  const chapter = bySlug.get(CHAPTER.slug);
  if (chapter?.parentId) problems.push(`"${chapter.title}" (${CHAPTER.slug}) is a group under another chapter, not a chapter`);
  for (const group of CHAPTER.groups) {
    const found = bySlug.get(group.slug);
    if (found && (!chapter || found.parentId !== chapter._id)) {
      const parent = flat.find((section) => section._id === found.parentId);
      problems.push(
        `a section "${found.title}" (${group.slug}) is already on the menu${parent ? ` under "${parent.title}"` : " as a chapter"}, not under ${CHAPTER.title}`,
      );
    }
    for (const dish of group.items) {
      for (const item of items) {
        if (!namesClash(item.name, dish.name)) continue;
        if (found && found.parentId === chapter?._id && item.sectionId === found._id) continue;
        const where = flat.find((section) => section._id === item.sectionId);
        problems.push(
          `"${dish.name}" would clash with "${item.name}" (item ${item._id}${where ? `, in "${where.title}"` : ", in no section"}): names are unique across the menu`,
        );
      }
    }
  }
  return problems;
}

/**
 * Add Chez Pickle's chapter, groups and dishes where they are missing.
 * @returns {Promise<{ added: number, linked: boolean }>}
 */
export async function addChezPickleMenu(env, log = () => {}) {
  let state = await menu(env);
  const problems = clashes(state);
  if (problems.length) {
    throw new Error(
      `Chez Pickle's menu was not added, and nothing was changed:\n  ${problems.join("\n  ")}\nRename or move what is in the way in ops (Menu), then run this again.`,
    );
  }

  const popup = (await listPopupSeries(env)).find((series) => series.name === POPUP_NAME) || null;
  if (!popup) {
    log(
      `no pop-up kitchen named "${POPUP_NAME}" in Events (a series of that name marked as a pop-up kitchen): the chapter goes without one. Run 2026-11-10-a-series-categories first, or pick it later in ops (Configuration, Menu sections).`,
    );
  }

  let added = 0;
  let chapter = state.bySlug.get(CHAPTER.slug);
  if (!chapter) {
    chapter = await createMenuSection(env, {
      title: CHAPTER.title,
      slug: CHAPTER.slug,
      subtitle: CHAPTER.subtitle,
      kind: "kitchen",
      ...(popup ? { popupSeriesId: popup.id } : {}),
    });
    added += 1;
  } else {
    log(`chapter "${chapter.title}" is already there: left as it is`);
    if (chapter.kind !== "kitchen") log(`  note: it is marked Drinks, not Food; change it in ops if that is wrong`);
    if (popup && !chapter.popupSeriesId && chapter.kind === "kitchen") {
      await updateMenuSection(env, chapter._id, { popupSeriesId: popup.id });
    }
  }
  const linked = Boolean(popup && (chapter.popupSeriesId || popup.id));

  for (const group of CHAPTER.groups) {
    state = await menu(env);
    let section = state.bySlug.get(group.slug);
    if (!section) {
      section = await createMenuSection(env, {
        title: group.title,
        slug: group.slug,
        subtitle: group.subtitle || "",
        parentId: chapter._id,
      });
      added += 1;
    }
    for (const dish of group.items) {
      const there = state.items.find((item) => item.sectionId === section._id && namesClash(item.name, dish.name));
      if (there) {
        log(`"${there.name}" is already in ${group.title}: left as it is`);
        continue;
      }
      const item = await createMenuItem(env, {
        name: dish.name,
        description: dish.description,
        price: dish.price,
        sectionId: section._id,
        // The digital menu only: no print, and food gets no POS placement.
        placements: [{ channel: "digital", sectionId: section._id }],
      });
      const pos = (item.placements || []).filter((row) => row.channel !== "digital");
      if (pos.length) throw new Error(`"${dish.name}" was given a ${pos[0].channel} placement; it should only be on the digital menu.`);
      added += 1;
    }
  }
  return { added, linked };
}

export async function up({ env, d1, processEnv, log, dryRun = false }) {
  const data = await opsDataForMigration({ env, d1, dryRun, log, processEnv });
  const { added, linked } = await addChezPickleMenu(data.env, log);
  if (!added) log("Nothing to add: Chez Pickle's menu is already there.");
  else {
    log(`${added} section${added === 1 ? "" : "s"} and dishes ${dryRun ? "to add" : "added"}, on the digital menu only: not on print, not on the till.`);
    log("The website follows with the menu's next Update website (ops, Menu).");
  }
  if (linked) log(`The chapter belongs to the "${POPUP_NAME}" pop-up kitchen.`);
}
