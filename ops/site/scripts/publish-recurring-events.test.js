import test from "node:test";
import assert from "node:assert/strict";
import {
  parseArgs,
  planRecurringPublishes,
  publishRecurringEvents,
} from "./publish-recurring-events.mjs";
import { occurrenceHash } from "../functions/_lib/event-content.js";

const TODAY = "2026-09-22";

function recurringEvent(overrides = {}) {
  const event = {
    id: "7",
    name: "Gwenda Nights",
    artist: "Vinyl DJs",
    offer: "",
    description: "Saturday nights.",
    startsOn: "2026-09-26",
    time: "16:00–01:30",
    startTime: "16:00",
    endTime: "01:30",
    repeatEvery: 1,
    repeatUnit: "week",
    weekdays: ["sat"],
    monthDay: 0,
    endsOn: "",
    slug: "gwenda-nights",
    dates: [],
    ...overrides,
  };
  return event;
}

function publishedRow(event, date, hash = occurrenceHash(event, date)) {
  return {
    id: date,
    date,
    snapshots: { production: { hash, at: `${date}T12:00:00.000Z` } },
  };
}

test("parseArgs accepts dry runs and rejects unknown flags", () => {
  assert.deepEqual(parseArgs(["--dry-run"]), { dryRun: true });
  assert.throws(() => parseArgs(["--force"]), /Unknown argument/);
});

test("plans only dates beyond the current live horizon", () => {
  const event = recurringEvent();
  event.dates = [
    publishedRow(event, "2026-09-26"),
    publishedRow(event, "2026-10-03"),
  ];

  const [plan] = planRecurringPublishes([event], { today: TODAY });
  assert.equal(plan.action, "publish");
  assert.equal(plan.missing[0], "2026-10-10");
  assert.ok(plan.missing.every((date) => date > "2026-10-03"));
});

test("skips a series with unpublished content edits", () => {
  const beforeEdit = recurringEvent();
  const edited = recurringEvent({ name: "Gwenda Saturday Nights" });
  edited.dates = [
    publishedRow(
      edited,
      "2026-10-03",
      occurrenceHash(beforeEdit, "2026-10-03"),
    ),
  ];

  const [plan] = planRecurringPublishes([edited], { today: TODAY });
  assert.equal(plan.action, "skip");
  assert.equal(plan.reason, "series has unpublished edits");
});

test("skips unpublished and one-off events", () => {
  const recurring = recurringEvent();
  const oneOff = recurringEvent({ id: "8", repeatUnit: "none" });
  const plans = planRecurringPublishes([recurring, oneOff], { today: TODAY });

  assert.deepEqual(
    plans.map((plan) => plan.reason),
    ["not live", "not recurring"],
  );
});

test("dry run never calls either publisher", async () => {
  const event = recurringEvent();
  event.dates = [publishedRow(event, "2026-09-26")];
  let calls = 0;

  const results = await publishRecurringEvents(
    {},
    {
      dryRun: true,
      loadEvents: async () => [event],
      publishPreview: async () => {
        calls += 1;
      },
      publishLive: async () => {
        calls += 1;
      },
    },
  );

  assert.equal(calls, 0);
  assert.equal(results[0].published, false);
});
