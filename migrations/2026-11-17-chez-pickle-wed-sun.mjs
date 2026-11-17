/**
 * Chez Pickle, the pop-up kitchen, cooks Wednesday to Sunday every week from
 * Wednesday 25 November 2026, with no end date. Until now it cooked on
 * Thursdays to the 26th (2026-11-11-chez-pickle-thursdays.mjs); the nights it
 * has already had (Thursdays the 12th and 19th) stay on it.
 *
 * It goes the way ops does it:
 *
 * 1. The schedule is saved through the editor's own save (event-store.js
 *    updateEvent): weekly on Wednesday to Sunday from the 25th, no end date
 *    (a rolling run: its nights reach 12 weeks ahead and grow as the days
 *    pass). Every night the old schedule had that the new one hasn't (the
 *    12th and 19th) is kept as a night added by hand (extraDates). Nights are
 *    known by their date, so each night either schedule has (the 26th) keeps
 *    its row, its web address and whatever was changed on it; none is lost.
 *    Only while it is still a Thursdays run; a schedule the owner has changed
 *    since is left as it is and the log says how it is now.
 * 2. Its Food menu (menus.js updateMenu, the Menus page's own save) runs on
 *    Wednesday to Sunday from the 12th, its first night, with no end date.
 *    Only while it is still on Thursdays; one the owner has changed since is
 *    left as it is. A menu's dates and days are not on the website, so there
 *    is nothing to publish for it.
 * 3. The website then gets the series as after any save (website-jobs.js),
 *    and Update website for this event when the setting website.auto_update
 *    is off (ops-migration.mjs putEventOnWebsiteNow).
 *
 * Found by its web address, /whats-on/chez-pickle, which dev and production
 * share; no Chez Pickle stops the deploy with a message saying so. Safe to
 * run again: once it is Wednesday to Sunday, its menu too, and the website is
 * in step, there is nothing to do, and a run that stopped halfway is finished.
 *
 * --dry-run (with --only) changes nothing anywhere: the saves run on a copy
 * of the data (scripts/lib/d1-rehearsal.mjs), and for the website it says
 * what would happen, since Sanity has no copy to rehearse on.
 */
import { expandSeriesOccurrenceDates, normalizeExtraDates } from "../ops/site/src/events/event-recurrence.js";
import { recurrenceLabel } from "../ops/site/src/events/server/event-content.js";
import { listEvents, updateEvent } from "../ops/site/src/events/server/event-store.js";
import { menuDatesLabel, menuDayList, menuDaysLabel } from "../ops/site/src/menu/menu-days.js";
import { listMenus, updateMenu } from "../ops/site/src/menu/server/menus.js";
import { eventInStepWithWebsite, opsDataForMigration, putEventOnWebsiteNow } from "../scripts/lib/ops-migration.mjs";

export const app = "ops";
export const phase = "post";
export const about = "Events: Chez Pickle cooks Wednesday to Sunday from 25 November, no end date; its Food menu too";

/** /whats-on/chez-pickle */
export const SLUG = "chez-pickle";
/** The first night of the new run. */
export const STARTS_ON = "2026-11-25";
/** It cooks Wednesday to Sunday. */
export const WEEKDAYS = ["wed", "thu", "fri", "sat", "sun"];
/** Its menu runs from its first night, the first Thursday. */
export const MENU_STARTS_ON = "2026-11-12";
/** The nights the log lists: through the end of December. */
export const SHOW_UNTIL = "2026-12-31";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const weekday = (date) => DAY_NAMES[new Date(`${date}T12:00:00Z`).getUTCDay()];
const title = (event) => `"${event.name}" (event ${event.id})`;
const unit = (event) => String(event.repeatUnit || "none").toLowerCase();
const count = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** The schedule in words: "every Thursday from 2026-11-12 to 2026-11-26", "a one-off on 2026-11-12, a Thursday". */
export function scheduleInWords(event) {
  if (unit(event) === "once") return `a one-off on ${event.startsOn || "no date"}${event.startsOn ? `, a ${weekday(event.startsOn)}` : ""}`;
  const label = recurrenceLabel(event);
  if (!label) return "a series that doesn't repeat";
  const extras = normalizeExtraDates(event.extraDates);
  const extra = extras.length ? `, with ${count(extras.length, "night")} added by hand (${extras.join(", ")})` : "";
  return `${label[0].toLowerCase()}${label.slice(1)} from ${event.startsOn || "no date"}${event.endsOn ? ` to ${event.endsOn}` : ", no end date"}${extra}`;
}

/** Weekly on Wednesday to Sunday from the 25th, no end date: as the owner wants. */
export function isWedToSun(event) {
  return (
    unit(event) === "week" &&
    Math.floor(Number(event.repeatEvery) || 1) === 1 &&
    same(event.weekdays || [], WEEKDAYS) &&
    event.startsOn === STARTS_ON &&
    !event.endsOn
  );
}

/** Still a weekly Thursdays run that started before the 25th (as 2026-11-11 left it). */
export function isThursdaysRun(event) {
  return (
    unit(event) === "week" &&
    Math.floor(Number(event.repeatEvery) || 1) === 1 &&
    same(event.weekdays || [], ["thu"]) &&
    Boolean(event.startsOn) &&
    event.startsOn < STARTS_ON
  );
}

/**
 * The new schedule's fields for `event`: Wednesday to Sunday from the 25th,
 * no end date, and every night the old schedule has that the new rule
 * doesn't kept as a night added by hand. Its skipped nights stay.
 */
export function planSchedule(event) {
  const rule = { repeatUnit: "week", repeatEvery: 1, weekdays: WEEKDAYS, startsOn: STARTS_ON, endsOn: "" };
  // The nights the new rule makes by itself, as far as the old ones reach.
  const old = expandSeriesOccurrenceDates(event);
  const reach = old.at(-1) && old.at(-1) > STARTS_ON ? old.at(-1) : STARTS_ON;
  const ruled = new Set(expandSeriesOccurrenceDates({ ...rule, endsOn: reach, extraDates: [], skippedDates: [] }));
  const extraDates = normalizeExtraDates([...(event.extraDates || []), ...old.filter((date) => !ruled.has(date))]);
  return { ...rule, extraDates };
}

/** The series' nights from its first through `until`. */
export function nightsThrough(event, until = SHOW_UNTIL) {
  return (event.dates || []).map((night) => night.date).filter((date) => date <= until);
}

/** Chez Pickle by its web address, or a clear error. */
async function findChezPickle(env) {
  const events = await listEvents(env, { withDeleted: true });
  const found =
    events.find((event) => event.slug === SLUG) || events.find((event) => (event.formerSlugs || []).includes(SLUG));
  if (!found) {
    throw new Error(
      `Chez Pickle was not found: no event at /whats-on/${SLUG} (nor one that had that address). Nothing was changed. Check Events in ops, then run this again.`,
    );
  }
  return found;
}

/**
 * Its schedule, through the editor's own save.
 * @returns {Promise<{ event: object, changed: boolean }>}
 */
async function saveSchedule(env, event, say, { dryRun }) {
  const was = scheduleInWords(event);
  if (isWedToSun(event)) return { event, changed: false };
  if (!isThursdaysRun(event)) {
    say(`left alone: the schedule of ${title(event)} is ${was}, not the Thursdays run it was; it was not changed`);
    return { event, changed: false };
  }
  const before = new Map((event.dates || []).map((night) => [night.date, night.id]));
  const saved = await updateEvent(env, event.id, planSchedule(event));
  const kept = saved.dates.filter((night) => before.get(night.date) === night.id).map((night) => night.date);
  const lost = [...before.keys()].filter((date) => !saved.dates.some((night) => night.date === date));
  const nights = nightsThrough(saved);
  say(`${title(saved)} ${dryRun ? "would be" : "is now"} ${scheduleInWords(saved)}; it was ${was}`);
  say(`    its nights through ${SHOW_UNTIL} (${nights.length}): ${nights.join(", ")}`);
  say(`    ${count(saved.dates.length, "night")} in all, to ${saved.dates.at(-1)?.date || "none"} (12 weeks ahead, growing as the days pass)`);
  if (kept.length) say(`    kept as they were, with anything changed on them: ${kept.join(", ")}`);
  if (lost.length) say(`    dropped: ${lost.join(", ")}`);
  return { event: saved, changed: true };
}

/**
 * Its Food menu: Wednesday to Sunday from its first night, ongoing.
 * @returns {Promise<"changed" | "there" | "owner's" | "none">}
 */
async function saveMenu(env, event, say, { dryRun }) {
  const { menus } = await listMenus(env);
  const food = menus.filter((menu) => menu.kind === "kitchen" && menu.popupSeriesId === String(event.id));
  if (!food.length) {
    say(`note: ${title(event)} has no Food menu in ops (Menu → Menus); none was changed`);
    return "none";
  }
  if (food.length > 1) {
    say(`left alone: ${title(event)} has ${food.length} Food menus (${food.map((menu) => `"${menu.name}"`).join(", ")}); none was changed`);
    return "owner's";
  }
  const [menu] = food;
  const describe = (m) => `${menuDatesLabel(m)}, ${menuDaysLabel(m.days)}`;
  const wanted = { startsOn: MENU_STARTS_ON, endsOn: "", days: WEEKDAYS };
  if (menu.startsOn === wanted.startsOn && !menu.endsOn && same(menuDayList(menu.days), WEEKDAYS)) return "there";
  if (!same(menuDayList(menu.days), ["thu"])) {
    say(`left alone: the menu "${menu.name}" (menu ${menu.id}) runs ${describe(menu)}, not on Thursdays as it did; it was not changed`);
    return "owner's";
  }
  const saved = await updateMenu(env, menu.id, { ...wanted, days: WEEKDAYS.join(",") });
  say(`the menu "${saved.name}" (menu ${saved.id}) ${dryRun ? "would run" : "runs"} ${describe(saved)}; it ran ${describe(menu)}`);
  return "changed";
}

export async function up({ env, d1, processEnv, log, dryRun = false }) {
  const data = await opsDataForMigration({ env, d1, dryRun, log, processEnv });
  const found = await findChezPickle(data.env);
  if (found.deletedAt) {
    log(`left alone: ${title(found)} is deleted in ops and waits on the Website page; nothing was changed`);
    return { schedule: "owner's", menu: "owner's", published: false };
  }

  const lines = [];
  const say = (line) => lines.push(line);
  if (found.category !== "popup") say(`note: ${title(found)} is not a pop-up kitchen in ops`);
  const schedule = await saveSchedule(data.env, found, say, { dryRun });
  const menu = await saveMenu(data.env, schedule.event, say, { dryRun });
  const event = schedule.event;
  const result = { schedule: schedule.changed ? "changed" : isWedToSun(event) ? "there" : "owner's", menu };

  if (!schedule.changed && eventInStepWithWebsite(event)) {
    for (const line of lines) log(line);
    if (menu === "changed") return { ...result, published: false };
    log(
      result.schedule === "there" && result.menu === "there"
        ? `Nothing to do: ${title(event)} is ${scheduleInWords(event)}, its menu too, and the website is in step.`
        : `Nothing to do: ${title(event)} is as the owner left it, and the website is in step.`,
    );
    return { ...result, published: false };
  }
  for (const line of lines) log(line);
  if (!schedule.changed) log(`${title(event)} is as the owner wants it in ops; finishing: putting it on the website`);
  if (dryRun) {
    log(`would put it on the website (/whats-on/${event.slug}): ${scheduleInWords(event)}`);
    return { ...result, published: false };
  }
  const live = await putEventOnWebsiteNow(data.env, event.id);
  log(`${title(live)} is on the website: /whats-on/${live.slug}, ${scheduleInWords(live)}`);
  return { ...result, published: true };
}
