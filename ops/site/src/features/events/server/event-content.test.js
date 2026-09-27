import { test } from "vitest";
import assert from "node:assert/strict";
import { normalizePageUrl } from "./event-store.js";
import {
  occurrenceHash,
  plainToEventDescription,
  recurrenceLabel,
  resolveOccurrenceContent,
  seriesAwaitingDates,
  seriesDescriptionForPublish,
  seriesScheduleMode,
  seriesShortDescriptionForPublish,
  sanityEventDocument,
  sanitySeriesDocument,
  stableHeroFraming,
  stableImageRef,
  titleOverrideEchoesSeries,
  titleOverrideForSave,
} from "./event-content.js";

test("page link is an optional http address", () => {
  assert.equal(normalizePageUrl(""), "");
  assert.equal(
    normalizePageUrl("https://partiful.com/e/example"),
    "https://partiful.com/e/example",
  );
  assert.equal(normalizePageUrl("partiful.com/e/x"), "https://partiful.com/e/x");
  assert.equal(normalizePageUrl("@dj.someone"), "https://www.instagram.com/dj.someone/");
  assert.throws(() => normalizePageUrl("not a link"), /website address/);
  assert.throws(() => normalizePageUrl("ftp://example.com"), /website address/);
});

test("publishes event-specific ticket times", () => {
  const document = sanityEventDocument({
    slug: "gwenda-nights-2026-09-26",
    title: "Gwenda Nights",
    date: "2026-09-26",
    description: "Saturday nights.",
    offer: "Guest offer",
    seriesId: "gwenda-nights",
    recurrence: "Every week on Saturday",
    time: "From 4pm",
    startTime: "16:00",
    endTime: "01:30",
  });

  assert.equal(document.ticketStart, "16:00");
  assert.equal(document.ticketEnd, "01:30");
  assert.equal(
    sanityEventDocument({
      slug: "amo-mas-2026-10-18",
      title: "Amo más",
      date: "2026-10-18",
      description: "From four.",
      seriesId: "amo-mas",
      pageUrl: "https://partiful.com/e/example",
    }).pageUrl,
    "https://partiful.com/e/example",
  );
  assert.equal(
    sanityEventDocument({
      slug: "amo-mas-2026-10-18",
      title: "Amo más",
      date: "2026-10-18",
      description: "From four.",
      seriesId: "amo-mas",
    }).pageUrl,
    "",
  );
  assert.equal(
    sanityEventDocument({
      slug: "amo-mas-2026-10-18",
      title: "Amo más",
      date: "2026-10-18",
      description: "From four.",
      seriesId: "amo-mas",
      startTime: "16:00",
    }).ticketEnd,
    "",
  );
  assert.equal(document.time, "From 4pm");
  assert.equal(document.offer, "Guest offer");
});

test("series template is a first-class sanity document", () => {
  const document = sanitySeriesDocument({
    slug: "gwenda-nights",
    title: "Gwenda Nights",
    description: "Saturday nights by the water.",
    schedule: "manual",
  });
  assert.equal(document._type, "eventSeries");
  assert.equal(document._id, "series-gwenda-nights");
  assert.equal(document.schedule, "manual");
  assert.equal(document.slug.current, "gwenda-nights");
  assert.equal("formerSlugs" in document, false);
});

test("a series lists its former web addresses for the website to redirect", () => {
  const document = sanitySeriesDocument({
    slug: "gwenda-nights",
    title: "Gwenda Nights",
    formerSlugs: ["gwenda-saturdays", "gwenda-nights", ""],
  });
  assert.deepEqual(document.formerSlugs, ["gwenda-saturdays"]);
});

test("title override is blank when it only echoes the series name", () => {
  assert.equal(titleOverrideForSave("Negroni Sessions", "Negroni Sessions"), "");
  assert.equal(titleOverrideForSave("Negroni Sessions", "negroni sessions"), "");
  assert.equal(
    titleOverrideForSave("Negroni Sessions", "The Bohemianauts"),
    "The Bohemianauts",
  );
  assert.equal(titleOverrideEchoesSeries("Negroni Night", "Negroni Night"), true);
  assert.equal(
    titleOverrideEchoesSeries("Negroni Night", "Negroni Sessions"),
    false,
  );
});

test("ticket times affect the occurrence snapshot", () => {
  const event = {
    name: "Gwenda Nights",
    slug: "gwenda-nights",
    startTime: "16:00",
    endTime: "01:30",
  };

  assert.notEqual(
    occurrenceHash(event, "2026-09-26"),
    occurrenceHash({ ...event, endTime: "02:00" }, "2026-09-26"),
  );
});

test("hero framing changes affect the occurrence snapshot", () => {
  const event = {
    name: "Gwenda Nights",
    slug: "gwenda-nights",
    mainImage: { url: "https://example.com/flyer.jpg" },
    heroCrops: null,
  };

  assert.notEqual(
    occurrenceHash(event, "2026-09-26"),
    occurrenceHash(
      {
        ...event,
        heroCrops: {
          crop: { left: 0, top: 0.2, right: 0, bottom: 0 },
          hotspot: { x: 0.5, y: 0.8, width: 0.2, height: 0.2 },
        },
      },
      "2026-09-26",
    ),
  );
});

test("occurrence hash ignores Baserow signed URL tokens", () => {
  const event = {
    name: "Gwenda Nights",
    slug: "gwenda-nights",
    mainImage: {
      name: "flyer.jpg",
      url: "https://files.baserow.io/user_files/flyer.jpg?token=aaa",
    },
  };
  assert.equal(
    occurrenceHash(event, "2026-09-26"),
    occurrenceHash(
      {
        ...event,
        mainImage: {
          name: "flyer.jpg",
          url: "https://files.baserow.io/user_files/flyer.jpg?token=bbb",
        },
      },
      "2026-09-26",
    ),
  );
  assert.equal(stableImageRef(event.mainImage), "name:flyer.jpg");
});

test("occurrence hash ignores hero crop key order", () => {
  const framing = {
    crop: { left: 0, top: 0.12, right: 0, bottom: 0.4 },
    hotspot: { x: 0.5, y: 0.4, width: 0.2, height: 0.2 },
  };
  const event = {
    name: "Gwenda Nights",
    slug: "gwenda-nights",
    mainImage: { name: "flyer.jpg", url: "https://example.com/flyer.jpg" },
    heroCrops: framing,
  };
  assert.equal(
    occurrenceHash(event, "2026-09-26"),
    occurrenceHash(
      { ...event, heroCrops: { hotspot: framing.hotspot, crop: framing.crop } },
      "2026-09-26",
    ),
  );
  assert.deepEqual(
    stableHeroFraming({ hotspot: framing.hotspot, crop: framing.crop }),
    stableHeroFraming(framing),
  );
});

test("publishState stays current when image URL tokens rotate", async () => {
  const { publishState } = await import("./event-store.js");
  const framing = {
    crop: { left: 0, top: 0.12, right: 0, bottom: 0.4 },
    hotspot: { x: 0.5, y: 0.4, width: 0.2, height: 0.2 },
  };
  const event = {
    name: "Gwenda Nights",
    slug: "gwenda-nights",
    description: "Sat",
    startTime: "17:00",
    endTime: "01:00",
    startsOn: "2026-09-26",
    endsOn: "2026-09-26",
    repeatUnit: "none",
    skippedDates: [],
    extraDates: [],
    mainImage: {
      name: "flyer.jpg",
      url: "https://files.baserow.io/user_files/flyer.jpg?token=aaa",
    },
    heroCrops: framing,
  };
  const hash = occurrenceHash(event, "2026-09-26");
  const dates = [
    {
      id: "1",
      date: "2026-09-26",
      sanityId: "drafts.x",
      overrides: {},
      snapshots: { preview: { hash, at: "2026-09-22T00:00:00.000Z" } },
    },
  ];
  const rotated = {
    ...event,
    mainImage: {
      name: "flyer.jpg",
      url: "https://files.baserow.io/user_files/flyer.jpg?token=zzz",
    },
  };
  assert.equal(publishState(rotated, dates, "2026-09-22").preview, "current");
});

test("publishState stays current for night title overrides (mapEvent shape)", async () => {
  const { publishState } = await import("./event-store.js");
  // mapEvent calls publishState(event, dates) before attaching dates to event.
  const event = {
    name: "Gwenda Nights",
    slug: "gwenda-nights",
    description: "Saturday nights.",
    startTime: "17:00",
    endTime: "23:00",
    startsOn: "2026-10-10",
    endsOn: "",
    repeatUnit: "none",
    skippedDates: [],
    extraDates: [],
    mainImage: { name: "series.png", url: "https://example.com/series.png" },
    heroCrops: null,
  };
  const row = {
    id: "118",
    date: "2026-10-10",
    sanityId: "event-gwenda-nights-2026-10-10",
    overrides: {
      name: "Vbrave Vinyl Session",
      description: "Vinyl until late.",
      startTime: "17:00",
      endTime: "01:00",
      image: { name: "vbrave.png", url: "https://example.com/vbrave.png" },
    },
    isSpecialEdition: false,
  };
  // Publish stores the hash against the occurrence row (with overrides).
  const hash = occurrenceHash({ ...event, dates: [row] }, row);
  const dates = [{ ...row, snapshots: { preview: { hash, at: "now" } } }];
  assert.equal(publishState(event, dates, "2026-09-22").preview, "current");
});

test("resolves a special edition over the regular series content", () => {
  const event = {
    name: "Jazz night",
    artist: "House band",
    offer: "Free entry",
    description: "Every Wednesday.",
    mainImage: { name: "regular.jpg", url: "https://example.com/regular.jpg" },
  };
  const occurrence = {
    date: "2026-09-30",
    overrides: {
      artist: "Guest Quartet",
      offer: "£8 after 9pm",
      description: "A guest set and late jam.",
      image: { name: "guest.jpg", url: "https://example.com/guest.jpg" },
    },
  };

  assert.deepEqual(resolveOccurrenceContent(event, occurrence), {
    title: "Jazz night",
    artist: "Guest Quartet",
    offer: "£8 after 9pm",
    pageUrl: "",
    description: "A guest set and late jam.",
    shortDescription: "",
    time: "",
    startTime: "",
    endTime: "",
    nightSchedule: [],
    operationsNotes: "",
    imageLinks: [],
    image: occurrence.overrides.image,
    isSpecialEdition: true,
  });
  assert.notEqual(
    occurrenceHash(event, occurrence),
    occurrenceHash(event, {
      ...occurrence,
      overrides: { artist: "Another guest" },
    }),
  );
});

test("a flyer image alone is not a special guest night", () => {
  const event = {
    name: "Gwenda Radio",
    artist: "",
    description: "Sunday afternoons.",
    mainImage: null,
  };
  const occurrence = {
    date: "2026-09-27",
    overrides: {
      artist: "",
      image: { name: "radio.jpg", url: "https://example.com/radio.jpg" },
    },
  };

  const content = resolveOccurrenceContent(event, occurrence);
  assert.equal(content.isSpecialEdition, false);
  assert.equal(content.image?.name, "radio.jpg");
});

test("a one-off can publish from the night description", () => {
  const event = {
    repeatUnit: "once",
    description: "",
    shortDescription: "",
    dates: [
      {
        overrides: {
          description: "Some event",
          shortDescription: "Some event",
        },
      },
    ],
  };
  assert.equal(seriesDescriptionForPublish(event), "Some event");
  assert.equal(seriesShortDescriptionForPublish(event), "Some event");
  assert.equal(
    seriesDescriptionForPublish({ ...event, description: "Series copy" }),
    "Series copy",
  );
  assert.equal(
    seriesDescriptionForPublish({ repeatUnit: "week", description: "", dates: event.dates }),
    "",
  );
  assert.equal(
    resolveOccurrenceContent(
      { ...event, shortDescription: "Some event test" },
      event.dates[0],
    ).shortDescription,
    "Some event test",
  );
  assert.equal(
    resolveOccurrenceContent(event, event.dates[0]).shortDescription,
    "Some event",
  );
});

test("a one-off edit marks the preview stale", async () => {
  const { publishState } = await import("./event-store.js");
  const event = {
    name: "Amos Mas",
    slug: "amos-mas",
    repeatUnit: "once",
    description: "Some event",
    shortDescription: "Some event",
    startsOn: "2026-10-18",
    endsOn: "",
    skippedDates: [],
    extraDates: [],
    replacesSeries: "",
  };
  const row = {
    id: "18",
    date: "2026-10-18",
    sanityId: "event-amos-mas-2026-10-18",
    overrides: {
      description: "Some event",
      shortDescription: "Some event",
    },
  };
  const hash = occurrenceHash({ ...event, dates: [row] }, row);
  const dates = [{ ...row, snapshots: { preview: { hash, at: "now" } } }];
  assert.equal(publishState(event, dates, "2026-09-23").preview, "current");
  assert.equal(
    publishState(
      { ...event, shortDescription: "Some event test" },
      dates,
      "2026-09-23",
    ).preview,
    "stale",
  );
  assert.equal(
    publishState(
      { ...event, replacesSeries: "gwenda-radio" },
      dates,
      "2026-09-23",
    ).preview,
    "stale",
  );
  assert.equal(
    publishState({ ...event, replacesSeries: "keep:gwenda-radio" }, dates, "2026-09-23")
      .preview,
    "current",
  );
});

test("a once event publishes as one night with no recurrence label", () => {
  assert.equal(seriesScheduleMode({ repeatUnit: "once" }), "once");
  assert.equal(recurrenceLabel({ repeatUnit: "once", startsOn: "2026-10-18" }), "");
  const document = sanitySeriesDocument({
    slug: "amo-mas",
    title: "Amo MAS",
    description: "A night of...",
    schedule: "once",
  });
  assert.equal(document.schedule, "once");
  assert.equal(document.replacesSeriesId, "");
  const linked = sanitySeriesDocument({
    slug: "amo-mas",
    title: "Amo MAS",
    schedule: "once",
    replacesSeriesId: "gwenda-radio",
  });
  assert.equal(linked.replacesSeriesId, "gwenda-radio");
});

test("uses concise weekly recurrence labels", () => {
  assert.equal(
    recurrenceLabel({ repeatEvery: 1, repeatUnit: "week", weekdays: ["wed"] }),
    "Every Wednesday",
  );
  assert.equal(
    recurrenceLabel({ repeatEvery: 2, repeatUnit: "week", weekdays: ["thu"] }),
    "Every 2 weeks on Thursday",
  );
});

test("turns light Markdown into structured event description blocks", () => {
  const blocks = plainToEventDescription(
    "First paragraph with **bold** copy.\n\n## What to expect\n\n- Vinyl DJs\n- Guest sets",
  );

  assert.equal(blocks.length, 4);
  assert.equal(blocks[0].children[1].text, "bold");
  assert.deepEqual(blocks[0].children[1].marks, ["strong"]);
  assert.equal(blocks[1].style, "h2");
  assert.equal(blocks[2].listItem, "bullet");
  assert.equal(blocks[3].children[0].text, "Guest sets");
});

test("a night's own link wins over the series link", () => {
  const event = { name: "Jazz", pageUrl: "https://series.example/", dates: [
    { date: "2026-10-01", overrides: { pageUrl: "https://guest.example/" } },
    { date: "2026-10-08", overrides: {} },
  ] };
  assert.equal(resolveOccurrenceContent(event, event.dates[0]).pageUrl, "https://guest.example/");
  assert.equal(resolveOccurrenceContent(event, event.dates[1]).pageUrl, "https://series.example/");
});

test("a series with no start date and no nights ahead waits for dates", () => {
  const today = "2026-09-26";
  assert.equal(seriesAwaitingDates({ repeatUnit: "none", startsOn: "", dates: [] }, today), true);
  assert.equal(seriesAwaitingDates({ repeatUnit: "", dates: [] }, today), true);
  // Schedule cleared on a series that already ran: past nights do not count.
  assert.equal(
    seriesAwaitingDates(
      { repeatUnit: "none", startsOn: "", dates: [{ date: "2026-08-01" }], extraDates: ["2026-08-01"] },
      today,
    ),
    true,
  );
  assert.equal(seriesAwaitingDates({ repeatUnit: "none", startsOn: "2026-10-03" }, today), false);
  assert.equal(seriesAwaitingDates({ repeatUnit: "none", extraDates: ["2026-10-03"] }, today), false);
  // Every Wednesday, start date to come.
  assert.equal(
    seriesAwaitingDates({ repeatUnit: "week", weekdays: ["wed"], startsOn: "", dates: [] }, today),
    true,
  );
  assert.equal(
    seriesAwaitingDates({ repeatUnit: "week", weekdays: ["wed"], startsOn: "2026-09-30", endsOn: "2026-12-30" }, today),
    false,
  );
  assert.equal(seriesAwaitingDates({ repeatUnit: "once", startsOn: "", dates: [] }, today), false);

  const waiting = sanitySeriesDocument({ slug: "vinyl-club", title: "Vinyl Club", datesPending: true });
  assert.equal(waiting.datesPending, true);
  // Left off otherwise, so series already on the website stay unchanged.
  const dated = sanitySeriesDocument({ slug: "vinyl-club", title: "Vinyl Club" });
  assert.equal("datesPending" in dated, false);
});
