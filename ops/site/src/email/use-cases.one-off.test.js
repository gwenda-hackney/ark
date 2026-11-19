/**
 * Use cases (#348): writing a one-off email in ops, end to end through the
 * real API handlers, with Sanity and Mailchimp faked (testing/fake-world.js)
 * and the ops database a real SQLite with the migrations.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { resetConfigCacheForTests } from "../../../../shared/config.js";
import { createTestD1 } from "../../../../shared/testing/d1-sqlite.js";
import { onRequestPost as uploadImage } from "../../functions/api/email/images.js";
import {
  onRequestGet as listEmails,
  onRequestPost as createEmail,
} from "../../functions/api/email/one-off/index.js";
import {
  onRequestDelete as deleteEmail,
  onRequestGet as getEmail,
  onRequestPatch as saveEmail,
} from "../../functions/api/email/one-off/[id].js";
import { onRequestPost as sendTest } from "../../functions/api/email/one-off/[id]/test.js";
import { onRequestPost as sendWeeklyTest } from "../../functions/api/email/test.js";
import { oneOffEmailRepository } from "./server/one-off-email-repository.js";
import { renderOneOffEmail } from "../../../../shared/email/one-off.js";
import { callApi, createFakeWorld } from "../testing/fake-world.js";
import { TUESDAY_MORNING, publishWeek, signedIn } from "./testing.js";

let world;

beforeEach(async () => {
  vi.useFakeTimers({ now: TUESDAY_MORNING, toFake: ["Date"] });
  resetConfigCacheForTests();
  world = await createFakeWorld();
  world.env.OPS_DB = createTestD1("ops");
  world.install();
});

afterEach(() => {
  world.restore();
  vi.useRealTimers();
});

const SECTIONS = [
  { kind: "heading", text: "New Year's Eve" },
  { kind: "copy", text: "Doors at **9**.\n\nSee [the page](https://gwenda.co.uk/nye)." },
  { kind: "button", label: "Get tickets", link: "https://gwenda.co.uk/nye", look: "link" },
];

async function api(handler, { email = "someone@example.com", ...options } = {}) {
  return callApi(world, handler, { ...options, headers: email ? await signedIn(world, email) : {} });
}

async function create(body = { subject: "NYE at Gwenda", previewText: "Doors at 9", sections: SECTIONS }) {
  const res = await api(createEmail, { method: "POST", path: "/api/email/one-off", body });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return res.data.email;
}

const at = (email, suffix = "") => ({ path: `/api/email/one-off/${email.id}${suffix}`, params: { id: String(email.id) } });

describe("one-off emails: writing one", () => {
  it("New email saves a draft, and the Write tab lists it", async () => {
    const email = await create();
    assert.equal(email.status, "draft");
    assert.equal(email.createdBy, "someone@example.com");
    assert.deepEqual(email.sections, SECTIONS);
    const { data } = await api(listEmails, { path: "/api/email/one-off" });
    assert.deepEqual(
      data.emails.map((row) => [row.id, row.subject, row.status, row.sectionCount]),
      [[email.id, "NYE at Gwenda", "draft", 3]],
    );
    // The frame the page draws its preview in: this environment's website and Sanity.
    assert.equal(data.frame.site.origin, "https://gwenda-web-dev.pages.dev");
    assert.ok(data.frame.images.projectId);
    assert.equal(typeof data.access.mailchimp, "boolean");
  });

  it("opens one with what the preview needs, and the preview is the email that would go", async () => {
    const email = await create();
    const { status, data } = await api(getEmail, at(email));
    assert.equal(status, 200);
    assert.deepEqual(data.email, email);
    const rendered = renderOneOffEmail(data.email, data.frame);
    assert.match(rendered.html, />New Year's Eve<\/h2>/);
    assert.match(rendered.html, /\*\|UNSUB\|\*/);
  });

  it("Save changes the subject, preview line and sections; anything unsafe is dropped", async () => {
    const email = await create();
    const res = await api(saveEmail, {
      method: "PATCH",
      ...at(email),
      body: {
        subject: "NYE!",
        sections: [{ kind: "copy", text: "Hi" }, { kind: "html", html: "<script>" }],
        status: "sent",
        createdBy: "x@example.com",
      },
      email: "other@example.com",
    });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.email.subject, "NYE!");
    assert.equal(res.data.email.previewText, "Doors at 9");
    assert.deepEqual(res.data.email.sections, [{ kind: "copy", text: "Hi" }]);
    assert.equal(res.data.email.status, "draft");
    assert.equal(res.data.email.createdBy, "someone@example.com");
    assert.equal(res.data.email.updatedBy, "other@example.com");
  });

  it("won't change or delete one that has gone, and says so", async () => {
    const email = await create();
    await oneOffEmailRepository(world.env).move(email.id, ["draft"], "sent", {}, new Date());
    const saved = await api(saveEmail, { method: "PATCH", ...at(email), body: { subject: "x" } });
    assert.equal(saved.status, 409);
    assert.match(saved.data.error, /can't be changed/);
    const deleted = await api(deleteEmail, { method: "DELETE", ...at(email) });
    assert.equal(deleted.status, 409);
    const missing = await api(getEmail, { path: "/api/email/one-off/999", params: { id: "999" } });
    assert.equal(missing.status, 404);
  });

  it("deletes a draft", async () => {
    const email = await create();
    assert.equal((await api(deleteEmail, { method: "DELETE", ...at(email) })).status, 200);
    assert.equal((await api(getEmail, at(email))).status, 404);
  });

  it("uploads a picture for an Image section to Sanity, and gives back its asset", async () => {
    const form = new FormData();
    form.set("file", new File([new Uint8Array(2048).fill(7)], "party-1600x1200.jpg", { type: "image/jpeg" }));
    const res = await api(uploadImage, { method: "POST", path: "/api/email/images", body: form });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.match(res.data.assetId, /^image-[a-f0-9]+-1600x1200-jpg$/);
    assert.match(res.data.url, /^https:\/\/cdn\.sanity\.io\/images\//);

    const bad = new FormData();
    bad.set("file", new File(["x"], "notes.txt", { type: "text/plain" }));
    assert.equal((await api(uploadImage, { method: "POST", path: "/api/email/images", body: bad })).status, 400);
  });
});

describe("one-off emails: send me a test", () => {
  it("sends the saved email to the person signed in, and leaves nothing behind in Mailchimp", async () => {
    world.mailchimp.connect(world.env);
    const email = await create();
    const res = await api(sendTest, { method: "POST", ...at(email, "/test"), body: { email: "stranger@example.com" } });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.sentTo, "someone@example.com");
    assert.equal(res.data.subject, "NYE at Gwenda");
    assert.deepEqual(world.mailchimp.tests.map((test) => test.to), [["someone@example.com"]]);
    assert.match(world.mailchimp.tests[0].html, /Get tickets/);
    assert.match(world.mailchimp.deleted[0].settings.title, /^Test: NYE at Gwenda \(safe to delete\)$/);
    assert.equal(world.mailchimp.campaigns.size, 0);
    assert.deepEqual(world.mailchimp.audienceSends, []);
  });

  it("needs a subject and something in it first, and costs no test when refused", async () => {
    world.mailchimp.connect(world.env);
    const blank = await create({ subject: "", sections: [] });
    const noSubject = await api(sendTest, { method: "POST", ...at(blank, "/test") });
    assert.equal(noSubject.status, 409);
    assert.equal(noSubject.data.error, "Give it a subject first.");
    const empty = await create({ subject: "Hi", sections: [{ kind: "copy", text: "  " }] });
    const nothing = await api(sendTest, { method: "POST", ...at(empty, "/test") });
    assert.equal(nothing.data.error, "Add something to it first.");
    assert.deepEqual(world.mailchimp.log, []);
    // Neither counted: a real test still goes.
    assert.equal((await api(sendTest, { method: "POST", ...at(await create(), "/test") })).status, 200);
  });

  it("is limited together with the weekly email's tests", async () => {
    publishWeek(world);
    world.mailchimp.connect(world.env);
    const weekly = await api(sendWeeklyTest, { method: "POST", path: "/api/email/test" });
    assert.equal(weekly.status, 200, JSON.stringify(weekly.data));
    const res = await api(sendTest, { method: "POST", ...at(await create(), "/test") });
    assert.equal(res.status, 429);
    assert.match(res.data.error, /Give it a minute/);
  });

  it("without Mailchimp it says the page is preview only; without a session, nothing goes", async () => {
    const email = await create();
    const res = await api(sendTest, { method: "POST", ...at(email, "/test") });
    assert.equal(res.status, 409);
    assert.match(res.data.error, /preview only/);
    world.mailchimp.connect(world.env);
    const anon = await api(sendTest, { method: "POST", ...at(email, "/test"), email: "" });
    assert.equal(anon.status, 403);
    assert.deepEqual(world.mailchimp.tests, []);
  });
});
