/**
 * migrations/2026-11-12-popup-logo.mjs, run as a deploy runs it against a D1
 * with the real schema, with Sanity, Google Calendar and Drive faked: the
 * plan (the logo file), a dry run, for real, again (nothing left to do), a
 * run that stopped before the website, with a logo or a link the owner has
 * set since, and with no Chez Pickle. What the website shows is read the way
 * the website reads it (functions/_lib/sanity-events.js) and put through its
 * own rules (src/lib/popup-kitchen.js).
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { fetchPublishedCatalog } from "../../marketing/web/functions/_lib/sanity-events.js";
import { kitchenHeader, kitchenNow } from "../../marketing/web/src/lib/popup-kitchen.js";
import { parseImageAssetId } from "../../shared/sanity-image.js";
import { d1EventRepository } from "../../ops/site/src/events/server/adapters/d1-events.js";
import { d1MenuRepository } from "../../ops/site/src/menu/server/adapters/d1-menu.js";
import { d1VenueRepository } from "../../ops/site/src/venue/server/adapters/d1-venue.js";
import { createEvent, getEvent, setEventImage, setEventLogo } from "../../ops/site/src/events/server/event-store.js";
import { runWebsiteJob } from "../../ops/site/src/events/server/website-jobs.js";
import { createFakeWorld } from "../../ops/site/src/testing/fake-world.js";
import { createTestD1 } from "../../shared/testing/d1-sqlite.js";
import * as popupLogo from "../../migrations/2026-11-12-popup-logo.mjs";

const TODAY = "2026-11-12";
const hashOf = (asset) => parseImageAssetId(asset)?.sha1 || "";
const sha1 = (bytes) => createHash("sha1").update(bytes).digest("hex");

describe("2026-11-12-popup-logo", () => {
  let world;
  let logoSha1;
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(`${TODAY}T12:00:00Z`) });
    world = await createFakeWorld();
    world.install();
    logoSha1 = sha1(await readFile(popupLogo.LOGO));
  });
  afterEach(() => {
    world.restore();
    vi.useRealTimers();
  });

  const opsEnv = (db) => ({
    ...world.env,
    eventRepository: d1EventRepository(db),
    menuRepository: d1MenuRepository(db),
    venueRepository: d1VenueRepository(db),
  });

  async function untilReady(env, id) {
    for (let step = 0; step < 60; step += 1) {
      const result = await runWebsiteJob(env, { eventId: id });
      assert.equal(result.failed || "", "", `website job failed: ${result.failed}`);
      if (result.done) return;
    }
    throw new Error("the website job never finished");
  }

  /** Chez Pickle as dev and production have it: Thursdays to the 26th, a pop-up kitchen with its picture, on the website. */
  async function seed(db, fields = {}) {
    const env = opsEnv(db);
    const event = await createEvent(env, {
      name: "Chez Pickle",
      category: "popup",
      description: "Smash burgers from Chez Pickle, in the kitchen at Gwenda.",
      shortDescription: "Burgers in the kitchen",
      startsOn: TODAY,
      endsOn: "2026-11-26",
      repeatUnit: "week",
      repeatEvery: 1,
      weekdays: ["thu"],
      startTime: "17:00",
      endTime: "22:00",
      ...fields,
    });
    await setEventImage(env, event.id, { bytes: new TextEncoder().encode("burger"), filename: "burger.jpg", contentType: "image/jpeg" });
    await untilReady(env, event.id);
    return getEvent(env, event.id);
  }

  async function run(db, { dryRun = false } = {}) {
    const lines = [];
    const result = await popupLogo.up({
      env: "dev",
      d1: () => db,
      processEnv: world.env,
      dryRun,
      log: (line) => lines.push(line),
    });
    return { lines, text: lines.join("\n"), result };
  }

  /** Home's Food board as the live website would draw it today. */
  async function website() {
    const { series, occurrences } = await fetchPublishedCatalog({
      SANITY_PROJECT_ID: world.env.SANITY_PROJECT_ID,
      SANITY_API_TOKEN: world.env.SANITY_API_TOKEN,
      SITE_ENV: "production",
    });
    const { popup } = kitchenNow(series, occurrences, TODAY);
    return { popup, header: kitchenHeader(popup) };
  }

  const stored = async (db) => JSON.stringify(await d1EventRepository(db).exportAll());

  it("plans the logo: the PNG the website showed, read from the migration's own folder", async () => {
    const logo = await popupLogo.planLogo();
    assert.equal(logo.contentType, "image/png");
    assert.equal(logo.filename, "chez-pickle.png");
    assert.deepEqual([...logo.bytes.subarray(1, 4)], [...Buffer.from("PNG")]);
    assert.equal(logo.sha1, logoSha1);
    await assert.rejects(
      () => popupLogo.planLogo(new URL("./no-such-logo.png", popupLogo.LOGO)),
      /The logo isn't at .*no-such-logo\.png/,
    );
  });

  it("a dry run changes nothing anywhere, and says what it would do", async () => {
    const db = createTestD1("ops");
    await seed(db);
    const before = await stored(db);
    const docs = JSON.stringify(world.sanity.view("raw"));
    const { text, result } = await run(db, { dryRun: true });
    assert.deepEqual(result, { logo: "added", instagram: "added", published: false });
    assert.equal(await stored(db), before);
    assert.equal(JSON.stringify(world.sanity.view("raw")), docs);
    assert.match(text, /Dry run: working on a copy/);
    assert.match(text, /would add chez-pickle\.png as the logo of "Chez Pickle" \(event \d+\)/);
    assert.match(text, /its Instagram would be https:\/\/www\.instagram\.com\/chezpickle/);
    assert.match(text, /would put it on the website \(\/whats-on\/chez-pickle\)/);
  });

  it("for real: Chez Pickle has its logo and Instagram in ops, and the website shows them", async () => {
    const db = createTestD1("ops");
    const { id } = await seed(db);
    assert.equal((await website()).popup.logo, null, "no logo before");

    const { text, result } = await run(db);
    assert.deepEqual(result, { logo: "added", instagram: "added", published: true });
    const event = await getEvent(opsEnv(db), id);
    assert.equal(hashOf(event.logo.asset), logoSha1, "the file's own bytes, on Sanity");
    assert.equal(event.pageUrl, popupLogo.INSTAGRAM);
    assert.equal(hashOf(event.mainImage.asset), sha1(new TextEncoder().encode("burger")), "its picture stays");

    const { popup, header } = await website();
    assert.match(popup.logo.url, new RegExp(logoSha1));
    assert.equal(popup.pageUrl, popupLogo.INSTAGRAM);
    assert.equal(header.line, "In the kitchen: Chez Pickle, Thursdays");
    assert.equal(header.href, "/whats-on/chez-pickle/");
    assert.match(text, /added chez-pickle\.png as the logo of "Chez Pickle"/);
    assert.match(text, /its Instagram is now https:\/\/www\.instagram\.com\/chezpickle/);
    assert.match(text, /"Chez Pickle" \(event \d+\) is on the website: \/whats-on\/chez-pickle/);
  });

  it("does nothing the second time", async () => {
    const db = createTestD1("ops");
    await seed(db);
    await run(db);
    const before = await stored(db);
    const docs = JSON.stringify(world.sanity.view("raw"));
    const { text, result } = await run(db);
    assert.deepEqual(result, { logo: "there", instagram: "there", published: false });
    assert.equal(await stored(db), before);
    assert.equal(JSON.stringify(world.sanity.view("raw")), docs);
    assert.match(text, /Nothing to do: "Chez Pickle" \(event \d+\) has its logo and its Instagram, and the website is in step/);
  });

  it("finishes a run that saved the logo in ops but never reached the website", async () => {
    const db = createTestD1("ops");
    const { id } = await seed(db, { pageUrl: popupLogo.INSTAGRAM });
    const logo = await popupLogo.planLogo();
    await setEventLogo(opsEnv(db), id, logo);
    const { text, result } = await run(db);
    assert.deepEqual(result, { logo: "there", instagram: "there", published: true });
    assert.match(text, /finishing: putting it on the website/);
    assert.match((await website()).popup.logo.url, new RegExp(logoSha1));
  });

  it("never replaces a logo or a link the owner has set since", async () => {
    const db = createTestD1("ops");
    const { id } = await seed(db, { pageUrl: "chezpickle.example" });
    const env = opsEnv(db);
    const own = await setEventLogo(env, id, { bytes: new TextEncoder().encode("their new logo"), filename: "new.png", contentType: "image/png" });
    await untilReady(env, id);
    const { text, result } = await run(db);
    assert.deepEqual(result, { logo: "owner's", instagram: "owner's", published: false });
    const event = await getEvent(env, id);
    assert.equal(event.logo.asset, own.logo.asset);
    assert.equal(event.pageUrl, "https://chezpickle.example/");
    assert.match(text, /left alone: "Chez Pickle" \(event \d+\) has a logo of its own; it was not replaced/);
    assert.match(text, /left alone: its link is https:\/\/chezpickle\.example\/; it was not replaced/);
  });

  it("takes an Instagram already there, however it was typed, as done", async () => {
    const db = createTestD1("ops");
    await seed(db, { pageUrl: "@chezpickle" });
    const { result } = await run(db);
    assert.equal(result.instagram, "there");
  });

  it("stops with a clear message when there is no Chez Pickle", async () => {
    const db = createTestD1("ops");
    await assert.rejects(() => run(db), /Chez Pickle was not found: no event at \/whats-on\/chez-pickle/);
  });
});
