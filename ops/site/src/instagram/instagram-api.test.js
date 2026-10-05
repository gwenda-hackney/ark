/**
 * The Instagram tab's API, end to end: the real Pages Functions, with
 * Baserow, Sanity and the fake Instagram behind one fake fetch
 * (testing/fake-world.js). Events and posts are in memory.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "vitest";
import { callApi, createFakeWorld } from "../testing/fake-world.js";
import { tinyJpeg } from "../../../instagram-fake/src/fake-instagram.js";
import { memoryEventRepository } from "../events/server/adapters/memory-events.js";
import { memoryPostRepository } from "./server/adapters/memory-posts.js";
import { onRequestGet as getInstagram } from "../../functions/api/events/[id]/instagram.js";
import { onRequestPost as postInstagram } from "../../functions/api/events/[id]/instagram/post.js";
import { onRequestGet as getStatus } from "../../functions/api/instagram/status.js";

const ASSET = "image-0a1b2c3d4e5f60718293a4b5c6d7e8f901234567-1600x1000-jpg";

describe("Instagram API", () => {
  let world;
  let eventId;

  beforeEach(async () => {
    world = await createFakeWorld();
    world.install();
    const events = memoryEventRepository();
    const series = await events.create({ name: "Negroni Chess", slug: "negroni-chess", repeatUnit: "week", weekdays: ["thu"], mainImage: { asset: ASSET } });
    await events.saveNight(series.id, {
      date: "2026-10-08",
      slug: "negroni-chess-2026-10-08",
      label: "",
      snapshots: { preview: { hash: "h" }, production: { hash: "h" } },
    });
    await events.saveNight(series.id, { date: "2026-10-15", slug: "negroni-chess-2026-10-15", label: "", snapshots: {} });
    eventId = series.id;
    world.env.eventRepository = events;
    world.env.instagramPostRepository = memoryPostRepository();
  });
  afterEach(() => world.restore());

  const tab = (date = "2026-10-08") =>
    callApi(world, getInstagram, { path: `/api/events/${eventId}/instagram?date=${date}`, params: { id: eventId } });
  const post = (body) =>
    callApi(world, postInstagram, { method: "POST", path: `/api/events/${eventId}/instagram/post`, params: { id: eventId }, body });

  it("shows the account posts go to", async () => {
    const res = await callApi(world, getStatus, { path: "/api/instagram/status" });
    assert.equal(res.status, 200);
    assert.equal(res.data.ready, true);
    assert.equal(res.data.mode, "fake");
    assert.equal(res.data.account.username, "gwenda_dev_test");
  });

  it("check, post, then the tab lists it and asks before posting again", async () => {
    const draft = await tab();
    assert.equal(draft.status, 200);
    assert.equal(draft.data.setup.ready, true);
    assert.equal(draft.data.draft.live, true);
    const caption = draft.data.draft.caption;

    const checked = await post({ date: "2026-10-08", caption, check: true });
    assert.equal(checked.status, 200, JSON.stringify(checked.data));
    assert.equal(checked.data.checked, true);

    const sent = await post({ date: "2026-10-08", caption });
    assert.equal(sent.status, 200, JSON.stringify(sent.data));
    assert.equal(sent.data.post.status, "sent");
    assert.match(sent.data.post.permalink, /^https:\/\/instagram\.fake\.test\/p\/\d+$/);
    // The fake really fetched the 1080x1350 JPEG from the Sanity CDN.
    assert.ok(world.calls.some((call) => call.startsWith("GET cdn.sanity.io/images/gwscpagy/production/")));

    const after = await tab();
    assert.equal(after.data.draft.posts.length, 1);
    assert.equal(after.data.draft.lastPosted.permalink, sent.data.post.permalink);

    const again = await post({ date: "2026-10-08", caption });
    assert.equal(again.status, 409);
    assert.equal(again.data.error, "This was already posted to Instagram. Confirm to post it again.");
    const confirmed = await post({ date: "2026-10-08", caption, again: true });
    assert.equal(confirmed.status, 200);
  });

  it("a night not on the website is refused in plain words", async () => {
    const res = await post({ date: "2026-10-15", caption: "Hi" });
    assert.equal(res.status, 409);
    assert.match(res.data.error, /isn't on the website yet\. Update website first/);
  });

  it("an image Instagram can't use is explained", async () => {
    world.serveImage = () => new Response(tinyJpeg(1000, 2000));
    const res = await post({ date: "2026-10-08", caption: "Hi" });
    assert.equal(res.status, 422);
    assert.match(res.data.error, /can't use this image's shape/);
  });

  it("without a database here, the tab says Instagram isn't set up", async () => {
    delete world.env.instagramPostRepository;
    const res = await tab();
    assert.equal(res.status, 200);
    assert.equal(res.data.setup.ready, false);
    assert.equal(res.data.setup.message, "Instagram isn't set up in this environment yet.");
    assert.match(res.data.setup.detail, /OPS_DB/);
    const refused = await post({ date: "2026-10-08", caption: "Hi" });
    assert.equal(refused.status, 409);
    assert.equal(refused.data.error, "Instagram isn't set up in this environment yet.");
  });

  it("without credentials, not set up either", async () => {
    delete world.env.INSTAGRAM_ACCESS_TOKEN;
    const res = await callApi(world, getStatus, { path: "/api/instagram/status" });
    assert.equal(res.data.ready, false);
    assert.equal(res.data.mode, "off");
  });
});
