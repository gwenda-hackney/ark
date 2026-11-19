/**
 * Which menus the website shows, and when (#306). Ops gives each menu its
 * dates and days (#305) and may tie it to a pop-up kitchen; this decides,
 * for a day at the bar, what /bar and /kitchen show and in what order, which
 * is today's, and what home's boards lead with. Everything is decided when
 * the site is built: ops rebuilds it on any day this answer changes
 * (`menuDayKey`, ops' website/server/site-pending.js).
 *
 * A menu's days are "mon" … "sun"; none is every day. A pop-up kitchen
 * cooks on the nights it has on What's on, so its menus are "today" only on
 * a day it cooks and its menu runs.
 *
 * Before ops has sent menus, chapters have none, and each page groups them
 * as it did: the drinks as one menu, the house food as one, and each pop-up
 * kitchen's chapters as its own, shown from when it's booked through its
 * last night. Those menus have no links of their own, so the page's links
 * stay as they were.
 */
import { kitchenColourStyle } from "./kitchen-colour.js";
import { menuAddresses, menuPage } from "./menu-anchors.js";
import { popupIsBookedOrOn, popupWhen, seriesLogo } from "./popup-kitchen.js";
import { categoryOf, upcomingNights } from "./promotions.js";

export const WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const LONG = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** How far ahead a board looks for the next day a kitchen cooks. */
const LOOK_AHEAD_DAYS = 62;

function utc(dateIso) {
  const [year, month, day] = String(dateIso).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** The day after, or `n` days after: YYYY-MM-DD. */
export function addDays(dateIso, n = 1) {
  const date = utc(dateIso);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

/** "mon" … "sun" for a YYYY-MM-DD. */
export function weekdayOf(dateIso) {
  return WEEK[(utc(dateIso).getUTCDay() + 6) % 7];
}

/** "Saturday" */
function longDay(dateIso) {
  return LONG[WEEK.indexOf(weekdayOf(dateIso))];
}

/** "1 Dec" */
function dayMonth(dateIso) {
  const date = utc(dateIso);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

/** "Thu 12 Nov" */
function shortDate(dateIso) {
  return `${SHORT[WEEK.indexOf(weekdayOf(dateIso))]} ${dayMonth(dateIso)}`;
}

/** Weekdays in week order with no repeats; all seven is every day ([]). */
function dayList(days) {
  const wanted = new Set(
    (days || []).map((day) => String(day).trim().toLowerCase().slice(0, 3)),
  );
  const list = WEEK.filter((day) => wanted.has(day));
  return list.length === WEEK.length ? [] : list;
}

/**
 * Days in a few words, as ops says them: "Every day", "Sat", "Thu & Fri",
 * "Wed–Sun", "Mon, Wed & Fri". Three or more in a row read as a range.
 */
export function daysWords(days) {
  const list = dayList(days);
  if (!list.length) return "Every day";
  const runs = [];
  for (const day of list) {
    const last = runs.at(-1);
    if (last && WEEK.indexOf(day) === WEEK.indexOf(last.at(-1)) + 1) {
      last.push(day);
    } else runs.push([day]);
  }
  const parts = runs.flatMap((run) =>
    run.length >= 3
      ? [`${SHORT[WEEK.indexOf(run[0])]}–${SHORT[WEEK.indexOf(run.at(-1))]}`]
      : run.map((day) => SHORT[WEEK.indexOf(day)]),
  );
  return parts.length === 1
    ? parts[0]
    : `${parts.slice(0, -1).join(", ")} & ${parts.at(-1)}`;
}

/** Whether a menu runs on a day: between its dates, on one of its days. */
export function menuRunsOn(menu, dateIso) {
  if (menu.startsOn && dateIso < menu.startsOn) return false;
  if (menu.endsOn && dateIso > menu.endsOn) return false;
  const days = dayList(menu.days);
  return !days.length || days.includes(weekdayOf(dateIso));
}

function hasItems(section) {
  if ((section.items || []).some((item) => item.available !== false)) {
    return true;
  }
  return (section.subsections || []).some(hasItems);
}

/**
 * Each menu with its chapters: ops' menus in their order, then, for
 * chapters that name none (before ops sends menus), a menu made up for
 * them: the drinks, the house food, each pop-up kitchen's (`legacy`).
 */
function menusWithChapters(menu, series) {
  const sent = (menu?.menus || []).map((info) => ({
    ...info,
    days: dayList(info.days),
    legacy: false,
    chapters: [],
  }));
  const byId = new Map(sent.map((info) => [info.id, info]));
  const made = new Map();
  for (const chapter of menu?.sections || []) {
    const own = chapter.menuId && byId.get(chapter.menuId);
    if (own) {
      own.chapters.push(chapter);
      continue;
    }
    const kind = chapter.kind === "kitchen" ? "kitchen" : "bar";
    const popupSeriesId = kind === "kitchen" ? chapter.popupSeriesId : "";
    const key = popupSeriesId ? `popup:${popupSeriesId}` : kind;
    if (!made.has(key)) {
      const title =
        (popupSeriesId &&
          series.find((row) => row.seriesId === popupSeriesId)?.title) ||
        (kind === "bar" ? "Drinks" : "Food");
      made.set(key, {
        id: key,
        name: title,
        kind,
        startsOn: "",
        endsOn: "",
        days: [],
        ...(popupSeriesId ? { popupSeriesId } : {}),
        legacy: true,
        chapters: [],
      });
    }
    made.get(key).chapters.push(chapter);
  }
  return [...sent, ...made.values()];
}

/** The days a pop-up cooks, from its nights to come: "wed" … in week order. */
function cookingDays(nights) {
  return WEEK.filter((day) =>
    nights.some((night) => weekdayOf(String(night.date)) === day),
  );
}

/**
 * What one of the two menu pages shows on a day, and home's board for it.
 *
 * - `menus`: the menus shown in full, in the page's order. A menu shows
 *   from its start through its end; a pop-up kitchen's from when the pop-up
 *   is booked (its menus come with it) through its last night or the
 *   menu's end, whichever is first. A menu with nothing on it isn't shown.
 * - `kitchens`: the menus by who cooks them (food only): the house's
 *   first, then each pop-up kitchen in week order (the first day it cooks,
 *   Monday first), so nothing moves from one day to the next. A pop-up
 *   that's booked is here with no menu yet, too.
 * - `coming`: menus that haven't started, as one line each ("Winter
 *   specials, from 1 Dec"); not a pop-up's.
 * - `week`: who cooks which days ("Mon: Supper Club"), with two or more
 *   pop-up kitchens.
 * - `where`: every link on the page (lib/menu-anchors.js), menus first.
 *
 * @param {"bar" | "kitchen"} kind
 * @param {{ sections: object[], menus?: object[] }} menu as fetched
 * @param {{ series?: object[], occurrences?: object[] }} catalog What's on's
 * @param {string} today YYYY-MM-DD at the bar
 */
export function menuShelf(kind, menu, catalog, today) {
  const series = catalog?.series || [];
  const occurrences = catalog?.occurrences || [];
  const all = menusWithChapters(menu, series).filter(
    (info) => info.kind === kind,
  );
  const popups = new Map(
    series
      .filter((row) => categoryOf(row) === "popup")
      .filter((row) => popupIsBookedOrOn(row.seriesId, occurrences, today))
      .map((row) => [row.seriesId, row]),
  );

  const shown = [];
  const coming = [];
  for (const info of all) {
    if (!info.chapters.some(hasItems)) continue;
    if (info.endsOn && info.endsOn < today) continue;
    if (info.popupSeriesId) {
      if (popups.has(info.popupSeriesId)) shown.push(info);
      continue;
    }
    if (info.startsOn && info.startsOn > today) {
      coming.push({
        id: info.id,
        name: info.name,
        from: dayMonth(info.startsOn),
      });
    } else shown.push(info);
  }

  const linked = shown.filter((info) => !info.legacy);
  const where = menuAddresses(
    shown.flatMap((info) => info.chapters),
    linked,
  );

  const kitchens = [];
  if (kind === "kitchen") {
    const house = shown.filter((info) => !info.popupSeriesId);
    if (house.length) {
      kitchens.push({ id: "house", popup: null, nights: null, menus: house });
    }
    const booked = [...popups.values()]
      .map((row) => {
        const nights = upcomingNights(row.seriesId, occurrences, today);
        return {
          id: row.seriesId,
          row,
          nights,
          days: cookingDays(nights),
          menus: shown.filter((info) => info.popupSeriesId === row.seriesId),
        };
      })
      .sort(
        (a, b) =>
          (a.days.length ? WEEK.indexOf(a.days[0]) : 7) -
            (b.days.length ? WEEK.indexOf(b.days[0]) : 7) ||
          String(a.nights[0]?.date).localeCompare(String(b.nights[0]?.date)) ||
          a.row.title.localeCompare(b.row.title),
      );
    for (const { id, row, nights, days, menus } of booked) {
      kitchens.push({
        id,
        popup: {
          id,
          title: row.title,
          href: `/whats-on/${encodeURIComponent(id)}/`,
          when: popupWhen(row, upcomingNights(id, occurrences, ""), today),
          days: daysWords(days),
          logo: seriesLogo(row),
          pageUrl: String(row.pageUrl || "").trim(),
          /** Its own colour (#319), as CSS custom properties; "" for our red. */
          colourStyle: kitchenColourStyle(row.accentColor),
        },
        nights: new Set(nights.map((night) => String(night.date))),
        menus,
      });
    }
  } else if (shown.length) {
    kitchens.push({ id: "house", popup: null, nights: null, menus: shown });
  }

  /** A kitchen cooks on a day: a pop-up on its nights, the house when a menu runs. */
  const cooks = (kitchen, day) =>
    kitchen.nights
      ? kitchen.nights.has(day)
      : kitchen.menus.some((info) => menuRunsOn(info, day));

  const view = (info, kitchen) => {
    const days = daysWords(info.days);
    const at = where(info) || where(info.chapters.find(hasItems));
    return {
      id: info.id,
      name: info.name,
      kind: info.kind,
      days,
      label: `${info.name} · ${days}`,
      /** Its own link (none for a menu made up before ops sent menus). */
      anchor: info.legacy ? "" : where(info).anchor,
      href: at?.href || menuPage(kind),
      today: menuRunsOn(info, today) && cooks(kitchen, today),
      chapters: info.chapters,
      info,
    };
  };

  const kitchenViews = kitchens.map((kitchen) => {
    const menus = kitchen.menus.map((info) => view(info, kitchen));
    return {
      id: kitchen.id,
      popup: kitchen.popup,
      menus,
      href: menus[0]?.href || menuPage(kind),
      today: cooks(kitchen, today),
      cooks: (day) => cooks(kitchen, day),
    };
  });

  const popupKitchens = kitchenViews.filter((kitchen) => kitchen.popup);
  const week =
    popupKitchens.length > 1
      ? popupKitchens.map((kitchen) => ({
          days: kitchen.popup.days,
          title: kitchen.popup.title,
          href: kitchen.href,
          today: kitchen.today,
        }))
      : [];

  return {
    kind,
    menus: kitchenViews.flatMap((kitchen) => kitchen.menus),
    kitchens: kitchenViews,
    coming,
    week,
    where,
  };
}

/** The first day from `from` on that `test` is true, within the look-ahead; "" if none. */
function firstDay(from, test) {
  for (let n = 0; n < LOOK_AHEAD_DAYS; n += 1) {
    const day = addDays(from, n);
    if (test(day)) return day;
  }
  return "";
}

/** "Wednesday" within the week, else "Thu 12 Nov". */
function dayName(day, today) {
  return utc(day) - utc(today) < 7 * 86400000 ? longDay(day) : shortDate(day);
}

/**
 * Home's board for one menu page: who's cooking (food), which menu leads,
 * and the rest under "Also". The kitchen cooking today leads; when nobody
 * cooks today, the next one, labelled with its day ("Wednesday: Chez
 * Pickle"). Its menu is the one running that day; one that runs later is
 * labelled ("Saturday's menu"). Then "Also" lists its other menus ("Brunch,
 * Sat") and the other pop-up kitchens ("Mon, Supper Club").
 *
 * @param {ReturnType<typeof menuShelf>} shelf
 * @param {string} today YYYY-MM-DD
 * @returns {null | {
 *   popup: null | object,
 *   line: string,
 *   menu: null | ReturnType<typeof menuShelf>["menus"][number],
 *   menuLabel: string,
 *   also: Array<{ text: string, href: string, logo?: null | { url: string } }>,
 * }} null when the page has nothing to show
 */
export function boardPick(shelf, today) {
  const [lead, ...others] = boardCards(shelf, today);
  if (!lead) return null;
  const { kitchen, chosen } = lead;
  const also = [
    ...kitchen.menus
      .filter((menu) => menu !== chosen)
      .map((menu) => ({ text: `${menu.name}, ${menu.days}`, href: menu.href })),
    ...others
      .filter((card) => card.popup)
      .map((card) => ({
        text: `${card.popup.days}, ${card.popup.title}`,
        href: card.kitchen.href,
        // Its logo beside it, when ops has one.
        logo: card.popup.logo || null,
      })),
  ];
  return {
    popup: lead.popup,
    line: lead.line,
    menu: lead.menu,
    menuLabel: lead.menuLabel,
    also,
  };
}

/**
 * The kitchens for home's board (#306), in the order they next cook: the
 * first leads the board (boardPick), the rest go under "Also". Each says
 * who and when ("In the kitchen today: Chez Pickle", "Monday: Pinsa A Roma"),
 * which of its menus runs that day ("Saturday's menu" when a later one),
 * and its day in a word ("Today", "Thursday"). Kitchens that cook on the
 * same day keep their week order.
 *
 * @param {ReturnType<typeof menuShelf>} shelf
 * @param {string} today YYYY-MM-DD
 */
export function boardCards(shelf, today) {
  return shelf.kitchens
    .map((kitchen, index) => ({
      kitchen,
      index,
      day: firstDay(today, kitchen.cooks),
    }))
    .sort(
      (a, b) =>
        (a.day || "9999").localeCompare(b.day || "9999") || a.index - b.index,
    )
    .map(({ kitchen, day: next }) => {
      const day = next || today;
      const menuDays = kitchen.menus.map((menu) => ({
        menu,
        day: firstDay(
          day,
          (date) => menuRunsOn(menu.info, date) && kitchen.cooks(date),
        ),
      }));
      const chosen =
        menuDays.find((entry) => entry.day === day) ||
        [...menuDays]
          .filter((entry) => entry.day)
          .sort((a, b) => a.day.localeCompare(b.day))[0] ||
        menuDays[0] ||
        null;
      const when = !next
        ? "Next"
        : day === today
          ? "Today"
          : dayName(day, today);
      const line = kitchen.popup
        ? day === today
          ? `In the kitchen today: ${kitchen.popup.title}`
          : `${when}: ${kitchen.popup.title}`
        : "";
      const said = kitchen.popup ? day : today;
      return {
        id: kitchen.id,
        kitchen,
        popup: kitchen.popup,
        day,
        /** Its day in a word, for its strip in the stack. */
        when,
        line,
        chosen: chosen?.menu || null,
        menu: chosen?.menu || null,
        menuLabel:
          chosen?.day && chosen.day !== said
            ? `${dayName(chosen.day, today)}’s menu`
            : "",
      };
    });
}

/**
 * Where each pop-up kitchen's menu is on /kitchen, by its series: its
 * first menu's link, else the food page. Its card on What's on and its own
 * page lead there.
 */
export function popupMenuLinks(menu, catalog, today) {
  const shelf = menuShelf("kitchen", menu, catalog, today);
  return new Map(
    shelf.kitchens
      .filter((kitchen) => kitchen.popup)
      .map((kitchen) => [kitchen.popup.id, kitchen.href]),
  );
}

/**
 * Everything the built site shows that depends on the day alone: the
 * menus each page shows and which is today's, the coming ones, and who
 * home's boards lead with. Ops compares a site's build day with today
 * (site-pending.js); when this differs, the site is rebuilt that morning.
 */
export function menuDayKey(menu, catalog, day) {
  return JSON.stringify(
    ["bar", "kitchen"].map((kind) => {
      const shelf = menuShelf(kind, menu, catalog, day);
      const pick = boardPick(shelf, day);
      return {
        menus: shelf.menus.map((view) => [view.id, view.today]),
        kitchens: shelf.kitchens.map((kitchen) => [kitchen.id, kitchen.today]),
        coming: shelf.coming.map((row) => row.id),
        board: pick && [
          pick.line,
          pick.menu?.id || "",
          pick.menuLabel,
          pick.also.map((row) => row.text),
        ],
      };
    }),
  );
}
