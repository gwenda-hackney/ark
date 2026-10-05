/**
 * Use cases: an editor posts a night, a series or a special to Instagram.
 * In-memory events and posts, and the memory publisher (or the fake
 * Instagram, where the image itself matters). Behaviour is checked through
 * the use cases only, never storage.
 */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "vitest";
import { memoryEventRepository } from "../../events/server/adapters/memory-events.js";
import { createFakeInstagram, memoryStore, tinyJpeg } from "../../../../instagram-fake/src/fake-instagram.js";
import { graphPublisher, graphSettings } from "./adapters/graph-publisher.js";
import { memoryPostRepository } from "./adapters/memory-posts.js";
import { memoryPublisher } from "./adapters/memory-publisher.js";
import { dryRunPublisher } from "./publisher.js";
import { checkPost, draftPost, postNow } from "./post-to-instagram.js";

const SERIES_ASSET = "image-0a1b2c3d4e5f60718293a4b5c6d7e8f901234567-1600x1000-jpg";
const FLYER_ASSET = "image-ffeeddccbbaa99887766554433221100ffeeddcc-1080x1350-jpg";
const LIVE = { preview: { hash: "h" }, production: { hash: "h", at: "2026-10-01T10:00:00Z" } };
const STAGED = { preview: { hash: "h" } };

async function seed() {
  const events = memoryEventRepository();
  const series = await events.create({
    name: "Negroni Chess",
    slug: "negroni-chess",
    artist: "",
    offer: "Two for one",
    shortDescription: "Chess by the canal.",
    startTime: "19:00",
    repeatUnit: "week",
    repeatEvery: 1,
    weekdays: ["thu"],
    mainImage: { asset: SERIES_ASSET },
    heroCrops: { crop: { left: 0, top: 0, right: 0, bottom: 0 }, hotspot: { x: 0.3, y: 0.5, width: 0.2, height: 0.2 } },
  });
  const live = await events.saveNight(series.id, {
    date: "2026-10-08",
    slug: "negroni-chess-2026-10-08",
    label: "",
    snapshots: LIVE,
    overrides: { artist: "The Knights", pageUrl: "https://www.instagram.com/theknights/", image: { asset: FLYER_ASSET }, heroCrops: { fit: "whole" } },
  });
  await events.saveNight(series.id, { date: "2026-10-15", slug: "negroni-chess-2026-10-15", label: "", snapshots: STAGED });
  const special = await events.create({
    name: "Halloween",
    slug: "halloween",
    repeatUnit: "once",
    startsOn: "2026-10-31",
    mainImage: { asset: SERIES_ASSET },
  });
  await events.saveNight(special.id, { date: "2026-10-31", slug: "halloween-2026-10-31", label: "", snapshots: LIVE });
  const legacy = await events.create({ name: "Old", slug: "old", repeatUnit: "once", mainImage: { name: "x.jpg", url: "https://files/x.jpg" } });
  await events.saveNight(legacy.id, { date: "2026-10-20", slug: "old-2026-10-20", label: "", snapshots: LIVE });
  return { events, series, special, legacy, live };
}

const SITE = { projectId: "gwscpagy", origin: "https://gwenda-web-dev.pages.dev" };

describe("Instagram: the composer", () => {
  let world;
  beforeEach(async () => {
    world = await seed();
  });

  it("a night starts from its own flyer, whole, and a caption", async () => {
    const draft = await draftPost({ events: world.events, posts: memoryPostRepository(), site: SITE }, { eventId: world.series.id, date: "2026-10-08" });
    assert.equal(draft.kind, "night");
    assert.equal(draft.live, true);
    const image = new URL(draft.imageUrl);
    assert.match(image.pathname, /ffeeddccbbaa99887766554433221100ffeeddcc-1080x1350\.jpg$/);
    assert.equal(image.searchParams.get("fit"), "fill");
    assert.equal(
      draft.caption,
      "Negroni Chess\n\nThursday 8 October, 7pm\n\nWith @theknights\n\nTwo for one\n\nMore at gwenda-web-dev.pages.dev/events/negroni-chess-2026-10-08",
    );
    assert.equal(draft.captionLimit, 2200);
    assert.deepEqual(draft.posts, []);
    assert.equal(draft.lastPosted, null);
  });

  it("a series starts from its photo, framed on its hotspot, and links its page", async () => {
    const draft = await draftPost({ events: world.events, posts: null, site: SITE }, { eventId: world.series.id });
    assert.equal(draft.kind, "series");
    assert.equal(draft.live, true, "one of its nights is on the website");
    assert.equal(new URL(draft.imageUrl).searchParams.get("fp-x"), "0.3000");
    assert.match(draft.caption, /^Negroni Chess\n\nEvery Thursday, 7pm/);
    assert.match(draft.caption, /gwenda-web-dev\.pages\.dev\/whats-on\/negroni-chess$/);
  });

  it("a special is its one night", async () => {
    const draft = await draftPost({ events: world.events, posts: null, site: SITE }, { eventId: world.special.id });
    assert.equal(draft.kind, "special");
    assert.equal(draft.nightOn, "");
    assert.match(draft.caption, /Saturday 31 October/);
    assert.match(draft.caption, /\/events\/halloween-2026-10-31$/);
  });

  it("an image from before the new image store can't be posted", async () => {
    const draft = await draftPost({ events: world.events, posts: null, site: SITE }, { eventId: world.legacy.id });
    assert.equal(draft.imageUrl, "");
    assert.match(draft.imageProblem, /Upload it again on Details/);
  });

  it("a night not in ops is a 404", async () => {
    await assert.rejects(draftPost({ events: world.events, posts: null, site: SITE }, { eventId: world.series.id, date: "2027-01-01" }), {
      status: 404,
    });
  });
});

describe("Instagram: posting", () => {
  let world;
  let posts;
  let publisher;
  let deps;
  const night = () => ({ eventId: world.series.id, date: "2026-10-08", caption: "Negroni Chess tonight", postedBy: "editor@gwenda.co.uk" });

  beforeEach(async () => {
    world = await seed();
    posts = memoryPostRepository();
    publisher = memoryPublisher();
    deps = { events: world.events, posts, publisher, site: SITE, sleep: async () => {}, now: () => new Date("2026-10-05T18:02:00Z") };
  });

  it("a post is recorded with its permalink", async () => {
    const { post } = await postNow(deps, night());
    assert.equal(post.status, "sent");
    assert.match(post.permalink, /^https:\/\/www\.instagram\.com\/p\/m\d+\/$/);
    assert.equal(post.postedBy, "editor@gwenda.co.uk");
    assert.equal(post.sentAt, "2026-10-05T18:02:00.000Z");
    assert.equal(publisher.published.length, 1);
    assert.equal(publisher.published[0].caption, "Negroni Chess tonight");
    const draft = await draftPost(deps, { eventId: world.series.id, date: "2026-10-08" });
    assert.equal(draft.lastPosted.permalink, post.permalink);
  });

  it("a double click doesn't post twice", async () => {
    const results = await Promise.allSettled([postNow(deps, night()), postNow(deps, night())]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const refused = results.find((r) => r.status === "rejected");
    assert.equal(refused.reason.status, 409);
    assert.match(refused.reason.message, /already being posted/);
    assert.equal(publisher.published.length, 1);
  });

  it("posting the same night again needs confirming", async () => {
    await postNow(deps, night());
    await assert.rejects(postNow(deps, night()), { status: 409, code: "already-posted" });
    const { post } = await postNow(deps, { ...night(), again: true });
    assert.equal(post.status, "sent");
    assert.equal(publisher.published.length, 2);
  });

  it("a slow container is waited for", async () => {
    publisher.slow = 3;
    const { post } = await postNow(deps, night());
    assert.equal(post.status, "sent");
  });

  it("a container still not ready is finished by the next Post, once", async () => {
    publisher.stuck = true;
    const first = await postNow(deps, night());
    assert.equal(first.pending, true);
    assert.match(first.message, /still preparing the image/);
    // Too soon: the first attempt may still be running.
    await assert.rejects(postNow(deps, night()), { status: 409, code: "in-flight" });
    // A minute later Instagram has finished; Post publishes that container.
    publisher.stuck = false;
    const later = { ...deps, now: () => new Date("2026-10-05T18:04:00Z") };
    const second = await postNow(later, night());
    assert.equal(second.recovered, true);
    assert.equal(second.post.status, "sent");
    assert.equal(publisher.published.length, 1);
    assert.equal(publisher.containers.size, 1, "no second container");
  });

  it("a post that went out before a crash is recorded, never published again", async () => {
    // The first request published, then stopped before recording it.
    const containerId = await publisher.createImage("https://cdn.sanity.io/x.jpg", "Negroni Chess tonight");
    await publisher.status(containerId);
    await publisher.publish(containerId);
    const { newPost } = await import("./post-model.js");
    await posts.start(newPost({ eventId: world.series.id, nightOn: "2026-10-08", containerId, now: new Date("2026-10-05T17:00:00Z") }));

    const result = await postNow(deps, night());
    assert.equal(result.recovered, true);
    assert.equal(result.post.status, "sent");
    assert.equal(publisher.published.length, 1);
  });

  it("an image the fake Instagram rejects shows a plain-English error", async () => {
    const fake = createFakeInstagram({
      token: "t",
      userId: "1",
      store: memoryStore(),
      // The CDN hands back a panorama: wrong shape for a feed post.
      fetchImage: async () => new Response(tinyJpeg(3000, 1000)),
    });
    const graph = graphPublisher(graphSettings({ SITE_ENV: "dev", INSTAGRAM_GRAPH_URL: "https://fake.test", INSTAGRAM_ACCESS_TOKEN: "t", INSTAGRAM_USER_ID: "1" }), {
      fetchImpl: (url, init) => fake.fetch(new Request(url, init)),
    });
    await assert.rejects(postNow({ ...deps, publisher: graph }, night()), {
      status: 422,
      message: "Instagram can't use this image's shape. It must be between 4:5 (portrait) and 1.91:1 (landscape).",
    });
    assert.deepEqual(await posts.listFor(world.series.id), [], "nothing stored, nothing in flight");
  });

  it("the real 4:5 image passes the fake Instagram end to end", async () => {
    const fake = createFakeInstagram({
      token: "t",
      userId: "1",
      store: memoryStore(),
      fetchImage: async (url) => {
        const u = new URL(url);
        return new Response(tinyJpeg(Number(u.searchParams.get("w")), Number(u.searchParams.get("h"))));
      },
    });
    const graph = graphPublisher(graphSettings({ SITE_ENV: "dev", INSTAGRAM_GRAPH_URL: "https://fake.test/v24.0", INSTAGRAM_ACCESS_TOKEN: "t", INSTAGRAM_USER_ID: "1" }), {
      fetchImpl: (url, init) => fake.fetch(new Request(url, init)),
    });
    const { post } = await postNow({ ...deps, publisher: graph }, night());
    assert.match(post.permalink, /^https:\/\/fake\.test\/p\/\d+$/);
  });

  it("a container Instagram gives up on is recorded failed, and the night is free again", async () => {
    publisher.failNext("status", Object.assign(new Error("x"), { status: 422 }));
    await assert.rejects(postNow(deps, night()), { status: 422 });
    // The failure above happened mid-wait; the claim is stale later and recovered as failed.
    const later = { ...deps, now: () => new Date("2026-10-05T18:10:00Z") };
    publisher.containers.get("c1").status = "ERROR";
    const { post } = await postNow(later, night());
    assert.equal(post.status, "sent");
    const history = await posts.listFor(world.series.id, "2026-10-08");
    assert.deepEqual(history.map((p) => p.status), ["sent", "failed"]);
  });

  it("Instagram refusing to publish is recorded failed", async () => {
    publisher.failNext("publish", Object.assign(new Error("Instagram's limit on posts has been reached for now."), { status: 429, graph: { code: 4 } }));
    await assert.rejects(postNow(deps, night()), { status: 429 });
    const [failed] = await posts.listFor(world.series.id, "2026-10-08");
    assert.equal(failed.status, "failed");
    assert.match(failed.lastError, /limit on posts/);
  });

  it("the daily limit stops it before anything is sent", async () => {
    publisher.quotaNow = { used: 100, total: 100 };
    await assert.rejects(postNow(deps, night()), { status: 429 });
    assert.equal(publisher.containers.size, 0);
  });

  it("a night that isn't on the website is refused", async () => {
    await assert.rejects(postNow(deps, { ...night(), date: "2026-10-15" }), {
      status: 409,
      code: "not-live",
      message: "This night isn't on the website yet. Update website first, so the link in the post works.",
    });
    assert.equal(publisher.calls.length, 0);
  });

  it("a caption over the limit is refused before Instagram sees it", async () => {
    await assert.rejects(postNow(deps, { ...night(), caption: "x".repeat(2201) }), { status: 400, message: /2,201 characters/ });
    assert.equal(publisher.calls.length, 0);
  });

  it("dry run: nothing is sent and nothing stored", async () => {
    const result = await postNow({ ...deps, publisher: dryRunPublisher() }, night());
    assert.equal(result.dryRun, true);
    assert.deepEqual(await posts.listFor(world.series.id), []);
  });

  it("Check has Instagram check image and caption, and posts nothing", async () => {
    const result = await checkPost(deps, night());
    assert.equal(result.checked, true);
    assert.equal(result.account.username, "gwenda_test");
    assert.equal(publisher.published.length, 0);
    assert.deepEqual(await posts.listFor(world.series.id), []);
  });

  it("Check works before the night is on the website", async () => {
    const result = await checkPost(deps, { ...night(), date: "2026-10-15" });
    assert.equal(result.checked, true);
  });

  it("Check says when Instagram is still checking", async () => {
    publisher.stuck = true;
    await assert.rejects(checkPost(deps, night()), { status: 409, message: /still checking the image/ });
  });
});
