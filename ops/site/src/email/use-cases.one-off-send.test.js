/**
 * Use cases (#348): a one-off email going to the mailing list, through the
 * real API handlers with Mailchimp faked (testing/fake-world.js): no test
 * here can reach a real inbox.
 *
 * The rules these prove:
 *   1. off production nothing goes to the list, whoever asks
 *   2. only an admin sends, and only with the confirm
 *   3. it goes once: pressing twice, or a retried request, sends once
 *   4. Mailchimp refusing leaves it "didn't send", with why; a lost answer is
 *      asked about, never sent again; one that didn't send can be sent again
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { resetConfigCacheForTests } from "../../../../shared/config.js";
import { createTestD1 } from "../../../../shared/testing/d1-sqlite.js";
import { onRequestPost as createEmail } from "../../functions/api/email/one-off/index.js";
import { onRequestGet as getEmail, onRequestPatch as saveEmail } from "../../functions/api/email/one-off/[id].js";
import { onRequestPost as sendToList } from "../../functions/api/email/one-off/[id]/send.js";
import { callApi, createFakeWorld } from "../testing/fake-world.js";
import { TUESDAY_MORNING, signedIn } from "./testing.js";

const ADMIN = "admin@example.com";
const STAFF = "staff@example.com";

let world;

beforeEach(async () => {
  vi.useFakeTimers({ now: TUESDAY_MORNING, toFake: ["Date"] });
  resetConfigCacheForTests();
  world = await createFakeWorld();
  world.env.OPS_DB = createTestD1("ops");
  world.install();
  world.makeOwner(ADMIN);
});

afterEach(() => {
  world.restore();
  vi.useRealTimers();
});

/** Production ops with Mailchimp connected. */
function production() {
  world.env.SITE_ENV = "production";
  world.mailchimp.connect(world.env);
  world.makeOwner(ADMIN);
}

const SECTIONS = [
  { kind: "heading", text: "Pinsa A Roma" },
  { kind: "copy", text: "Roman pinsa on Mondays and Tuesdays." },
  { kind: "booking" },
];

const at = (id, suffix = "") => ({ path: `/api/email/one-off/${id}${suffix}`, params: { id: String(id) } });

async function api(handler, email, options) {
  return callApi(world, handler, { ...options, headers: email ? await signedIn(world, email) : {} });
}

async function draft(body = { name: "Pinsa promo", subject: "New at Gwenda: Pinsa A Roma", sections: SECTIONS }) {
  const res = await api(createEmail, STAFF, { method: "POST", path: "/api/email/one-off", body });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return res.data.email;
}

const press = (id, email = ADMIN, body = { confirm: "send" }) =>
  api(sendToList, email, { method: "POST", ...at(id, "/send"), body });
const read = async (id) => (await api(getEmail, STAFF, { method: "GET", ...at(id) })).data.email;

describe("one-off emails: sending to the list", () => {
  it("off production nothing goes, even for an admin", async () => {
    world.mailchimp.connect(world.env);
    const email = await draft();
    const res = await press(email.id);
    assert.equal(res.status, 403);
    assert.match(res.data.error, /only production ops can send/);
    assert.equal(world.mailchimp.audienceSends.length, 0);
    assert.equal((await read(email.id)).status, "draft");
  });

  it("an admin sends it, once, and it says how many it went to", async () => {
    production();
    const email = await draft();

    const res = await press(email.id);
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.email.status, "sent");
    assert.equal(res.data.email.recipients, 244);
    assert.ok(res.data.email.sentAt);
    assert.equal(world.mailchimp.audienceSends.length, 1);
    const [sent] = world.mailchimp.audienceSends;
    assert.equal(sent.subject, "New at Gwenda: Pinsa A Roma");
    assert.match(sent.html, /Book a table/);

    const again = await press(email.id);
    assert.equal(again.status, 200);
    assert.equal(world.mailchimp.audienceSends.length, 1, "pressed twice, sent once");

    const change = await api(saveEmail, ADMIN, { method: "PATCH", ...at(email.id), body: { subject: "Changed" } });
    assert.equal(change.status, 409, "a sent email can't be changed");
  });

  it("is for admins only, and only with the confirm", async () => {
    production();
    const email = await draft();
    const staff = await press(email.id, STAFF);
    assert.equal(staff.status, 403);
    const unconfirmed = await press(email.id, ADMIN, {});
    assert.equal(unconfirmed.status, 400);
    assert.equal(world.mailchimp.audienceSends.length, 0);
    assert.equal((await read(email.id)).status, "draft");
  });

  it("won't send one that isn't ready", async () => {
    production();
    const email = await draft({ name: "Empty", subject: "", sections: [] });
    const res = await press(email.id);
    assert.equal(res.status, 409);
    assert.match(res.data.error, /subject/);
    assert.equal(world.mailchimp.audienceSends.length, 0);
  });

  it("Mailchimp refusing leaves it 'didn't send', with why, and it can be sent again", async () => {
    production();
    const email = await draft();
    world.mailchimp.fail.send = { status: 500, detail: "Mailchimp is down.", once: true };

    const res = await press(email.id);
    assert.equal(res.status, 424);
    assert.match(res.data.error, /didn't send/);
    const failed = await read(email.id);
    assert.equal(failed.status, "failed");
    assert.match(failed.reason, /Nothing was sent/);
    assert.equal(world.mailchimp.audienceSends.length, 0);

    const retry = await press(email.id);
    assert.equal(retry.status, 200, JSON.stringify(retry.data));
    assert.equal(retry.data.email.status, "sent");
    assert.equal(world.mailchimp.audienceSends.length, 1);
  });

  it("a lost answer is asked about, not sent again: it went, so it's sent", async () => {
    production();
    const email = await draft();
    world.mailchimp.fail.send = { status: 500, detail: "Timed out.", once: true, landed: true };

    const res = await press(email.id);
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.email.status, "sent");
    assert.equal(world.mailchimp.audienceSends.length, 1);
  });
});
