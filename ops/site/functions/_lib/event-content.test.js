import test from "node:test";
import assert from "node:assert/strict";
import {
  occurrenceHash,
  plainToEventDescription,
  recurrenceLabel,
  resolveOccurrenceContent,
  sanityEventDocument,
} from "./event-content.js";

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
  assert.equal(document.time, "From 4pm");
  assert.equal(document.offer, "Guest offer");
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
    description: "A guest set and late jam.",
    time: "",
    startTime: "",
    endTime: "",
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
