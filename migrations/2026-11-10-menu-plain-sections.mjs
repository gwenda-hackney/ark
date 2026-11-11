/**
 * The drinks menu in plain words: cocktails, beer and spirits. Gwenda is a
 * social, not a cocktail bar, so the chapters lose their fancy names and
 * lines, beer gets a chapter of its own, and the order becomes Our
 * Cocktails, The Classics, Beer, Spirits, No Booze.
 *
 * Sections are found by slug and keep it (a slug is a web address), along
 * with their ids, drinks and Sanity links. A name or line is only changed
 * from the old text to the new: one the owner has since edited in ops is
 * left, and said so. Everything goes through the menu's use cases
 * (menu-store.js); no drink is touched, so nothing changes on the till.
 *
 * Safe to run again: it writes only what differs. Supports --dry-run (with
 * --only), which runs the same steps on a copy (scripts/lib/d1-rehearsal.mjs).
 * The website follows with the menu's next Update website.
 */
import { flattenMenuSections } from "../ops/site/src/menu/menu-sections.js";
import {
  createMenuSection,
  loadMenuTree,
  updateMenuSection,
} from "../ops/site/src/menu/server/menu-store.js";
import { opsDataForMigration } from "../scripts/lib/ops-migration.mjs";

export const app = "ops";
export const phase = "post";
export const about = "Menu: plain section names, a Beer chapter, and the new order";

/** The chapters, in the order guests see them. `was`: the text this replaces. */
export const CHAPTERS = [
  {
    slug: "our-formulas",
    title: "Our Cocktails",
    subtitle: "Made up here. They change now and then.",
    was: {
      title: "Our Formulas",
      subtitle: "The definitive liquid experience. Elegant expressions crafted for candlelit evenings.",
    },
  },
  {
    slug: "by-the-book",
    title: "The Classics",
    subtitle: "Spritz, Negroni, sours. The ones you know.",
    was: {
      title: "By the Book",
      subtitle: "The traditional liquid ritual. Timeless serves, made as you know them.",
    },
  },
  // New: made here when it is missing.
  { slug: "beer", title: "Beer", subtitle: "On draught and in bottles.", create: true },
  {
    slug: "the-cabinet",
    title: "Spirits",
    subtitle: "Tequila, rum, whiskey, and something for after.",
    was: {
      title: "The Cabinet",
      subtitle: "The liquid cabinet. Agave, rum, whiskey, and digestivi for the quieter close.",
    },
  },
  {
    slug: "free-of-spirit",
    title: "No Booze",
    subtitle: "Nothing in them. Still worth ordering.",
    was: {
      title: "Free of Spirit",
      subtitle: "The mindful liquid experience. Zero-proof expressions crafted with the same complexity.",
    },
  },
];

/** Groups that get a plain name, and the two that move under Beer (in this order). */
export const GROUPS = [
  { slug: "draught-beer", title: "On Draught", was: { title: "Draught Beer" }, under: "beer" },
  { slug: "bottled-beer", title: "In Bottles", was: { title: "Bottled Beer" }, under: "beer" },
  { slug: "amaro-digestivi", title: "After Dinner", was: { title: "Amaro & Digestivi" } },
];

/**
 * The new text for one field, or undefined to leave it: only the old text is
 * replaced. Text that is neither the old nor the new was edited in ops since.
 */
function replaced(section, key, spec, note) {
  const current = section[key] || "";
  if (!(key in spec) || current === spec[key]) return undefined;
  if (spec.was && current === (spec.was[key] || "")) return spec[key];
  note(`left alone: ${spec.slug}'s ${key === "title" ? "name" : "line"} is "${current}", neither the old text nor "${spec[key]}" (edited in ops since?)`);
  return undefined;
}

async function sectionsBySlug(env) {
  const flat = flattenMenuSections((await loadMenuTree(env)).sections);
  return { flat, bySlug: new Map(flat.map((section) => [section.slug, section])) };
}

const byOrder = (a, b) => (a.orderRank ?? 0) - (b.orderRank ?? 0) || Number(a._id) - Number(b._id);

/**
 * Every section's place, 1, 2, 3…: the chapters in CHAPTERS' order, then any
 * other chapter as it was; each chapter followed by its groups as they were,
 * but Beer's start with GROUPS' two. `parentOf`: section id → its chapter's
 * id once the moves are made.
 */
export function plainOrder(flat, parentOf) {
  const slugs = CHAPTERS.map((chapter) => chapter.slug);
  const rank = (section, list) => {
    const index = list.indexOf(section.slug);
    return index < 0 ? list.length : index;
  };
  const chapters = flat
    .filter((section) => !parentOf.get(section._id))
    .sort((a, b) => rank(a, slugs) - rank(b, slugs) || byOrder(a, b));
  const beerGroups = GROUPS.filter((group) => group.under === "beer").map((group) => group.slug);
  const order = new Map();
  let next = 1;
  for (const chapter of chapters) {
    order.set(chapter._id, next++);
    const groups = flat
      .filter((section) => parentOf.get(section._id) === chapter._id)
      .sort((a, b) => (chapter.slug === "beer" ? rank(a, beerGroups) - rank(b, beerGroups) : 0) || byOrder(a, b));
    for (const group of groups) order.set(group._id, next++);
  }
  return order;
}

/**
 * Make the menu's sections plain, through the menu's use cases. `env` is
 * what they take (its repository says where the menu lives).
 * @returns {Promise<{ changed: number }>}
 */
export async function plainSections(env, log = () => {}) {
  let { bySlug } = await sectionsBySlug(env);

  // Everything this renames or moves must be there: no guessing.
  const expected = [...CHAPTERS.filter((chapter) => !chapter.create), ...GROUPS];
  const absent = expected.filter((spec) => !bySlug.has(spec.slug)).map((spec) => spec.slug);
  if (absent.length) {
    throw new Error(
      `Menu sections not found by slug: ${absent.join(", ")}. Nothing was changed. Check Configuration, Menu sections in ops; this migration expects the menu as it was on 2026-11-10.`,
    );
  }
  for (const chapter of CHAPTERS) {
    const found = bySlug.get(chapter.slug);
    if (found?.parentId) {
      throw new Error(`"${found.title}" (${chapter.slug}) is a group under another chapter; it must be a chapter. Nothing was changed.`);
    }
  }
  for (const group of GROUPS) {
    const found = bySlug.get(group.slug);
    if (!found.parentId) {
      throw new Error(`"${found.title}" (${group.slug}) is a chapter; it must be a group. Nothing was changed.`);
    }
  }

  let changed = 0;
  for (const chapter of CHAPTERS.filter((spec) => spec.create && !bySlug.has(spec.slug))) {
    await createMenuSection(env, { title: chapter.title, slug: chapter.slug, subtitle: chapter.subtitle, kind: "bar" });
    changed += 1;
  }
  const loaded = await sectionsBySlug(env);
  bySlug = loaded.bySlug;

  const notes = [];
  const note = (line) => notes.push(line);
  const wanted = new Map(); // section id → the fields to send
  const want = (section, fields) => wanted.set(section._id, { ...wanted.get(section._id), ...fields });
  const parentOf = new Map(loaded.flat.map((section) => [section._id, section.parentId || null]));

  for (const chapter of CHAPTERS) {
    const section = bySlug.get(chapter.slug);
    const title = replaced(section, "title", chapter, note);
    const subtitle = replaced(section, "subtitle", chapter, note);
    if (title !== undefined) want(section, { title });
    if (subtitle !== undefined) want(section, { subtitle });
  }
  for (const group of GROUPS) {
    const section = bySlug.get(group.slug);
    const title = replaced(section, "title", group, note);
    if (title !== undefined) want(section, { title });
    const parent = group.under ? bySlug.get(group.under) : null;
    if (parent && section.parentId !== parent._id) {
      want(section, { parentId: parent._id });
      parentOf.set(section._id, parent._id);
    }
  }
  for (const [id, order] of plainOrder(loaded.flat, parentOf)) {
    const section = loaded.flat.find((row) => row._id === id);
    if (section.orderRank !== order) want(section, { orderRank: order });
  }

  // Chapters before groups, so a group never moves under a chapter that isn't one yet.
  const ids = [...wanted.keys()].sort((a, b) => Number(Boolean(parentOf.get(a))) - Number(Boolean(parentOf.get(b))));
  for (const id of ids) {
    await updateMenuSection(env, id, wanted.get(id));
    changed += 1;
  }
  for (const line of notes) log(line);
  return { changed };
}

export async function up({ env, d1, processEnv, log, dryRun = false }) {
  const data = await opsDataForMigration({ env, d1, dryRun, log, processEnv });
  const { changed } = await plainSections(data.env, log);
  if (!changed) log("Nothing to do: the sections are already plain, with Beer in place.");
  else {
    log(`${changed} section${changed === 1 ? "" : "s"} ${dryRun ? "to change" : "changed"}. No drink was touched, so nothing changes on the till.`);
    log("The website follows with the menu's next Update website (ops, Menu).");
  }
}
