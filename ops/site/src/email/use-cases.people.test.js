/**
 * Use cases: Email → People, everyone on our own list (website and Wi-Fi
 * sign-ups) with where they stand in Mailchimp, through the real API handler
 * on the website D1 (a real SQLite with the migrations).
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { resetConfigCacheForTests } from "../../../../shared/config.js";
import { subscriberRepository } from "../../../../shared/guests/subscriber-repository.js";
import { onRequestGet as listPeople } from "../../functions/api/email/people.js";
import { callApi, createFakeWorld } from "../testing/fake-world.js";
import { mailchimpStatus } from "./server/people.js";
import { TUESDAY_MORNING, signedIn } from "./testing.js";

const ADMIN = "admin@example.com";
const STAFF = "staff@example.com";

let world;

beforeEach(async () => {
  vi.useFakeTimers({ now: TUESDAY_MORNING, toFake: ["Date"] });
  resetConfigCacheForTests();
  world = await createFakeWorld();
  world.install();
  world.setConfig("ops.admin_emails", ADMIN, { env: world.env.SITE_ENV });
});

afterEach(() => {
  world.restore();
  vi.useRealTimers();
});

const api = async (email) => callApi(world, listPeople, { path: "/api/email/people", headers: await signedIn(world, email) });

/** One of each: in Mailchimp, waiting for the sync, unsubscribed there, and a Wi-Fi guest who didn't tick the box. */
async function seed() {
  const repo = subscriberRepository(world.env);
  await repo.create({ email: "in@example.com", tags: ["website"], signedUpOn: "2026-10-01", marketing: true, marketingOn: "2026-10-01", synced: true });
  await repo.create({ email: "new@example.com", tags: ["wifi"], signedUpOn: "2026-11-09", marketing: true, marketingOn: "2026-11-09", lastSeenOn: "2026-11-09", visitDays: 1, synced: false });
  await repo.create({ email: "left@example.com", tags: ["website", "wifi"], signedUpOn: "2026-09-20", marketing: false, marketingOn: "2026-09-20", marketingOffOn: "2026-11-02", lastSeenOn: "2026-10-30", synced: true });
  await repo.create({ email: "guest@example.com", tags: ["wifi"], signedUpOn: "2026-11-05", marketing: false, lastSeenOn: "2026-11-08", visitDays: 3, synced: false });
}

describe("the people on our list", () => {
  it("lists everyone, newest first: where we got them, when, last seen, and their Mailchimp status", async () => {
    await seed();
    const { status, data } = await api(ADMIN);
    assert.equal(status, 200, JSON.stringify(data));
    assert.deepEqual(
      data.people.map((person) => [person.email, person.source, person.acquiredOn, person.lastSeenOn, person.visitDays, person.mailchimp.label]),
      [
        ["new@example.com", "Wi-Fi", "2026-11-09", "2026-11-09", 1, "Waiting"],
        ["guest@example.com", "Wi-Fi", "2026-11-05", "2026-11-08", 3, "Not on the list"],
        ["in@example.com", "Website", "2026-10-01", null, 0, "In Mailchimp"],
        ["left@example.com", "Website, Wi-Fi", "2026-09-20", "2026-10-30", 0, "Unsubscribed"],
      ],
    );
    assert.equal(data.people.at(-1).unsubscribedOn, "2026-11-02");
    assert.deepEqual(data.counts, { total: 4, in: 1, waiting: 1, unsubscribed: 1, off: 1 });
  });

  it("is for admins only on production ops: it's guests' email addresses", async () => {
    await seed();
    world.env.SITE_ENV = "production";
    world.setConfig("ops.admin_emails", ADMIN, { env: "production" });
    assert.equal((await api(ADMIN)).status, 200);
    const { status, data } = await api(STAFF);
    assert.equal(status, 403);
    assert.match(data.error, /Only admins/);
  });
});

describe("Mailchimp status", () => {
  it("follows our side of the sync", () => {
    assert.equal(mailchimpStatus({ marketing: true, synced: true }).status, "in");
    assert.equal(mailchimpStatus({ marketing: true, synced: false }).status, "waiting");
    assert.equal(mailchimpStatus({ marketing: false, marketingOffOn: "2026-11-02", synced: true }).status, "unsubscribed");
    assert.equal(mailchimpStatus({ marketing: false, marketingOffOn: null, synced: false }).status, "off");
  });
});
