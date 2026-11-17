/**
 * Menus (#305): what guests see as one menu, such as Drinks, or a pop-up
 * kitchen's Chez Pickle, with its name, drinks or food, dates, days and
 * pop-up kitchen. Its sections are the chapters that name it (menuId) and
 * their groups; a chapter is drinks or food, and a pop-up kitchen's, as its
 * menu is (menu-model.js). Stored through the MenuRepository (collection
 * menus), records in, the shapes ops shows out.
 *
 * The rules about dates and days are the menu model's (menu-days.js, via
 * menu-model.js). Events reach menus only through popup-menus.js.
 */
import { londonToday } from "../../../../../shared/forms/field-rules.js";
import { listPopupSeries } from "../../events/server/popups.js";
import { itemSlug } from "../item-key.js";
import { MENU_STATUS_LABELS, menuDatesLabel, menuDaysLabel } from "../menu-days.js";
import { flattenMenuSections } from "../menu-sections.js";
import {
  chapterFieldsOf,
  cleanMenuDate,
  cleanMenuDays,
  cleanSectionKind,
  menuDayList,
  menuStatus,
} from "./menu-model.js";
import { menuRepository } from "./menu-repository.js";
import { kindInput, loadMenuTree, popupInput } from "./menu-store.js";

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function text(value) {
  return value == null ? "" : String(value).trim();
}

const POPUP_NEEDS_FOOD = "Only a Food menu can belong to a pop-up kitchen.";

/** Menus in their order (then by name), as ops lists them. */
function byOrder(a, b) {
  return (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.id - b.id;
}

/**
 * How many items each menu has: an item counts once on each menu any of its
 * placements, or its own section, puts it in.
 * @returns {Map<number, number>} menu id → items
 */
function itemCounts(sections, items) {
  const menuOfSection = new Map(flattenMenuSections(sections).map((section) => [section._id, section.menuId]));
  const counts = new Map();
  for (const item of items) {
    const sectionIds = new Set([
      item.sectionId,
      ...(item.placements || []).filter((row) => row.channel !== "pos").map((row) => row.sectionId),
    ]);
    const menus = new Set([...sectionIds].map((id) => menuOfSection.get(String(id))).filter(Boolean));
    for (const menuId of menus) counts.set(Number(menuId), (counts.get(Number(menuId)) ?? 0) + 1);
  }
  return counts;
}

/**
 * A menu record → the menu ops shows: its fields, what it says about its
 * dates and days, and its status on `today`.
 */
export function mapMenu(record, { today = londonToday(), popupNames = new Map(), items = 0, chapters = 0 } = {}) {
  const status = menuStatus(record, today);
  const popupSeriesId = record.popupSeriesId != null ? String(record.popupSeriesId) : null;
  return {
    id: String(record.id),
    name: text(record.name),
    slug: text(record.slug),
    kind: cleanSectionKind(record.kind),
    startsOn: cleanMenuDate(record.startsOn),
    endsOn: cleanMenuDate(record.endsOn),
    days: menuDayList(record.days),
    popupSeriesId,
    popupName: (popupSeriesId && popupNames.get(popupSeriesId)) || "",
    orderRank: record.order ?? 0,
    status,
    statusLabel: MENU_STATUS_LABELS[status],
    datesLabel: menuDatesLabel(record),
    daysLabel: menuDaysLabel(record.days),
    itemCount: items,
    chapterCount: chapters,
  };
}

/** The pop-up kitchens a menu can belong to, with when each cooks (to start a menu from). */
async function popupChoices(env, today) {
  return (await listPopupSeries(env, { today })).map(({ id, name, startsOn, endsOn, days }) => ({
    id,
    name,
    startsOn,
    endsOn,
    days,
  }));
}

/**
 * Every menu, in order, with its item count and status, and the pop-up
 * kitchens a menu can belong to.
 */
export async function listMenus(env, { today = londonToday() } = {}) {
  const [{ menus, sections, items }, popups] = await Promise.all([loadMenuTree(env), popupChoices(env, today)]);
  const popupNames = new Map(popups.map((popup) => [popup.id, popup.name]));
  const counts = itemCounts(sections, items);
  return {
    menus: [...menus].sort(byOrder).map((record) =>
      mapMenu(record, {
        today,
        popupNames,
        items: counts.get(record.id) ?? 0,
        chapters: sections.filter((chapter) => chapter.menuId === String(record.id)).length,
      }),
    ),
    popups,
  };
}

/** One menu with its sections (chapters and their groups, each with its items), and the rest of `listMenus`. */
export async function getMenu(env, id, { today = londonToday() } = {}) {
  const [{ menus, sections, items }, popups] = await Promise.all([loadMenuTree(env), popupChoices(env, today)]);
  const record = menus.find((menu) => menu.id === Number(id));
  if (!record) fail(404, "Menu not found.");
  const popupNames = new Map(popups.map((popup) => [popup.id, popup.name]));
  const counts = itemCounts(sections, items);
  const chapters = sections.filter((chapter) => chapter.menuId === String(record.id));
  return {
    menu: mapMenu(record, { today, popupNames, items: counts.get(record.id) ?? 0, chapters: chapters.length }),
    sections: chapters,
    menus: [...menus].sort(byOrder).map((menu) => mapMenu(menu, { today, popupNames })),
    popups,
  };
}

/**
 * The fields a save writes, from what it sent and the menu as it is
 * (`current`, empty for a new one). Refuses a menu with no name, an end
 * before its start, or a pop-up kitchen for drinks.
 */
async function menuFieldsFrom(env, input, current = {}) {
  const has = (key) => input[key] !== undefined;
  const name = has("name") ? text(input.name) : text(current.name);
  if (!name) fail(400, "Give the menu a name.");
  const kind = has("kind") && text(input.kind) ? kindInput(input.kind) : cleanSectionKind(current.kind);
  const date = (key, label) => {
    if (!has(key)) return cleanMenuDate(current[key]);
    const value = cleanMenuDate(input[key]);
    if (text(input[key]) && !value) fail(400, `${label} isn't a date.`);
    return value;
  };
  const startsOn = date("startsOn", "The start date");
  const endsOn = date("endsOn", "The end date");
  if (startsOn && endsOn && endsOn < startsOn) fail(400, "The end date is before the start date.");
  const popupSeriesId = has("popupSeriesId") ? await popupInput(env, input.popupSeriesId) : (current.popupSeriesId ?? null);
  if (popupSeriesId && kind !== "kitchen") fail(400, POPUP_NEEDS_FOOD);
  return {
    name,
    kind,
    startsOn,
    endsOn,
    days: has("days") ? cleanMenuDays(input.days) : cleanMenuDays(current.days),
    popupSeriesId,
  };
}

function assertUniqueMenu(menus, { name, slug }, exceptId) {
  const clash = menus.find(
    (menu) =>
      menu.id !== exceptId &&
      (itemSlug(menu.slug) === slug || itemSlug(menu.name) === itemSlug(name)),
  );
  if (clash) fail(409, `There's already a menu called ${clash.name}. Give this one another name.`);
}

/** Add a menu: every day and ongoing unless the save says otherwise. */
export async function createMenu(env, input = {}) {
  const repo = menuRepository(env);
  const fields = await menuFieldsFrom(env, input);
  const slug = itemSlug(input.slug) || itemSlug(fields.name);
  if (!slug) fail(400, "Use letters or numbers in the menu's name.");
  const menus = await repo.list("menus");
  assertUniqueMenu(menus, { name: fields.name, slug });
  const order = menus.reduce((max, menu) => Math.max(max, menu.order ?? 0), 0) + 1;
  const record = await repo.create("menus", { ...fields, slug, order: Number(input.orderRank) || order });
  return (await getMenu(env, record.id)).menu;
}

/**
 * Change a menu. Its chapters follow: they keep a copy of its drinks or
 * food and pop-up kitchen for the code before menus, so a change to either
 * is written to them in the same save. Its web address (slug) stays when it
 * is renamed, as a section's does.
 */
export async function updateMenu(env, id, input = {}) {
  const repo = menuRepository(env);
  const current = await repo.get("menus", id);
  if (!current) fail(404, "Menu not found.");
  const fields = await menuFieldsFrom(env, input, current);
  const slug = itemSlug(input.slug) || current.slug || itemSlug(fields.name);
  const menus = await repo.list("menus");
  assertUniqueMenu(menus, { name: fields.name, slug }, current.id);
  if (input.orderRank != null && Number.isFinite(Number(input.orderRank))) fields.order = Number(input.orderRank);
  const chapters = (await repo.list("menu_sections", { menuId: current.id })).filter((section) => !section.parentId);
  const own = chapterFieldsOf(fields);
  await repo.write([
    { op: "update", collection: "menus", id: current.id, fields: { ...fields, slug } },
    ...chapters
      .filter((chapter) => chapter.kind !== own.kind || (chapter.popupSeriesId ?? null) !== own.popupSeriesId)
      .map((chapter) => ({ op: "update", collection: "menu_sections", id: chapter.id, fields: own })),
  ]);
  return (await getMenu(env, current.id)).menu;
}

/** Remove a menu with nothing on it. One with sections says to move or remove them first. */
export async function deleteMenu(env, id) {
  const repo = menuRepository(env);
  const current = await repo.get("menus", id);
  if (!current) fail(404, "Menu not found.");
  const chapters = await repo.list("menu_sections", { menuId: current.id });
  if (chapters.length) {
    fail(409, `${current.name || "This menu"} still has sections. Move them to another menu, or remove them, first.`);
  }
  await repo.remove("menus", current.id);
  return { id: String(current.id) };
}

/** `base`, or `base-2`, `base-3`…: the first `taken` (slugs) doesn't have, which it then has. */
function freeSlug(base, taken) {
  let slug = base;
  for (let n = 2; taken.has(slug); n += 1) slug = `${base}-${n}`;
  taken.add(slug);
  return slug;
}

/**
 * Copy menu: the next menu, started from an old one. It takes the menu's
 * name (as "<name> (copy)", or "(copy 2)"…), drinks or food, days and pop-up
 * kitchen, and its chapters and their groups with their names, lines and
 * order, each with its own web address. Not its dates, which are the new
 * run's to set, and not its items: an item will sit on several menus (#307),
 * so copying them would make two of each. It goes right after the original.
 */
export async function copyMenu(env, id) {
  const repo = menuRepository(env);
  const current = await repo.get("menus", id);
  if (!current) fail(404, "Menu not found.");
  const [menus, sectionRecords] = await Promise.all([repo.list("menus"), repo.list("menu_sections")]);
  const taken = (name) =>
    menus.some((menu) => itemSlug(menu.name) === itemSlug(name) || itemSlug(menu.slug) === itemSlug(name));
  const base = text(current.name) || "Menu";
  let name = `${base} (copy)`;
  for (let n = 2; taken(name); n += 1) name = `${base} (copy ${n})`;
  const after = current.order ?? 0;
  const fields = {
    name,
    slug: itemSlug(name),
    kind: cleanSectionKind(current.kind),
    startsOn: "",
    endsOn: "",
    days: cleanMenuDays(current.days),
    popupSeriesId: current.popupSeriesId ?? null,
    order: after + 1,
  };
  // Right after the original: the menus after it move down one.
  const [record] = await repo.write([
    { op: "create", collection: "menus", fields },
    ...menus
      .filter((menu) => menu.id !== current.id && (menu.order ?? 0) > after)
      .map((menu) => ({ op: "update", collection: "menus", id: menu.id, fields: { order: (menu.order ?? 0) + 1 } })),
  ]);

  // Its chapters, then their groups (a group needs its new chapter), in their order after every section there is.
  const sectionOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id - b.id;
  const chapters = sectionRecords
    .filter((section) => section.parentId == null && Number(section.menuId) === Number(current.id))
    .sort(sectionOrder);
  const chapterIds = new Set(chapters.map((chapter) => Number(chapter.id)));
  const groups = sectionRecords.filter((section) => chapterIds.has(Number(section.parentId))).sort(sectionOrder);
  const slugs = new Set(sectionRecords.map((section) => itemSlug(section.slug || section.name)).filter(Boolean));
  let order = sectionRecords.reduce((max, section) => Math.max(max, section.order ?? 0), 0);
  const copyOf = (section, own) => ({
    op: "create",
    collection: "menu_sections",
    fields: {
      name: text(section.name),
      slug: freeSlug(itemSlug(section.slug || section.name), slugs),
      subtitle: text(section.subtitle),
      order: (order += 1),
      ...own,
    },
  });
  const copies = chapters.length
    ? await repo.write(chapters.map((chapter) => copyOf(chapter, { parentId: null, menuId: record.id, ...chapterFieldsOf(fields) })))
    : [];
  const copyOfChapter = new Map(chapters.map((chapter, index) => [Number(chapter.id), copies[index].id]));
  if (groups.length) {
    await repo.write(
      groups.map((group) =>
        copyOf(group, { parentId: copyOfChapter.get(Number(group.parentId)), menuId: null, kind: "", popupSeriesId: null }),
      ),
    );
  }
  return (await getMenu(env, record.id)).menu;
}
