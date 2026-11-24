/**
 * Use cases (#348): promoting a pop-up kitchen in a one-off email, through
 * the real API handlers, with Sanity, Drive and Mailchimp faked and the ops
 * database a real SQLite with the migrations.
 */
import assert from "node:assert/strict";
import { NIGHT_NUDGE, POPUP_NUDGE } from "./server/promote.js";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { resetConfigCacheForTests } from "../../../../shared/config.js";
import { renderOneOffEmail } from "../../../../shared/email/one-off.js";
import { createTestD1 } from "../../../../shared/testing/d1-sqlite.js";
import { onRequestGet as getEmail } from "../../functions/api/email/one-off/[id].js";
import { onRequestGet as listChoices, onRequestPost as promote } from "../../functions/api/email/promote.js";
import { addGalleryImage, createEvent, setEventImage } from "../events/server/event-store.js";
import { createMenuItem, createMenuSection } from "../menu/server/menu-store.js";
import { createMenu } from "../menu/server/menus.js";
import { callApi, createFakeWorld } from "../testing/fake-world.js";
import { timeLabel } from "../venue/hours-model.js";
import { daysWords, popupWhen, previewLine } from "./server/promote.js";

/** Twelve o'clock as ops says it (hours-model.js): noon. */
const NOON = timeLabel("12:00");
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

async function api(handler, options = {}) {
  return callApi(world, handler, { ...options, headers: await signedIn(world, "someone@example.com") });
}

const picture = (name) => ({ bytes: new TextEncoder().encode(name), filename: `${name}.jpg`, contentType: "image/jpeg" });

/** Pinsa A Roma as ops has it: Mondays and Tuesdays from the 23rd, noon to 9pm, with its menu and pictures. */
async function seedPinsa() {
  const env = world.env;
  const event = await createEvent(env, {
    name: "Pinsa A Roma",
    category: "popup",
    description: "Roman pinsa on Mondays and Tuesdays: a light, crisp base. Plus fries and tiramisù.",
    startsOn: "2026-11-23",
    startTime: "12:00",
    endTime: "21:00",
    repeatUnit: "week",
    repeatEvery: 1,
    weekdays: ["mon", "tue"],
  });
  await setEventImage(env, event.id, picture("hero"));
  await addGalleryImage(env, event.id, picture("focaccia"));
  const menu = await createMenu(env, { name: "Pinsa A Roma", kind: "kitchen", popupSeriesId: event.id, days: "mon,tue" });
  const chapter = await createMenuSection(env, { title: "Pinsa A Roma", slug: "pinsa-a-roma", menuId: menu.id });
  const pinsa = await createMenuSection(env, { title: "Pinsa", slug: "pinsa-a-roma-pinsa", parentId: chapter._id });
  const dish = (name, price, description) =>
    createMenuItem(env, { name, price, description, sectionId: pinsa._id, placements: [{ channel: "digital", sectionId: pinsa._id }] });
  await dish("Trastevere (V)", "13.50", "Margherita: tomato, mozzarella and basil.");
  await dish("Colosseo", "14.50", "Spicy salami.");
  await dish("Villa Borghese (V)", "15.50", "Mixed veg.");
  await dish("Giulio Cesare", "16", "Chicken.");
  return event;
}

describe("promoting a pop-up kitchen", () => {
  it("lists the pop-up kitchens with nights to come, with when they cook", async () => {
    const event = await seedPinsa();
    const { status, data } = await api(listChoices, { path: "/api/email/promote" });
    assert.equal(status, 200);
    assert.deepEqual(data.templates, [
      { id: "night", label: "A night", choices: [] },
      {
        id: "popup",
        label: "A pop-up kitchen",
        choices: [{ id: String(event.id), name: "Pinsa A Roma", when: `Mondays and Tuesdays from Monday 23 November, ${NOON} – 9pm` }],
      },
    ]);
  });

  it("saves a draft from the template: picture, coming to Gwenda, when, three dishes, a second picture, the menu and booking", async () => {
    const event = await seedPinsa();
    const res = await api(promote, { method: "POST", path: "/api/email/promote", body: { template: "popup", id: String(event.id) } });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    const email = res.data.email;
    assert.equal(email.status, "draft");
    assert.equal(email.name, "Pinsa A Roma promo", "named for its card");
    assert.equal(email.subject, "Gwenda is teaming up with Pinsa A Roma! Mondays and Tuesdays");
    assert.equal(email.previewText, "Roman pinsa on Mondays and Tuesdays: a light, crisp base.");
    assert.deepEqual(
      email.sections.map((section) => section.kind),
      ["image", "heading", "copy", "heading", "copy", "image", "button", "booking"],
    );
    assert.equal(email.sections[1].text, "Gwenda is teaming up with Pinsa A Roma!");
    assert.match(email.sections[2].text, new RegExp(`\\*\\*Mondays and Tuesdays from Monday 23 November, ${NOON} – 9pm\\.\\*\\*\n\n${POPUP_NUDGE}$`));
    assert.equal(
      email.sections[4].text,
      [
        "**Trastevere (V)** £13.50: Margherita: tomato, mozzarella and basil.",
        "**Colosseo** £14.50: Spicy salami.",
        "**Villa Borghese (V)** £15.50: Mixed veg.",
      ].join("\n\n"),
      "three dishes, not the whole menu",
    );
    assert.notEqual(email.sections[0].assetId, email.sections[5].assetId, "two different pictures");
    assert.deepEqual(email.sections.slice(6), [
      { kind: "button", label: "See the whole menu →", link: "https://gwenda-web-dev.pages.dev/whats-on/pinsa-a-roma/", look: "link" },
      { kind: "booking" },
    ]);

    // It is an ordinary draft: it opens in the editor and renders as the email that would go.
    const opened = await api(getEmail, { path: `/api/email/one-off/${email.id}`, params: { id: String(email.id) } });
    const rendered = renderOneOffEmail(opened.data.email, opened.data.frame);
    assert.match(rendered.html, /Gwenda is teaming up with Pinsa A Roma!/);
    assert.match(rendered.html, /Trastevere \(V\)/);
  });

  it("refuses a template that isn't one, and a pop-up that isn't there", async () => {
    let res = await api(promote, { method: "POST", path: "/api/email/promote", body: { template: "concert", id: "1" } });
    assert.equal(res.status, 400);
    res = await api(promote, { method: "POST", path: "/api/email/promote", body: { template: "popup", id: "999" } });
    assert.equal(res.status, 404);
  });
});

/** A one-off night with a guest, an offer and a running order; a weekly quiz; a deal that isn't a night. */
async function seedNights() {
  const env = world.env;
  const party = await createEvent(env, {
    name: "Soul Saturday",
    category: "event",
    artist: "DJ Ana",
    offer: "£8 Negronis till 9",
    shortDescription: "Northern soul and Motown all night. Dancing shoes on.",
    startsOn: "2026-12-05",
    startTime: "19:00",
    endTime: "23:00",
    repeatUnit: "once",
    nightSchedule: [
      { label: "Warm-up", startTime: "19:00" },
      { label: "DJ Ana", startTime: "21:00", endTime: "23:00" },
    ],
  });
  await setEventImage(env, party.id, picture("dancefloor"));
  await addGalleryImage(env, party.id, picture("crowd"));
  const quiz = await createEvent(env, {
    name: "Pub Quiz",
    category: "event",
    description: "Six rounds, one winner.",
    startsOn: "2026-11-26",
    startTime: "19:30",
    repeatUnit: "week",
    repeatEvery: 1,
    weekdays: ["thu"],
  });
  await createEvent(env, { name: "Happy Hour", category: "promotion", offer: "2 for 1", startsOn: "2026-11-25", startTime: "17:00", endTime: "19:00", repeatUnit: "week", repeatEvery: 1, weekdays: ["wed"] });
  return { party, quiz };
}

describe("promoting a night", () => {
  it("lists the nights to come, soonest first, and no deals", async () => {
    const { party, quiz } = await seedNights();
    const { data } = await api(listChoices, { path: "/api/email/promote" });
    const nights = data.templates.find((template) => template.id === "night");
    assert.deepEqual(nights.choices, [
      { id: String(quiz.id), name: "Pub Quiz", when: "Thursdays from Thursday 26 November, 7:30pm" },
      { id: String(party.id), name: "Soul Saturday", when: "Saturday 5 December, 7pm – 11pm" },
    ]);
  });

  it("saves a draft: picture, name with its guest, when and the offer, the running order, a second picture, its page and booking", async () => {
    const { party } = await seedNights();
    const res = await api(promote, { method: "POST", path: "/api/email/promote", body: { template: "night", id: String(party.id) } });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    const email = res.data.email;
    assert.equal(email.name, "Soul Saturday promo");
    assert.equal(email.subject, "Soul Saturday with DJ Ana at Gwenda, Saturday 5 December");
    assert.equal(email.previewText, "Northern soul and Motown all night.");
    assert.deepEqual(
      email.sections.map((section) => section.kind),
      ["image", "heading", "copy", "heading", "copy", "image", "button", "booking"],
    );
    assert.equal(email.sections[1].text, "Soul Saturday with DJ Ana");
    assert.equal(
      email.sections[2].text,
      ["Northern soul and Motown all night. Dancing shoes on.", "**Saturday 5 December, 7pm – 11pm.**", "**£8 Negronis till 9.**", NIGHT_NUDGE].join("\n\n"),
    );
    assert.equal(email.sections[4].text, "**7pm** Warm-up\n\n**9pm – 11pm** DJ Ana");
    assert.notEqual(email.sections[0].assetId, email.sections[5].assetId, "two different pictures");
    assert.deepEqual(email.sections.slice(6), [
      { kind: "button", label: "More about the night →", link: "https://gwenda-web-dev.pages.dev/whats-on/soul-saturday/", look: "link" },
      { kind: "booking" },
    ]);
    const opened = await api(getEmail, { path: `/api/email/one-off/${email.id}`, params: { id: String(email.id) } });
    assert.match(renderOneOffEmail(opened.data.email, opened.data.frame).html, /Soul Saturday with DJ Ana/);
  });

  it("names a weekly night by its days, and leaves out what it hasn't got", async () => {
    const { quiz } = await seedNights();
    const { data } = await api(promote, { method: "POST", path: "/api/email/promote", body: { template: "night", id: String(quiz.id) } });
    assert.equal(data.email.subject, "Pub Quiz at Gwenda, Thursdays");
    assert.deepEqual(
      data.email.sections.map((section) => section.kind),
      ["heading", "copy", "button", "booking"],
    );
  });

  it("refuses a deal or a pop-up as a night", async () => {
    await seedNights();
    const pinsa = await seedPinsa();
    const res = await api(promote, { method: "POST", path: "/api/email/promote", body: { template: "night", id: String(pinsa.id) } });
    assert.equal(res.status, 404);
  });
});

describe("promote words", () => {
  it("names the days as a guest would", () => {
    assert.equal(daysWords(["mon", "tue"]), "Mondays and Tuesdays");
    assert.equal(daysWords(["wed", "thu", "fri", "sat", "sun"]), "Wednesdays to Sundays");
    assert.equal(daysWords(["thu"]), "Thursdays");
    assert.equal(daysWords(["mon", "wed", "fri"]), "Mondays, Wednesdays and Fridays");
  });

  it("keeps the inbox preview to plain words", () => {
    assert.equal(previewLine("**Karaoke Thursdays 🎤** Every Thursday, the mic is open. Come sing."), "Karaoke Thursdays 🎤 Every Thursday, the mic is open.");
    assert.equal(previewLine("See [our menu](https://gwenda.co.uk/menu/) tonight"), "See our menu tonight");
    assert.equal(previewLine("", "Thursdays, 7pm"), "Thursdays, 7pm");
  });

  it("says from when only while it hasn't started, and a one-off by its date", () => {
    const weekly = { repeatUnit: "week", weekdays: ["mon"], startsOn: "2026-11-23", startTime: "12:00", endTime: "21:00" };
    assert.equal(popupWhen(weekly, "2026-11-19"), `Mondays from Monday 23 November, ${NOON} – 9pm`);
    assert.equal(popupWhen(weekly, "2026-12-01"), `Mondays, ${NOON} – 9pm`);
    // Already cooking, on a night added before its schedule starts: no "from", and not new.
    assert.equal(popupWhen({ ...weekly, dates: [{ date: "2026-11-12" }, { date: "2026-11-23" }] }, "2026-11-19"), `Mondays, ${NOON} – 9pm`);
    assert.equal(popupWhen({ repeatUnit: "once", startsOn: "2026-12-05", startTime: "18:00", endTime: "22:00" }, "2026-11-19"), "Saturday 5 December, 6pm – 10pm");
  });
});
