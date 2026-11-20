/**
 * An Event card's choices (#348), as the editor asks for them
 * (GET /api/email/cards): each night to come in the next weeks, and each
 * deal and pop-up kitchen with nights to come, in the card's words.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { resetConfigCacheForTests } from "../../../../shared/config.js";
import { renderOneOffEmail } from "../../../../shared/email/one-off.js";
import { createTestD1 } from "../../../../shared/testing/d1-sqlite.js";
import { onRequestGet as cards } from "../../functions/api/email/cards.js";
import { createEvent, setEventImage } from "../events/server/event-store.js";
import { callApi, createFakeWorld } from "../testing/fake-world.js";
import { timeLabel } from "../venue/hours-model.js";
import { TUESDAY_MORNING, signedIn } from "./testing.js";

let world;

beforeEach(async () => {
  vi.useFakeTimers({ now: TUESDAY_MORNING, toFake: ["Date"] });
  resetConfigCacheForTests();
  world = await createFakeWorld();
  world.env.OPS_DB = createTestD1("ops");
  world.install();
});

afterEach(() => {
  world.restore();
  vi.useRealTimers();
});

const picture = (name) => ({ bytes: new TextEncoder().encode(name), filename: `${name}.jpg`, contentType: "image/jpeg" });

describe("an Event card's choices", () => {
  it("nights to come with their date and hours, then pop-up kitchens with their days; ready to go in the email", async () => {
    const karaoke = await createEvent(world.env, {
      name: "Karaoke",
      category: "event",
      shortDescription: "Sing your heart out.",
      startsOn: "2026-12-03",
      startTime: "20:00",
      endTime: "23:30",
      repeatUnit: "once",
    });
    await setEventImage(world.env, karaoke.id, picture("mic"));
    await createEvent(world.env, {
      name: "Pinsa A Roma",
      category: "popup",
      startsOn: "2026-11-23",
      startTime: "12:00",
      endTime: "21:00",
      repeatUnit: "week",
      repeatEvery: 1,
      weekdays: ["mon", "tue"],
    });
    await createEvent(world.env, { name: "Far off", category: "event", startsOn: "2027-06-01", repeatUnit: "once" });

    const { status, data } = await callApi(world, cards, { path: "/api/email/cards", headers: await signedIn(world, "someone@example.com") });
    assert.equal(status, 200);
    assert.deepEqual(
      data.choices.map((choice) => [choice.group, choice.label, choice.detail]),
      [
        ["Nights", "Karaoke", `Thursday 3 December, ${timeLabel("20:00")} – ${timeLabel("23:30")}`],
        ["Pop-up kitchens", "Pinsa A Roma", `Mondays and Tuesdays from Monday 23 November, ${timeLabel("12:00")} – ${timeLabel("21:00")}`],
      ],
      "a night months away isn't offered",
    );
    const night = data.choices[0].card;
    assert.equal(night.kind, "event");
    assert.equal(night.date, "2026-12-03");
    assert.equal(night.note, "Sing your heart out.");
    assert.match(night.link, /\/whats-on\/karaoke\/$/);
    assert.match(night.assetId, /^image-/);

    const { html } = renderOneOffEmail({ subject: "S", sections: [night, data.choices[1].card] }, { site: { origin: "https://gwenda.example" }, images: { projectId: "p", dataset: "production" } });
    assert.match(html, />Karaoke<\/a>/);
    assert.match(html, />Pop-up kitchen<\/td>/);
  });
});
