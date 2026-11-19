/**
 * Promote something in a one-off email (#348): pick what, and a template
 * builds the draft from what ops already knows about it, in the sections the
 * editor uses (shared/email/sections.js). The draft is then the owner's to
 * change, test and send like any other.
 *
 * One template so far: a pop-up kitchen (its picture, who and when, a few
 * dishes from its menu, and the ways to its menu and to book). Events and
 * occasions can join PROMOTE_TEMPLATES later with the same two parts:
 * `choices` (what can be picked) and `draft` (the email for one of them).
 */
import { getEvent, listEvents } from "../../events/server/event-store.js";
import { flattenMenuSections } from "../../menu/menu-sections.js";
import { loadMenuTree } from "../../menu/server/menu-store.js";
import { listMenus } from "../../menu/server/menus.js";
import { londonToday } from "../../../../../shared/forms/field-rules.js";
import { timeLabel } from "../../venue/hours-model.js";
import { refusal } from "./test-send.js";

/** Dishes the email lists from the pop-up's menu: enough to tempt, not the menu. */
export const PROMOTE_DISHES = 3;

const DAY_NAMES = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
const WEEK = Object.keys(DAY_NAMES);
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const text = (value) => String(value ?? "").trim();

/** "Mondays and Tuesdays", "Wednesdays to Sundays", "Thursdays". */
export function daysWords(weekdays = []) {
  const days = WEEK.filter((day) => weekdays.includes(day));
  if (!days.length) return "";
  const plural = (day) => `${DAY_NAMES[day]}s`;
  const run = days.length > 2 && days.every((day, i) => i === 0 || WEEK.indexOf(day) === WEEK.indexOf(days[i - 1]) + 1);
  if (run) return `${plural(days[0])} to ${plural(days.at(-1))}`;
  if (days.length === 1) return plural(days[0]);
  return `${days.slice(0, -1).map(plural).join(", ")} and ${plural(days.at(-1))}`;
}

/** "Monday 23 November". */
export function dateWords(iso) {
  const [year, month, day] = String(iso).split("-").map(Number);
  if (!year || !month || !day) return "";
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${DAY_NAMES[WEEK[(weekday + 6) % 7]]} ${day} ${MONTHS[month - 1]}`;
}

/**
 * When it cooks, in words: "Mondays and Tuesdays from Monday 23 November,
 * noon – 9pm"; a one-off "Saturday 5 December, 6pm – 10pm".
 */
export function popupWhen(event, today = londonToday()) {
  const hours = event.startTime && event.endTime ? `${timeLabel(event.startTime)} – ${timeLabel(event.endTime)}` : "";
  const unit = String(event.repeatUnit || "").toLowerCase();
  let when;
  if (unit === "once" || !unit || unit === "none") when = dateWords(event.startsOn);
  else {
    const days = unit === "week" ? daysWords(event.weekdays) : "";
    const from = event.startsOn && event.startsOn > today ? ` from ${dateWords(event.startsOn)}` : "";
    const until = event.endsOn ? ` until ${dateWords(event.endsOn)}` : "";
    when = `${days || "Regularly"}${from}${until}`;
  }
  return [when, hours].filter(Boolean).join(", ");
}

/** Its dishes, first group first, as the menu orders them: { name, price, description }. */
async function popupDishes(env, eventId) {
  const menus = (await listMenus(env)).menus.filter(
    (menu) => menu.kind === "kitchen" && String(menu.popupSeriesId) === String(eventId),
  );
  if (!menus.length) return [];
  const { sections, items } = await loadMenuTree(env);
  const flat = flattenMenuSections(sections);
  const ours = new Set(menus.map((menu) => String(menu.id)));
  const chapters = flat.filter((section) => !section.parentId && ours.has(String(section.menuId ?? "")));
  const order = [];
  for (const chapter of chapters) {
    order.push(chapter._id);
    for (const group of flat.filter((section) => section.parentId === chapter._id)) order.push(group._id);
  }
  return order
    .flatMap((sectionId) => items.filter((item) => item.sectionId === sectionId))
    .filter((item) => text(item.name))
    .map((item) => ({ name: text(item.name), price: text(item.price), description: text(item.description) }));
}

const price = (value) => (value ? `£${value}` : "");

/**
 * The pop-up kitchen's email: its picture, "New at Gwenda" while it hasn't
 * started (else "In the kitchen"), its line and when, a few dishes, a second
 * picture from its gallery, then See the menu and Book a table.
 * @param {{ origin: string }} site the website the links go to
 */
export async function popupDraft(env, id, { site, today = londonToday() }) {
  const event = await getEvent(env, id).catch(() => null);
  if (!event || event.deletedAt || event.category !== "popup") throw refusal(404, "That pop-up kitchen isn't in ops any more.");
  const name = event.name;
  const when = popupWhen(event, today);
  const page = `${site.origin}/whats-on/${event.slug}/`;
  const isNew = Boolean(event.startsOn && event.startsOn > today);
  const dishes = (await popupDishes(env, event.id)).slice(0, PROMOTE_DISHES);
  const picture = event.mainImage?.asset || event.logo?.asset || "";
  const second = (event.gallery || []).find((photo) => photo.asset && photo.asset !== picture)?.asset || "";
  const line = text(event.shortDescription) || text(event.description);
  const sections = [
    ...(picture ? [{ kind: "image", assetId: picture, alt: name }] : []),
    { kind: "heading", text: `${isNew ? "New at Gwenda" : "In the kitchen"}: ${name}` },
    { kind: "copy", text: [line, when ? `**${when}.**` : ""].filter(Boolean).join("\n\n") },
    ...(dishes.length
      ? [
          { kind: "heading", text: "On the menu" },
          {
            kind: "copy",
            text: dishes
              .map((dish) => `**${dish.name}**${dish.price ? ` ${price(dish.price)}` : ""}${dish.description ? `: ${dish.description}` : ""}`)
              .join("\n\n"),
          },
        ]
      : []),
    ...(second ? [{ kind: "image", assetId: second, alt: `Food from ${name}` }] : []),
    { kind: "button", label: "See the menu", link: page },
    { kind: "button", label: "Book a table", link: `${site.origin}/bookings` },
  ];
  const days = event.repeatUnit === "week" ? daysWords(event.weekdays) : "";
  return {
    subject: `${isNew ? "New at Gwenda" : "In the kitchen"}: ${name}${days ? `, ${days}` : ""}`,
    previewText: line.split(/(?<=[.!?])\s/)[0] || when,
    sections,
  };
}

/** Pop-up kitchens with nights to come, soonest first: { id, name, when }. */
export async function popupChoices(env, { today = londonToday() } = {}) {
  const events = await listEvents(env);
  return events
    .filter((event) => event.category === "popup" && !event.deletedAt)
    .map((event) => ({ event, next: (event.dates || []).map((night) => night.date).find((date) => date >= today) || "" }))
    .filter(({ next }) => next)
    .sort((a, b) => a.next.localeCompare(b.next))
    .map(({ event }) => ({ id: String(event.id), name: event.name, when: popupWhen(event, today) }));
}

/** What can be promoted, by template. */
export const PROMOTE_TEMPLATES = {
  popup: { label: "A pop-up kitchen", choices: popupChoices, draft: popupDraft },
};

/** Every template with what it can promote now, for the Promote dialog. */
export async function promoteChoices(env, options = {}) {
  const templates = [];
  for (const [id, template] of Object.entries(PROMOTE_TEMPLATES)) {
    templates.push({ id, label: template.label, choices: await template.choices(env, options) });
  }
  return { templates };
}

/** The draft for one thing, from its template; a 400 for a template that isn't one. */
export async function promoteDraft(env, { template, id }, options) {
  const chosen = PROMOTE_TEMPLATES[String(template)];
  if (!chosen) throw refusal(400, "Pick what to promote.");
  if (!text(id)) throw refusal(400, "Pick which one to promote.");
  return chosen.draft(env, text(id), options);
}
