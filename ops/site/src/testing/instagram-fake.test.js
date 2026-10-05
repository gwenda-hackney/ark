/**
 * The fake Instagram (ops/instagram-fake): it must catch what Meta would, so
 * a post that passes in dev passes in production.
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { FAKE_LIMITS, createFakeInstagram, jpegSize, memoryStore, tinyJpeg } from "../../../instagram-fake/src/fake-instagram.js";

const TOKEN = "t0ken";
const USER = "17841400000000001";
const ORIGIN = "https://fake.test";

function fake({ image = tinyJpeg(1080, 1350), now, anyToken = false } = {}) {
  const store = memoryStore();
  const fetched = [];
  const ig = createFakeInstagram({
    token: TOKEN,
    userId: USER,
    anyToken,
    store,
    now,
    fetchImage: async (url) => {
      fetched.push(url);
      return typeof image === "function" ? image(url) : new Response(image);
    },
  });
  const call = async (method, path, params = {}, headers = {}) => {
    const url = new URL(`${ORIGIN}${path}`);
    const init = { method, headers: { Authorization: `Bearer ${TOKEN}`, ...headers } };
    if (method === "GET") for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    else {
      init.headers["Content-Type"] = "application/x-www-form-urlencoded";
      init.body = new URLSearchParams(params).toString();
    }
    const response = await ig.fetch(new Request(url, init));
    const type = response.headers.get("Content-Type") || "";
    return { status: response.status, body: type.includes("json") ? await response.json() : await response.text() };
  };
  return { call, store, fetched };
}

async function publish(world, caption = "Hello", path = "") {
  const created = await world.call("POST", `${path}/v24.0/${USER}/media`, { image_url: "https://cdn.sanity.io/x.jpg", caption });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const container = created.body.id;
  const status = await world.call("GET", `${path}/v24.0/${container}`, { fields: "status_code" });
  const published = await world.call("POST", `${path}/v24.0/${USER}/media_publish`, { creation_id: container });
  return { container, status, published };
}

describe("fake Instagram", () => {
  it("reads a JPEG's size", () => {
    assert.deepEqual(jpegSize(tinyJpeg(1080, 1350)), { width: 1080, height: 1350 });
    assert.equal(jpegSize(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), null);
  });

  it("answers as the account, with or without a version, by /me too", async () => {
    const world = fake();
    assert.deepEqual((await world.call("GET", `/v24.0/${USER}`, { fields: "id,username" })).body, { id: USER, username: "gwenda_dev_test" });
    assert.deepEqual((await world.call("GET", "/me")).body, { id: USER, username: "gwenda_dev_test" });
  });

  it("refuses a missing or wrong token in Meta's shape", async () => {
    const world = fake();
    const none = await world.call("GET", `/${USER}`, {}, { Authorization: "" });
    assert.equal(none.status, 400);
    const wrong = await world.call("GET", `/${USER}`, {}, { Authorization: "Bearer nope" });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.body.error.code, 190);
    assert.equal(wrong.body.error.type, "OAuthException");
    assert.ok(wrong.body.error.fbtrace_id);
  });

  it("the devcontainer's fake (anyToken) takes any token, but still needs one", async () => {
    const world = fake({ anyToken: true });
    const other = await world.call("GET", `/${USER}`, {}, { Authorization: "Bearer made-up-elsewhere" });
    assert.equal(other.status, 200);
    assert.equal(other.body.id, USER);
    const none = await world.call("GET", `/${USER}`, {}, { Authorization: "" });
    assert.equal(none.status, 400);
  });

  it("really fetches the image, then publishes and serves a preview page", async () => {
    const world = fake();
    const { status, published } = await publish(world, "Negroni Chess\n\n<b>Thursday</b>");
    assert.deepEqual(world.fetched, ["https://cdn.sanity.io/x.jpg"]);
    assert.equal(status.body.status_code, "FINISHED");
    const media = published.body.id;
    const link = await world.call("GET", `/v24.0/${media}`, { fields: "permalink" });
    assert.equal(link.body.permalink, `${ORIGIN}/p/${media}`);
    const page = await world.call("GET", `/p/${media}`);
    assert.equal(page.status, 200);
    assert.match(page.body, /Negroni Chess<br><br>&lt;b&gt;Thursday&lt;\/b&gt;/);
    assert.match(page.body, /src="https:\/\/cdn\.sanity\.io\/x\.jpg"/);
    assert.match((await world.call("GET", "/")).body, new RegExp(`/p/${media}`));
    const limit = await world.call("GET", `/${USER}/content_publishing_limit`, { fields: "quota_usage,config" });
    assert.deepEqual(limit.body.data[0], { quota_usage: 1, config: { quota_total: FAKE_LIMITS.postsPerDay, quota_duration: 86400 } });
  });

  it("checks the image's shape: 4:5 to 1.91:1", async () => {
    for (const [w, h, ok] of [
      [1080, 1350, true],
      [1080, 1080, true],
      [1910, 1000, true],
      [1080, 1400, false],
      [2000, 1000, false],
    ]) {
      const world = fake({ image: tinyJpeg(w, h) });
      const created = await world.call("POST", `/${USER}/media`, { image_url: "https://x/y.jpg", caption: "" });
      assert.equal(created.status === 200, ok, `${w}x${h}`);
      if (!ok) assert.equal(created.body.error.error_subcode, 2207009);
    }
  });

  it("checks the image is a JPEG Meta can fetch", async () => {
    let world = fake({ image: () => new Response("gone", { status: 404 }) });
    assert.equal((await world.call("POST", `/${USER}/media`, { image_url: "https://x/y.jpg" })).body.error.error_subcode, 2207052);
    world = fake({ image: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) });
    assert.equal((await world.call("POST", `/${USER}/media`, { image_url: "https://x/y.png" })).body.error.error_subcode, 2207026);
    world = fake();
    assert.equal((await world.call("POST", `/${USER}/media`, {})).body.error.code, 100);
  });

  it("checks the caption's limits", async () => {
    const world = fake();
    const long = await world.call("POST", `/${USER}/media`, { image_url: "https://x/y.jpg", caption: "x".repeat(2201) });
    assert.equal(long.status, 400);
    const tags = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ");
    assert.equal((await world.call("POST", `/${USER}/media`, { image_url: "https://x/y.jpg", caption: tags })).status, 400);
  });

  it("won't publish a container twice, or before it's ready", async () => {
    const world = fake();
    const { container } = await publish(world);
    const again = await world.call("POST", `/${USER}/media_publish`, { creation_id: container });
    assert.match(again.body.error.message, /already been published/);
    const slow = await world.call("POST", `/${USER}/media`, { image_url: "https://x/y.jpg", caption: "x" }, { "X-Fake-Fail": "slow" });
    const early = await world.call("POST", `/${USER}/media_publish`, { creation_id: slow.body.id });
    assert.equal(early.body.error.code, 9007);
  });

  it("fault switches: slow, stuck, error, token, rate limit", async () => {
    const world = fake();
    // A /fail/<mode> base URL, as dev ops would be configured.
    const slow = await world.call("POST", `/fail/slow/v24.0/${USER}/media`, { image_url: "https://x/y.jpg", caption: "x" });
    const statuses = [];
    for (let i = 0; i < 3; i += 1) statuses.push((await world.call("GET", `/${slow.body.id}`, { fields: "status_code" })).body.status_code);
    assert.deepEqual(statuses, ["IN_PROGRESS", "IN_PROGRESS", "FINISHED"]);

    const stuck = await world.call("POST", `/${USER}/media?fail=stuck`, { image_url: "https://x/y.jpg", caption: "x" });
    for (let i = 0; i < 5; i += 1) await world.call("GET", `/${stuck.body.id}`, { fields: "status_code" });
    assert.equal((await world.call("GET", `/${stuck.body.id}`, { fields: "status_code" })).body.status_code, "IN_PROGRESS");

    const broken = await world.call("POST", `/${USER}/media`, { image_url: "https://x/y.jpg", caption: "Hi [fail:error]" });
    assert.equal((await world.call("GET", `/${broken.body.id}`, { fields: "status_code" })).body.status_code, "ERROR");

    const expired = await world.call("GET", `/${USER}?fail=token`);
    assert.equal(expired.body.error.code, 190);
    assert.equal(expired.body.error.error_subcode, 463);

    const { published } = await publish(world, "x", "/fail/rate-limit");
    assert.equal(published.body.error.error_subcode, 2207042);
  });

  it("counts only the last 24 hours towards the limit", async () => {
    let clock = Date.parse("2026-10-05T10:00:00Z");
    const world = fake({ now: () => clock });
    await publish(world);
    clock += 25 * 60 * 60 * 1000;
    const limit = await world.call("GET", `/${USER}/content_publishing_limit`);
    assert.equal(limit.body.data[0].quota_usage, 0);
  });

  it("an unknown object is Meta's 100/33", async () => {
    const world = fake();
    const missing = await world.call("GET", "/12345", { fields: "status_code" });
    assert.equal(missing.body.error.code, 100);
    assert.equal(missing.body.error.error_subcode, 33);
    assert.equal((await world.call("GET", "/p/nope")).status, 404);
  });
});
