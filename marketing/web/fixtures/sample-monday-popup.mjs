/**
 * A sample over dev's real content (#306), for a local dev server with
 * `SITE_OVERLAY=fixtures/sample-monday-popup.mjs` (npm run dev:sample;
 * src/lib/sanity/fixture-client.js): everything is as dev's Sanity has it,
 * plus
 *
 * - Chez Pickle cooking Wednesday to Sunday, the schedule its migration
 *   brings (PR #317): its nights from here on are Wed–Sun;
 * - a made-up second pop-up kitchen, "Monday Dumplings (sample)", on
 *   Mondays, with its own menu.
 *
 * Nights run six weeks from today. Nothing is written anywhere.
 */

const WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const WEEKS_AHEAD = 6;

function addDays(iso, n) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

function weekday(iso) {
  return WEEK[(new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7];
}

/** Every date from today for six weeks on these weekdays. */
function datesOn(days, today) {
  const out = [];
  for (let n = 0; n < WEEKS_AHEAD * 7; n += 1) {
    const date = addDays(today, n);
    if (days.includes(weekday(date))) out.push(date);
  }
  return out;
}

const text = (value) => [
  {
    _type: "block",
    _key: "b",
    style: "normal",
    markDefs: [],
    children: [{ _type: "span", _key: "s", text: value, marks: [] }],
  },
];

const ref = (id, extra = {}) => ({ _type: "reference", _ref: id, ...extra });

/** Chez Pickle's nights from today are Wed–Sun, each like its next night as dev has it. */
function chezPickleWedToSun(docs, today) {
  const series = docs.find(
    (doc) =>
      doc._type === "eventSeries" &&
      /chez pickle/i.test(String(doc.title || "")),
  );
  const slug = series?.slug?.current;
  if (!slug) return docs;
  const nights = docs.filter(
    (doc) => doc._type === "event" && doc.seriesId === slug,
  );
  const model =
    nights.find((night) => String(night.date) >= today) || nights.at(-1);
  if (!model) return docs;
  const kept = docs.filter(
    (doc) =>
      !(
        doc._type === "event" &&
        doc.seriesId === slug &&
        String(doc.date) >= today
      ),
  );
  const days = ["wed", "thu", "fri", "sat", "sun"];
  return [
    ...kept.map((doc) =>
      doc === series
        ? {
            ...doc,
            recurrence:
              "Every Wednesday, Thursday, Friday, Saturday and Sunday",
          }
        : doc,
    ),
    ...datesOn(days, today).map((date) => ({
      ...model,
      _id: `sample-${slug}-${date}`,
      slug: { _type: "slug", current: `${slug}-${date}` },
      date,
    })),
  ];
}

const SAMPLE = "monday-dumplings-sample";
const TITLE = "Monday Dumplings (sample)";

/** The made-up Monday kitchen: its series, nights, menu, sections and dishes. */
function mondayKitchen(today) {
  let rank = 0;
  const order = () => `zz|sample${String((rank += 1)).padStart(4, "0")}:`;
  const chapter = (slug, title) => ({
    _id: `sample-section-${slug}`,
    _type: "menuSection",
    slug: { _type: "slug", current: slug },
    title,
    kind: "kitchen",
    popupSeries: ref(`series-${SAMPLE}`),
    menu: ref(`sample-menu-${SAMPLE}`, { _weak: true }),
    orderRank: order(),
  });
  const dishes = (section, list) =>
    list.map(([name, price, description], index) => ({
      _id: `sample-item-${section}-${index}`,
      _type: "menuItem",
      name,
      price: String(price),
      description,
      section: ref(`sample-section-${section}`),
      orderRank: order(),
    }));
  return [
    {
      _id: `series-${SAMPLE}`,
      _type: "eventSeries",
      slug: { _type: "slug", current: SAMPLE },
      title: TITLE,
      category: "popup",
      schedule: "repeating",
      recurrence: "Every Monday",
      shortDescription: "Made up, to see two kitchens in one week.",
      description: text("Made up, to see two kitchens in one week."),
    },
    ...datesOn(["mon"], today).map((date) => ({
      _id: `sample-night-${SAMPLE}-${date}`,
      _type: "event",
      slug: { _type: "slug", current: `${SAMPLE}-${date}` },
      title: TITLE,
      seriesId: SAMPLE,
      seriesTitle: TITLE,
      category: "popup",
      date,
      ticketStart: "17:00",
      ticketEnd: "22:00",
      description: text("Made up, to see two kitchens in one week."),
    })),
    {
      _id: `sample-menu-${SAMPLE}`,
      _type: "menu",
      slug: { _type: "slug", current: SAMPLE },
      name: "Dumplings (sample)",
      kind: "kitchen",
      days: ["mon"],
      popupSeries: ref(`series-${SAMPLE}`),
      orderRank: order(),
    },
    chapter("sample-dumplings", "Dumplings"),
    ...dishes("sample-dumplings", [
      ["Pork & Chive (6)", 8, "Sample dish."],
      ["Mushroom (6)", 7.5, "Sample dish."],
      ["Chilli Oil Wontons", 8, "Sample dish."],
    ]),
    chapter("sample-sides", "Sides"),
    ...dishes("sample-sides", [["Smacked Cucumber", 4, "Sample dish."]]),
  ];
}

/**
 * @param {object[]} docs every document as dev's Sanity has it
 * @param {string} today YYYY-MM-DD at the bar
 */
export default function sampleMondayPopup(docs, today) {
  return [...chezPickleWedToSun(docs, today), ...mondayKitchen(today)];
}
