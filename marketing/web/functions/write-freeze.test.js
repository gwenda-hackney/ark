import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { refuseFrozenWrites } from "./_middleware.js";
import { createTestD1 } from "../../../shared/testing/d1-sqlite.js";
import { run } from "../../../shared/d1.js";

const context = (env, method, path) => ({
  env,
  request: new Request(`https://gwenda.test${path}`, { method }),
  next: async () => new Response("passed on"),
});

describe("website write freeze", () => {
  it("holds sign-ups, forms and RSVPs while guests move; reads and other paths pass", async () => {
    const WEBSITE_DB = createTestD1("website");
    const env = { WEBSITE_DB };
    assert.equal(
      await (
        await refuseFrozenWrites(context(env, "POST", "/api/subscribe"))
      ).text(),
      "passed on",
    );

    await run(
      WEBSITE_DB,
      "INSERT INTO _meta (key, value) VALUES ('write_freeze:guests', 'now')",
    );
    for (const path of [
      "/api/subscribe",
      "/api/forms",
      "/api/forms/edit",
      "/api/rsvp",
    ]) {
      assert.equal(
        (await refuseFrozenWrites(context(env, "POST", path))).status,
        423,
        path,
      );
    }
    assert.equal(
      await (
        await refuseFrozenWrites(context(env, "GET", "/api/forms"))
      ).text(),
      "passed on",
    );
    assert.equal(
      await (
        await refuseFrozenWrites(context(env, "POST", "/api/events"))
      ).text(),
      "passed on",
    );
  });
});
