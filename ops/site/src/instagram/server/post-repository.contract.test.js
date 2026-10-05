/**
 * What every InstagramPostRepository adapter must do (#26). The same cases
 * run on each adapter: memory, and D1 on a real SQLite with the real
 * migrations applied (so the in-flight unique index is covered too).
 */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "vitest";
import { createTestD1 } from "../../../../../shared/testing/d1-sqlite.js";
import { d1PostRepository } from "./adapters/d1-posts.js";
import { memoryPostRepository } from "./adapters/memory-posts.js";
import { POST_STATUS, newPost } from "./post-model.js";

const ADAPTERS = {
  memory: () => memoryPostRepository(),
  d1: () => d1PostRepository(createTestD1("ops")),
};

const ASSET = "image-0a1b2c3d4e5f60718293a4b5c6d7e8f901234567-1600x1000-jpg";

function post(overrides = {}) {
  return newPost({
    eventId: "12",
    nightOn: "2026-10-08",
    caption: "Negroni Chess\n\nThursday 8 October",
    imageAsset: ASSET,
    imageUrl: "https://cdn.sanity.io/images/p/production/x-1600x1000.jpg?w=1080&h=1350",
    containerId: "c1",
    postedBy: "editor@gwenda.co.uk",
    now: new Date("2026-10-05T18:02:00.000Z"),
    ...overrides,
  });
}

for (const [name, make] of Object.entries(ADAPTERS)) {
  describe(`InstagramPostRepository: ${name}`, () => {
    let repo;
    beforeEach(() => {
      repo = make();
    });

    it("keeps every field of a post", async () => {
      const started = await repo.start(post());
      assert.ok(started.id);
      const { id, ...stored } = await repo.get(started.id);
      assert.equal(id, started.id);
      assert.deepEqual(stored, { ...post(), eventId: "12" });
    });

    it("one post in flight per night", async () => {
      assert.ok(await repo.start(post()));
      assert.equal(await repo.start(post({ containerId: "c2" })), null);
      // Another night, the series, another event: all free.
      assert.ok(await repo.start(post({ nightOn: "2026-10-15" })));
      assert.ok(await repo.start(post({ nightOn: "" })));
      assert.equal(await repo.start(post({ nightOn: "" })), null);
      assert.ok(await repo.start(post({ eventId: "13" })));
    });

    it("the night is free again once the post is sent or failed", async () => {
      const first = await repo.start(post());
      await repo.fail(first.id, "Instagram couldn't fetch the image.");
      const second = await repo.start(post({ containerId: "c2" }));
      assert.ok(second);
      await repo.finish(second.id, { mediaId: "m1", permalink: "https://instagram.com/p/m1", sentAt: "2026-10-05T18:03:00.000Z" });
      assert.ok(await repo.start(post({ containerId: "c3" })));
    });

    it("finishing records the post sent", async () => {
      const started = await repo.start(post());
      const sent = await repo.finish(started.id, { mediaId: "m1", permalink: "https://instagram.com/p/m1", sentAt: "2026-10-05T18:03:00.000Z" });
      assert.equal(sent.status, POST_STATUS.sent);
      assert.equal(sent.mediaId, "m1");
      assert.equal(sent.permalink, "https://instagram.com/p/m1");
      assert.equal(sent.sentAt, "2026-10-05T18:03:00.000Z");
      assert.deepEqual(await repo.get(started.id), sent);
    });

    it("can't send a post twice, or fail a sent one", async () => {
      const started = await repo.start(post());
      await repo.finish(started.id, { mediaId: "m1", permalink: "" });
      await assert.rejects(repo.finish(started.id, { mediaId: "m2" }), { status: 409, message: "This post was already sent." });
      await assert.rejects(repo.fail(started.id, "x"), { status: 409 });
      assert.equal((await repo.get(started.id)).mediaId, "m1");
    });

    it("failing keeps what went wrong", async () => {
      const started = await repo.start(post());
      const failed = await repo.fail(started.id, "Instagram can't use this image's shape.");
      assert.equal(failed.status, POST_STATUS.failed);
      assert.equal(failed.lastError, "Instagram can't use this image's shape.");
      await assert.rejects(repo.finish(started.id, { mediaId: "m1" }), { status: 409 });
    });

    it("lists an event's posts newest first, or one night's", async () => {
      const a = await repo.start(post());
      await repo.fail(a.id, "x");
      const b = await repo.start(post());
      const c = await repo.start(post({ nightOn: "" }));
      await repo.start(post({ eventId: "99" }));
      assert.deepEqual((await repo.listFor("12")).map((p) => p.id), [c.id, b.id, a.id]);
      assert.deepEqual((await repo.listFor("12", "2026-10-08")).map((p) => p.id), [b.id, a.id]);
      assert.deepEqual((await repo.listFor("12", "")).map((p) => p.id), [c.id]);
      assert.deepEqual(await repo.listFor("12", "2027-01-01"), []);
    });

    it("a missing post is null", async () => {
      assert.equal(await repo.get("424242"), null);
    });
  });
}
