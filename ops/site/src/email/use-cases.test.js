/**
 * Use cases: what staff do with the weekly "what's on" email in ops, end to
 * end through the real API handlers, with Sanity (and later Mailchimp) faked
 * (testing/fake-world.js). The clock is pinned: nothing here depends on the
 * day the tests run.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { resetConfigCacheForTests } from "../../../../shared/config.js";
import { createTestD1 } from "../../../../shared/testing/d1-sqlite.js";
import { onRequestGet as getPreview } from "../../functions/api/email/preview.js";
import { onRequestPost as sendTest } from "../../functions/api/email/test.js";
import { callApi, createFakeWorld } from "../testing/fake-world.js";
import { TUESDAY_MORNING, WEEK, publishNight, publishWeek, signedIn } from "./testing.js";

let world;

beforeEach(async () => {
  vi.useFakeTimers({ now: TUESDAY_MORNING, toFake: ["Date"] });
  resetConfigCacheForTests();
  world = await createFakeWorld();
  world.env.OPS_DB = createTestD1("ops");
  world.install();
});

/** Calls to Mailchimp so far, in order. */
const mailchimpCalls = () => world.mailchimp.log;

afterEach(() => {
  world.restore();
  vi.useRealTimers();
});

describe("weekly email: this week's email, as it would go out", () => {
  it("shows the subject, the preview line and the email, built from the published website", async () => {
    publishWeek(world);
    const res = await callApi(world, getPreview, { path: "/api/email/preview" });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    const { email } = res.data;
    assert.equal(email.today, "2026-11-10");
    assert.equal(email.weekStart, WEEK);
    assert.equal(email.week.span, "10 to 15 Nov");
    assert.equal(email.empty, false);
    assert.equal(email.nights, 2);
    assert.match(email.subject, /^This week at Gwenda: /);
    assert.match(email.subject, /Quiz Night/);
    assert.match(email.preheader, /Thu: Quiz Night/);
    assert.match(email.html, /Canalside Jazz/);
    // Links and the logo go to this environment's website: dev's here.
    assert.match(email.html, /https:\/\/gwenda-web-dev\.pages\.dev\/brand\/logo-email-social\.png/);
    assert.match(email.html, /https:\/\/gwenda-web-dev\.pages\.dev\/whats-on\/quiz/);
    assert.doesNotMatch(email.html, /localhost/);
    // The foot a campaign needs to be sent at all.
    assert.match(email.html, /\*\|UNSUB\|\*/);
  });

  it("is built from published nights only: a draft isn't in it", async () => {
    publishWeek(world);
    world.sanity.docs.set("drafts.event-secret-2026-11-13", {
      _id: "drafts.event-secret-2026-11-13",
      _type: "event",
      slug: { current: "secret-2026-11-13" },
      title: "Not Announced Yet",
      seriesId: "secret",
      date: "2026-11-13",
      description: [{ _type: "block", children: [{ _type: "span", text: "Soon." }] }],
    });
    const { data } = await callApi(world, getPreview, { path: "/api/email/preview" });
    assert.doesNotMatch(data.email.html, /Not Announced Yet/);
  });

  it("says when the week is empty, and why it wouldn't be sent", async () => {
    // Nothing this week; one night the week after.
    publishNight(world, "2026-11-19");
    const res = await callApi(world, getPreview, { path: "/api/email/preview" });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.email.empty, true);
    assert.equal(res.data.email.nights, 0);
    assert.match(res.data.email.emptyReason, /No nights on the website this week/);
    // It still shows what the email would look like.
    assert.match(res.data.email.html, /Quiz Night/);
  });

  it("only reads: two Sanity queries, nothing else", async () => {
    publishWeek(world);
    await callApi(world, getPreview, { path: "/api/email/preview" });
    const outside = world.calls.filter((call) => !call.includes("api.baserow.io"));
    assert.deepEqual(outside, [
      "GET gwscpagy.api.sanity.io/v2025-01-01/data/query/production",
      "GET gwscpagy.api.sanity.io/v2025-01-01/data/query/production",
    ]);
  });

  it("says so when the website's data can't be read", async () => {
    world.sanity.handle = async () => new Response("nope", { status: 500 });
    const res = await callApi(world, getPreview, { path: "/api/email/preview" });
    assert.equal(res.status, 200);
    assert.equal(res.data.email, null);
    assert.match(res.data.problem, /Couldn't build the email: Sanity .* answered 500/);
  });
});

describe("weekly email: send me a test", () => {
  async function pressSendTest({ email = "someone@example.com", body } = {}) {
    return callApi(world, sendTest, {
      method: "POST",
      path: "/api/email/test",
      headers: email ? await signedIn(world, email) : {},
      ...(body ? { body } : {}),
    });
  }

  it("sends this week's email to the person signed in, and leaves nothing behind in Mailchimp", async () => {
    publishWeek(world);
    world.mailchimp.connect(world.env);
    const res = await pressSendTest();
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.sentTo, "someone@example.com");
    assert.match(res.data.subject, /^This week at Gwenda: /);
    assert.equal(res.data.warning, "");
    assert.equal(world.mailchimp.tests.length, 1);
    assert.deepEqual(world.mailchimp.tests[0].to, ["someone@example.com"]);
    assert.match(world.mailchimp.tests[0].html, /Canalside Jazz/);
    // The draft it rode on is gone, and the list got nothing.
    assert.equal(world.mailchimp.campaigns.size, 0);
    assert.match(world.mailchimp.deleted[0].settings.title, /^Test of the weekly email, 10 Nov \(safe to delete\)$/);
    assert.deepEqual(world.mailchimp.audienceSends, []);
    assert.deepEqual(mailchimpCalls(), [
      "GET /lists/list-test",
      "POST /campaigns",
      "PUT /campaigns/camp1/content",
      "POST /campaigns/camp1/actions/test",
      "DELETE /campaigns/camp1",
    ]);
  });

  it("goes to their own address only: an address in the request is ignored", async () => {
    publishWeek(world);
    world.mailchimp.connect(world.env);
    const res = await pressSendTest({
      body: { email: "stranger@example.com", to: "stranger@example.com", test_emails: ["stranger@example.com"] },
    });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.deepEqual(world.mailchimp.tests.map((test) => test.to), [["someone@example.com"]]);
  });

  it("needs a signed-in address: without one nothing is sent", async () => {
    publishWeek(world);
    world.mailchimp.connect(world.env);
    const res = await pressSendTest({ email: "" });
    assert.equal(res.status, 403);
    assert.match(res.data.error, /Sign in with Google/);
    assert.deepEqual(mailchimpCalls(), []);
  });

  it("without a Mailchimp key the page is preview only, and says so", async () => {
    publishWeek(world);
    const res = await pressSendTest();
    assert.equal(res.status, 409);
    assert.equal(res.data.error, "Mailchimp isn't connected here, so this page is preview only.");
    assert.deepEqual(mailchimpCalls(), []);
    // The preview still works.
    assert.equal((await callApi(world, getPreview, { path: "/api/email/preview" })).data.email.nights, 2);
  });

  it("is limited: one a minute and five an hour each", async () => {
    publishWeek(world);
    world.mailchimp.connect(world.env);
    assert.equal((await pressSendTest()).status, 200);
    const again = await pressSendTest();
    assert.equal(again.status, 429);
    assert.match(again.data.error, /Give it a minute/);
    // Someone else isn't held back by that.
    assert.equal((await pressSendTest({ email: "other@example.com" })).status, 200);
    for (let sent = 1; sent < 5; sent += 1) {
      vi.setSystemTime(new Date(TUESDAY_MORNING.getTime() + sent * 2 * 60_000));
      assert.equal((await pressSendTest()).status, 200);
    }
    vi.setSystemTime(new Date(TUESDAY_MORNING.getTime() + 12 * 60_000));
    const sixth = await pressSendTest();
    assert.equal(sixth.status, 429);
    assert.match(sixth.data.error, /five tests in an hour/);
    assert.equal(world.mailchimp.tests.length, 6);
  });

  it("says why when Mailchimp refuses, and still deletes the draft", async () => {
    publishWeek(world);
    world.mailchimp.connect(world.env);
    world.mailchimp.fail.test = { status: 400, detail: "You have hit the test email limit." };
    const res = await pressSendTest();
    assert.equal(res.status, 424);
    assert.equal(res.data.error, "The test didn't send. Mailchimp said no (400): You have hit the test email limit.");
    assert.deepEqual(world.mailchimp.tests, []);
    assert.equal(world.mailchimp.campaigns.size, 0);
  });

  it("says which draft to delete by hand when Mailchimp won't delete it", async () => {
    publishWeek(world);
    world.mailchimp.connect(world.env);
    world.mailchimp.fail.delete = { status: 500 };
    const res = await pressSendTest();
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.match(res.data.warning, /^The test went\. Its draft is still in Mailchimp: delete "Test of the weekly email, 10 Nov \(safe to delete\)" there\.$/);
  });

  it("doesn't touch Mailchimp when the email can't be built", async () => {
    world.mailchimp.connect(world.env);
    world.sanity.handle = async () => new Response("nope", { status: 500 });
    const res = await pressSendTest();
    assert.equal(res.status, 424);
    assert.match(res.data.error, /^The test didn't send\. Couldn't build the email/);
    assert.deepEqual(mailchimpCalls(), []);
  });

  it("never sends to the audience, on production either", async () => {
    publishWeek(world);
    world.mailchimp.connect(world.env);
    world.env.SITE_ENV = "production";
    world.baserow.insert("Config", { Name: "sanity.project_id", Value: "gwscpagy", Env: "production", Service: "all" });
    const res = await pressSendTest();
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.deepEqual(world.mailchimp.audienceSends, []);
    assert.equal(mailchimpCalls().some((call) => call.endsWith("/actions/send")), false);
  });
});
