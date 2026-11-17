/**
 * Sample data (#306): two pop-up kitchens sharing the week, for a local dev
 * server with `SITE_FIXTURE=fixtures/two-popups.mjs` (src/lib/sanity/
 * fixture-client.js). Chez Pickle cooks Wednesday to Sunday with its menu;
 * "Monday Dumplings (sample)" is made up, on Mondays, with its own menu;
 * the Drinks menu runs every day, and a made-up winter specials menu starts
 * on the 1st of next month. Nights run six weeks from today.
 */

const WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function addDays(iso, n) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

function weekday(iso) {
  return WEEK[(new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7];
}

const text = (value) => [
  {
    _type: "block",
    _key: "b",
    style: "normal",
    children: [{ _type: "span", _key: "s", text: value }],
  },
];

function series(slug, title, recurrence, line, pageUrl = "") {
  return {
    _id: `series-${slug}`,
    _type: "eventSeries",
    slug: { current: slug },
    title,
    category: "popup",
    schedule: "repeating",
    recurrence,
    shortDescription: line,
    pageUrl,
    description: text(line),
  };
}

function nights(slug, title, days, today) {
  const out = [];
  for (let n = -3; n < 42; n += 1) {
    const date = addDays(today, n);
    if (!days.includes(weekday(date))) continue;
    out.push({
      _id: `event-${slug}-${date}`,
      _type: "event",
      slug: { current: `${slug}-${date}` },
      title,
      seriesId: slug,
      seriesTitle: title,
      category: "popup",
      date,
      ticketStart: "17:00",
      ticketEnd: "22:00",
      description: text(`${title} in the kitchen.`),
    });
  }
  return out;
}

let rank = 0;
const order = () => `0|i${String((rank += 1)).padStart(8, "0")}:`;

function menu(id, name, kind, { days = [], startsOn, popup } = {}) {
  return {
    _id: `menu-${id}`,
    _type: "menu",
    slug: { current: id },
    name,
    kind,
    days,
    ...(startsOn ? { startsOn } : {}),
    ...(popup
      ? { popupSeries: { _type: "reference", _ref: `series-${popup}` } }
      : {}),
    orderRank: order(),
  };
}

function chapter(slug, title, menuId, kind, extra = {}) {
  return {
    _id: `section-${slug}`,
    _type: "menuSection",
    slug: { current: slug },
    title,
    kind,
    menu: { _type: "reference", _ref: `menu-${menuId}`, _weak: true },
    orderRank: order(),
    ...extra,
  };
}

function items(section, list) {
  return list.map(([name, price, description = ""], index) => ({
    _id: `item-${section}-${index}`,
    _type: "menuItem",
    name,
    price: String(price),
    ...(description ? { description } : {}),
    drinkType: "cocktail",
    section: { _type: "reference", _ref: `section-${section}` },
    orderRank: order(),
  }));
}

/** @param {string} today YYYY-MM-DD */
export default function twoPopups(today) {
  rank = 0;
  const firstOfNext = `${addDays(today.slice(0, 8) + "01", 32).slice(0, 8)}01`;
  return [
    series(
      "chez-pickle",
      "Chez Pickle",
      "Every Wednesday, Thursday, Friday, Saturday and Sunday",
      "Smash burgers, fries and dips.",
      "https://www.instagram.com/chezpickle/",
    ),
    series(
      "monday-dumplings",
      "Monday Dumplings (sample)",
      "Every Monday",
      "A made-up second kitchen, to see two in one week.",
    ),
    ...nights(
      "chez-pickle",
      "Chez Pickle",
      ["wed", "thu", "fri", "sat", "sun"],
      today,
    ),
    ...nights("monday-dumplings", "Monday Dumplings (sample)", ["mon"], today),

    menu("drinks", "Drinks", "bar"),
    menu("winter-specials", "Winter specials (sample)", "bar", {
      startsOn: firstOfNext,
    }),
    menu("chez-pickle", "Chez Pickle", "kitchen", {
      days: ["wed", "thu", "fri", "sat", "sun"],
      popup: "chez-pickle",
    }),
    menu("monday-dumplings", "Dumplings (sample)", "kitchen", {
      days: ["mon"],
      popup: "monday-dumplings",
    }),

    chapter("our-cocktails", "Our Cocktails", "drinks", "bar"),
    ...items("our-cocktails", [
      ["Gwenda Spritz", 11, "Aperitivo, fizz, orange."],
      ["Canal Sour", 12, "Bourbon, lemon, egg white."],
      ["Wick Mule", 11, "Vodka, ginger, lime."],
      ["Black Flag", 12, "Dark rum, coffee, cream."],
    ]),
    chapter("the-classics", "The Classics", "drinks", "bar"),
    ...items("the-classics", [
      ["Negroni", 11],
      ["Margarita", 11],
      ["Old Fashioned", 12],
    ]),
    chapter("beer", "Beer", "drinks", "bar"),
    ...items("beer", [
      ["Lager", 6],
      ["Pale Ale", 6.5],
    ]),
    chapter("no-booze", "No Booze", "drinks", "bar"),
    ...items("no-booze", [["Ginger Fizz", 5]]),
    chapter("winter-warmers", "Winter Warmers", "winter-specials", "bar"),
    ...items("winter-warmers", [["Hot Toddy", 9]]),

    chapter("burgers", "Burgers", "chez-pickle", "kitchen", {
      popupSeries: { _type: "reference", _ref: "series-chez-pickle" },
    }),
    ...items("burgers", [
      ["Smash Burger", 12, "Two patties, cheese, pickles, sauce."],
      ["Pickle Back", 13, "Fried pickles, hot honey."],
      ["Mushroom Smash", 12, "Smashed mushroom, cheese, onions."],
      ["Chicken Burger", 13, "Buttermilk fried chicken, slaw."],
    ]),
    chapter("fries-and-dips", "Fries & Dips", "chez-pickle", "kitchen", {
      popupSeries: { _type: "reference", _ref: "series-chez-pickle" },
    }),
    ...items("fries-and-dips", [
      ["Fries", 4.5],
      ["Dirty Fries", 7],
      ["Pickle Dip", 3],
    ]),

    chapter("dumplings", "Dumplings", "monday-dumplings", "kitchen", {
      popupSeries: { _type: "reference", _ref: "series-monday-dumplings" },
    }),
    ...items("dumplings", [
      ["Pork & Chive (6)", 8, "Sample dish."],
      ["Mushroom (6)", 7.5, "Sample dish."],
      ["Chilli Oil Wontons", 8, "Sample dish."],
    ]),
    chapter("sides", "Sides", "monday-dumplings", "kitchen", {
      popupSeries: { _type: "reference", _ref: "series-monday-dumplings" },
    }),
    ...items("sides", [["Smacked Cucumber", 4]]),
  ];
}
