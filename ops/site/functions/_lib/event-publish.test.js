import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { existingImageAssets, heroImage } from "./event-publish.js";

afterEach(() => mock.restoreAll());

const env = { SANITY_API_TOKEN: "token", SANITY_PROJECT_ID: "proj", SITE_ENV: "production" };
const photo = { name: "abc123_flyer.jpg", url: "https://files.example/abc123_flyer.jpg" };

function json(body) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
}

function stubFetch(handler) {
  const calls = [];
  mock.method(globalThis, "fetch", async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, method: init.method || "GET", body: init.body });
    return handler(url, init);
  });
  return calls;
}

describe("event photos on the website", () => {
  it("reuses a photo already in Sanity without downloading it", async () => {
    const calls = stubFetch((url) => {
      // The preview: drafts over published, in the one dataset.
      assert.match(url, /\/data\/query\/production\?.*perspective=previewDrafts/);
      return json({ result: [{ _id: "image-abc-1x1-jpg", originalFilename: "ops-abc123_flyer.jpg" }] });
    });
    const known = await existingImageAssets(env, [photo, photo, null]);
    const hero = await heroImage(env, photo, known);
    assert.equal(hero.asset._ref, "image-abc-1x1-jpg");
    assert.equal(calls.length, 1);
  });

  it("uploads a new photo once and names an existing match so it is found next time", async () => {
    const calls = stubFetch((url) => {
      if (url.startsWith("https://files.example/")) return new Response("bytes");
      if (url.includes("/assets/images/production")) {
        return json({ document: { _id: "image-old-1x1-jpg", originalFilename: "event.jpg" } });
      }
      if (url.includes("/data/mutate/production")) return json({ results: [] });
      throw new Error(`unexpected ${url}`);
    });
    const known = new Map();
    const hero = await heroImage(env, photo, known);
    assert.equal(hero.asset._ref, "image-old-1x1-jpg");
    assert.equal(hero.originalFilename, undefined);
    assert.equal(new URL(calls[1].url).searchParams.get("filename"), "ops-abc123_flyer.jpg");
    assert.deepEqual(JSON.parse(calls[2].body).mutations, [
      { patch: { id: "image-old-1x1-jpg", set: { originalFilename: "ops-abc123_flyer.jpg" } } },
    ]);
    const again = await heroImage(env, photo, known);
    assert.equal(again.asset._ref, "image-old-1x1-jpg");
    assert.equal(calls.length, 3);
  });
});
