/**
 * The Graph API publisher against the fake Instagram's handler (the same one
 * the dev Worker runs), and the guards that keep dev away from Meta.
 */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "vitest";
import { createFakeInstagram, memoryStore, tinyJpeg } from "../../../../../instagram-fake/src/fake-instagram.js";
import { META_GRAPH_URL, graphPublisher, graphSettings, isMetaHost, plainGraphError } from "./graph-publisher.js";
import { instagramPublisher } from "../publisher.js";

const TOKEN = "fake-token";
const USER = "17841400000000001";
const BASE = "https://instagram-fake.example.workers.dev/v24.0";
const IMAGE = "https://cdn.sanity.io/images/p/production/abc-1600x1000.jpg?w=1080&h=1350&fm=jpg";

/** The fake behind a fetch, with images served by `images(url)`. */
function setup({ images } = {}) {
  const store = memoryStore();
  const serve = images || (() => new Response(tinyJpeg(1080, 1350), { headers: { "Content-Type": "image/jpeg" } }));
  const fake = createFakeInstagram({ token: TOKEN, userId: USER, username: "gwenda_dev_test", store, fetchImage: async (url) => serve(url) });
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push(`${init?.method || "GET"} ${new URL(url).pathname}`);
    return fake.fetch(new Request(url, init));
  };
  const settings = graphSettings({ SITE_ENV: "dev", INSTAGRAM_GRAPH_URL: BASE, INSTAGRAM_ACCESS_TOKEN: TOKEN, INSTAGRAM_USER_ID: USER });
  return { publisher: graphPublisher(settings, { fetchImpl }), requests, store, settings };
}

describe("graph publisher: against the fake Instagram", () => {
  let world;
  beforeEach(() => {
    world = setup();
  });

  it("names the account and its quota", async () => {
    assert.deepEqual(await world.publisher.account(), {
      id: USER,
      username: "gwenda_dev_test",
      profileUrl: "https://www.instagram.com/gwenda_dev_test/",
    });
    assert.deepEqual(await world.publisher.quota(), { used: 0, total: 100 });
  });

  it("container, then publish, then the permalink", async () => {
    const container = await world.publisher.createImage(IMAGE, "Negroni Chess");
    assert.equal(await world.publisher.status(container), "FINISHED");
    const media = await world.publisher.publish(container);
    assert.equal(await world.publisher.status(container), "PUBLISHED");
    assert.equal(await world.publisher.permalink(media), `https://instagram-fake.example.workers.dev/p/${media}`);
    assert.deepEqual(await world.publisher.quota(), { used: 1, total: 100 });
    assert.deepEqual(world.requests, [
      `POST /v24.0/${USER}/media`,
      `GET /v24.0/${container}`,
      `POST /v24.0/${USER}/media_publish`,
      `GET /v24.0/${container}`,
      `GET /v24.0/${media}`,
      `GET /v24.0/${USER}/content_publishing_limit`,
    ]);
  });

  it("a published container can't be published again", async () => {
    const container = await world.publisher.createImage(IMAGE, "x");
    await world.publisher.status(container);
    await world.publisher.publish(container);
    await assert.rejects(world.publisher.publish(container), /Instagram said: This media has already been published/);
  });

  it("publishing before the image is ready says to wait", async () => {
    const container = await world.publisher.createImage(IMAGE, "x [fail:slow]");
    await assert.rejects(world.publisher.publish(container), { status: 409, notReady: true, message: /still preparing the image/ });
  });

  it("an image of the wrong shape is refused in plain words", async () => {
    world = setup({ images: () => new Response(tinyJpeg(1600, 600)) });
    await assert.rejects(world.publisher.createImage(IMAGE, "x"), {
      status: 422,
      message: "Instagram can't use this image's shape. It must be between 4:5 (portrait) and 1.91:1 (landscape).",
    });
  });

  it("an image Instagram can't fetch, or that isn't a JPEG", async () => {
    world = setup({ images: () => new Response("missing", { status: 404 }) });
    await assert.rejects(world.publisher.createImage(IMAGE, "x"), { message: /couldn't fetch the image/ });
    world = setup({ images: () => new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47])) });
    await assert.rejects(world.publisher.createImage(IMAGE, "x"), { message: "Instagram only takes JPEG images for a post." });
  });

  it("an expired token, and the daily limit", async () => {
    await assert.rejects(world.publisher.createImage(IMAGE, "x [fail:token]"), { status: 424, message: /expired or been withdrawn/ });
    const container = await world.publisher.createImage(IMAGE, "x [fail:rate-limit]");
    await world.publisher.status(container);
    await assert.rejects(world.publisher.publish(container), { status: 429, message: /limit on posts/ });
  });

  it("the wrong token is refused", async () => {
    const fake = createFakeInstagram({ token: TOKEN, userId: USER, store: memoryStore() });
    const publisher = graphPublisher({ ...world.settings, token: "someone-else" }, { fetchImpl: (url, init) => fake.fetch(new Request(url, init)) });
    await assert.rejects(publisher.account(), { status: 424 });
  });

  it("no answer is plain too", async () => {
    const down = graphPublisher(world.settings, { fetchImpl: async () => { throw new TypeError("fetch failed"); } });
    await assert.rejects(down.account(), { message: "Couldn't reach Instagram. Try again in a minute." });
    const html = graphPublisher(world.settings, { fetchImpl: async () => new Response("<html>", { status: 502 }) });
    await assert.rejects(html.account(), { message: /didn't answer properly \(HTTP 502\)/ });
  });

  it("anything else passes on Meta's own words", () => {
    const error = plainGraphError({ error: { code: 100, message: "(#100) Something odd", error_user_msg: "Something odd happened" } });
    assert.equal(error.message, "Instagram said: Something odd happened");
    assert.equal(error.status, 422);
  });
});

describe("graph publisher: environment guards", () => {
  const creds = { INSTAGRAM_ACCESS_TOKEN: "t", INSTAGRAM_USER_ID: "1" };

  it("production talks to graph.facebook.com", () => {
    assert.equal(graphSettings({ SITE_ENV: "production", ...creds }).baseUrl, META_GRAPH_URL);
    assert.match(META_GRAPH_URL, /^https:\/\/graph\.facebook\.com\/v\d+\.0$/);
    assert.equal(graphSettings({ SITE_ENV: "production", ...creds }).mode, "live");
  });

  it("production refuses any other address", () => {
    for (const url of [BASE, "http://graph.facebook.com/v24.0", "https://graph.instagram.com/v24.0", "https://localhost:8787"]) {
      assert.throws(() => graphSettings({ SITE_ENV: "production", INSTAGRAM_GRAPH_URL: url, ...creds }), { notSetUp: true }, url);
    }
  });

  it("outside production, Meta's addresses are refused", () => {
    for (const env of ["dev", "local"]) {
      for (const url of ["https://graph.facebook.com/v24.0", "https://graph.instagram.com", "https://www.facebook.com"]) {
        assert.throws(() => graphSettings({ SITE_ENV: env, INSTAGRAM_GRAPH_URL: url, ...creds }), /Only production ops may talk to Instagram itself/);
      }
    }
    assert.ok(isMetaHost("graph.facebook.com"));
    assert.ok(!isMetaHost("notfacebook.com"));
  });

  it("dev without INSTAGRAM_GRAPH_URL is a dry run, even holding production values", () => {
    const settings = graphSettings({ SITE_ENV: "dev", INSTAGRAM_ACCESS_TOKEN: "production-token", INSTAGRAM_USER_ID: "1" });
    assert.equal(settings.mode, "dry-run");
    assert.equal(settings.token, "");
    assert.equal(instagramPublisher({ SITE_ENV: "dev" }).mode, "dry-run");
  });

  it("missing credentials mean not set up", () => {
    assert.throws(() => graphSettings({ SITE_ENV: "production" }), { notSetUp: true, message: "Instagram isn't set up in this environment yet." });
    assert.throws(() => graphSettings({ SITE_ENV: "dev", INSTAGRAM_GRAPH_URL: BASE, INSTAGRAM_ACCESS_TOKEN: "t" }), { notSetUp: true });
  });

  it("an unknown environment is an error, not a guess", () => {
    assert.throws(() => graphSettings({}), /SITE_ENV is not set/);
  });
});
