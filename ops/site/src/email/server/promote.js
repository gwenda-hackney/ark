/**
 * Promote something in a one-off email (#348): pick what, and a template
 * builds the draft from what ops already knows about it, in the sections the
 * editor uses (shared/email/sections.js). The draft is then the owner's to
 * change, test and send like any other.
 *
 * Three templates: a deal (its picture, the deal, when it runs, its page and
 * booking), a night (its picture, name and guest, when, any offer, the
 * running order, and the ways to its page and to book) and a pop-up kitchen
 * (its picture, who and when, a few dishes from its menu, and the ways to its
 * menu and to book). Occasions can join PROMOTE_TEMPLATES later
 * with the same two parts: `choices` (what can be picked) and `draft` (the
 * email for one of them).
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

/** Its first night: its earliest date, a night added by hand included, else when its schedule starts. */
export function firstNight(event) {
  return (event.dates || []).map((night) => night.date).sort()[0] || event.startsOn || "";
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
 * noon – 9pm"; a one-off "Saturday 5 December, 6pm – 10pm"; with no end time
 * just when it starts.
 */
export function popupWhen(event, today = londonToday()) {
  const start = event.startTime ? timeLabel(event.startTime) : "";
  const hours = start && event.endTime ? `${start} – ${timeLabel(event.endTime)}` : start;
  const unit = String(event.repeatUnit || "").toLowerCase();
  let when;
  if (unit === "once" || !unit || unit === "none") when = dateWords(event.startsOn);
  else {
    const days = unit === "week" ? daysWords(event.weekdays) : "";
    const first = firstNight(event);
    const from = first && first > today ? ` from ${dateWords(first)}` : "";
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

/** The inbox's preview line: the first sentence of its line, as plain words (no **bold** or [link](…)). */
export function previewLine(line, fallback = "") {
  const plain = text(line)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|[*_`])/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.split(/(?<=[.!?])\s/)[0] || fallback;
}

/** The line after its own: the same for every kitchen, so it's never a claim about one. */
export const POPUP_NUDGE = "Come hungry, bring your mates, and stay for a drink.";

/**
 * The pop-up kitchen's email, with some go in it: its picture, our logo × its logo, "
 * Gwenda is teaming up with …!" while it hasn't started (else "Gwenda has teamed up with …!"), its line, when, and a nudge;
 * a few dishes to order first, a second picture from its gallery, then the
 * whole menu and Book a table.
 * @param {{ origin: string }} site the website the links go to
 */
export async function popupDraft(env, id, { site, today = londonToday() }) {
  const event = await getEvent(env, id).catch(() => null);
  if (!event || event.deletedAt || event.category !== "popup") throw refusal(404, "That pop-up kitchen isn't in ops any more.");
  const name = event.name;
  const when = popupWhen(event, today);
  const page = `${site.origin}/whats-on/${event.slug}/`;
  const first = firstNight(event);
  const isNew = Boolean(first && first > today);
  const dishes = (await popupDishes(env, event.id)).slice(0, PROMOTE_DISHES);
  const logo = event.logo?.asset || "";
  const picture = event.mainImage?.asset || "";
  const second = (event.gallery || []).find((photo) => photo.asset && photo.asset !== picture)?.asset || "";
  const line = text(event.shortDescription) || text(event.description);
  /** Gwenda and the pop-up together: "Gwenda is teaming up with Pinsa A Roma!", once it has started "Gwenda has teamed up with …!" */
  const headline = `Gwenda ${isNew ? "is teaming up" : "has teamed up"} with ${name}!`;
  const sections = [
    ...(picture ? [{ kind: "image", assetId: picture, alt: name, size: "full" }] : []),
    // Our logo × its logo: a pop-up kitchen is the two of us together.
    ...(logo ? [{ kind: "row", crop: false, cells: [{ kind: "logo", width: "medium" }, { kind: "words", text: "×", look: "big", width: "small" }, { kind: "picture", assetId: logo, alt: name, width: "medium" }] }] : []),
    { kind: "heading", text: headline },
    { kind: "copy", text: [line, when ? `**${when}.**` : "", POPUP_NUDGE].filter(Boolean).join("\n\n") },
    ...(dishes.length
      ? [
          { kind: "heading", text: "What to order first" },
          {
            kind: "copy",
            text: dishes
              .map((dish) => `**${dish.name}**${dish.price ? ` ${price(dish.price)}` : ""}${dish.description ? `: ${dish.description}` : ""}`)
              .join("\n\n"),
          },
        ]
      : []),
    ...(second ? [{ kind: "image", assetId: second, alt: `Food from ${name}`, size: "full" }] : []),
    { kind: "button", label: "See the whole menu →", link: page, look: "link" },
    { kind: "booking" },
  ];
  const days = event.repeatUnit === "week" ? daysWords(event.weekdays) : "";
  return {
    name: `${name} promo`,
    subject: `${headline}${days ? ` ${days}` : ""}`,
    previewText: previewLine(line, when),
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

/** A night is any series that isn't a deal or a pop-up kitchen (one saved before categories is a night). */
const isNight = (event) => event.category !== "promotion" && event.category !== "popup";

/** Its next night from today, as a date ("" when it has none to come). */
const nextNight = (event, today) => (event.dates || []).map((night) => night.date).sort().find((date) => date >= today) || "";

/** The line after its own: the same for every night, so it's never a claim about one. */
export const NIGHT_NUDGE = "Bring your mates and come early for a good spot.";

/** "**7pm** DJ Ana" a line, the running order as the guest reads it. */
function runningOrder(schedule = []) {
  return schedule
    .map((entry) => {
      const time = entry.startTime ? `${timeLabel(entry.startTime)}${entry.endTime ? ` – ${timeLabel(entry.endTime)}` : ""}` : "";
      return time ? `**${time}** ${entry.label}` : `**${entry.label}**`;
    })
    .join("\n\n");
}

/**
 * A night's email: its picture, its name (with its guest), its line, when,
 * any offer and a nudge; the running order when it has one, a second picture
 * from its gallery, then a button to its page and Book a table.
 * @param {{ origin: string }} site the website the links go to
 */
export async function nightDraft(env, id, { site, today = londonToday() }) {
  const event = await getEvent(env, id).catch(() => null);
  if (!event || event.deletedAt || !isNight(event)) throw refusal(404, "That night isn't in ops any more.");
  const name = event.name;
  const artist = text(event.artist);
  const when = popupWhen(event, today);
  const page = `${site.origin}/whats-on/${event.slug}/`;
  const picture = event.mainImage?.asset || "";
  const second = (event.gallery || []).find((photo) => photo.asset && photo.asset !== picture)?.asset || "";
  const line = text(event.shortDescription) || text(event.description);
  const offer = text(event.offer);
  const schedule = runningOrder(event.nightSchedule || []);
  const headline = artist && !name.toLowerCase().includes(artist.toLowerCase()) ? `${name} with ${artist}` : name;
  const once = !event.repeatUnit || ["once", "none"].includes(String(event.repeatUnit).toLowerCase());
  const next = nextNight(event, today) || event.startsOn;
  const sections = [
    ...(picture ? [{ kind: "image", assetId: picture, alt: name, size: "full" }] : []),
    { kind: "heading", text: headline },
    { kind: "copy", text: [line, when ? `**${when}.**` : "", offer ? `**${offer}.**` : "", NIGHT_NUDGE].filter(Boolean).join("\n\n") },
    ...(schedule ? [{ kind: "heading", text: "On the night" }, { kind: "copy", text: schedule }] : []),
    ...(second ? [{ kind: "image", assetId: second, alt: name, size: "full" }] : []),
    { kind: "button", label: "More about the night →", link: page, look: "link" },
    { kind: "booking" },
  ];
  const days = event.repeatUnit === "week" ? daysWords(event.weekdays) : "";
  return {
    name: `${name} promo`,
    subject: `${headline} at Gwenda, ${once || !days ? dateWords(next) : days}`,
    previewText: previewLine(line, when),
    sections,
  };
}

/** Nights with one to come, soonest first: { id, name, when }. */
export async function nightChoices(env, { today = londonToday() } = {}) {
  const events = await listEvents(env);
  return events
    .filter((event) => isNight(event) && !event.deletedAt)
    .map((event) => ({ event, next: nextNight(event, today) }))
    .filter(({ next }) => next)
    .sort((a, b) => a.next.localeCompare(b.next))
    .map(({ event }) => ({ id: String(event.id), name: event.name, when: popupWhen(event, today) }));
}

/** The line after a deal's own: the same for every deal. */
export const DEAL_NUDGE = "Grab your mates and make the most of it.";

/**
 * A deal's email: its picture, its name, the deal in bold, its line, when it
 * runs and a nudge; a second picture from its gallery, then its page and
 * Book a table.
 * @param {{ origin: string }} site the website the links go to
 */
export async function dealDraft(env, id, { site, today = londonToday() }) {
  const event = await getEvent(env, id).catch(() => null);
  if (!event || event.deletedAt || event.category !== "promotion") throw refusal(404, "That deal isn't in ops any more.");
  const name = event.name;
  const offer = text(event.offer);
  const when = popupWhen(event, today);
  const page = `${site.origin}/whats-on/${event.slug}/`;
  const picture = event.mainImage?.asset || "";
  const second = (event.gallery || []).find((photo) => photo.asset && photo.asset !== picture)?.asset || "";
  const line = text(event.shortDescription) || text(event.description);
  const once = !event.repeatUnit || ["once", "none"].includes(String(event.repeatUnit).toLowerCase());
  const days = event.repeatUnit === "week" ? daysWords(event.weekdays) : "";
  const next = nextNight(event, today) || event.startsOn;
  const sections = [
    ...(picture ? [{ kind: "image", assetId: picture, alt: name, size: "full" }] : []),
    { kind: "heading", text: name },
    { kind: "copy", text: [offer ? `**${offer}.**` : "", line, when ? `**${when}.**` : "", DEAL_NUDGE].filter(Boolean).join("\n\n") },
    ...(second ? [{ kind: "image", assetId: second, alt: name, size: "full" }] : []),
    { kind: "button", label: "More about the deal →", link: page, look: "link" },
    { kind: "booking" },
  ];
  return {
    name: `${name} promo`,
    subject: `${name} at Gwenda${offer ? `: ${offer}` : ""}, ${once || !days ? dateWords(next) : days}`,
    previewText: previewLine(line, when),
    sections,
  };
}

/** Deals with a day to come, soonest first: { id, name, when }. */
export async function dealChoices(env, { today = londonToday() } = {}) {
  const events = await listEvents(env);
  return events
    .filter((event) => event.category === "promotion" && !event.deletedAt)
    .map((event) => ({ event, next: nextNight(event, today) }))
    .filter(({ next }) => next)
    .sort((a, b) => a.next.localeCompare(b.next))
    .map(({ event }) => ({ id: String(event.id), name: event.name, when: popupWhen(event, today) }));
}

/** What can be promoted, by template. */
export const PROMOTE_TEMPLATES = {
  night: { label: "A night", choices: nightChoices, draft: nightDraft },
  deal: { label: "A deal", choices: dealChoices, draft: dealDraft },
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

/** Which template promotes a series of this category: a pop-up, a deal, else a night. */
export function templateFor(category) {
  return category === "popup" ? "popup" : category === "promotion" ? "deal" : "night";
}

/**
 * The draft for one thing, from its template; a 400 for a template that isn't
 * one. With no template (the event editor's Promote button) the series' own
 * category picks it.
 */
export async function promoteDraft(env, { template, id }, options) {
  if (!text(template) && text(id)) {
    const event = await getEvent(env, text(id)).catch(() => null);
    if (!event || event.deletedAt) throw refusal(404, "That isn't in ops any more.");
    template = templateFor(event.category);
  }
  const chosen = PROMOTE_TEMPLATES[String(template)];
  if (!chosen) throw refusal(400, "Pick what to promote.");
  if (!text(id)) throw refusal(400, "Pick which one to promote.");
  return chosen.draft(env, text(id), options);
}
