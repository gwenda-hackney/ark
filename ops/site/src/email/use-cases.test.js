/**
 * Use cases: what staff do with the monthly "what's on" email in ops, end to
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
import { FIRST_TUESDAY_MORNING, MONTH, publishMonth, publishNight, signedIn } from "./testing.js";

let world;

beforeEach(async () => {
  vi.useFakeTimers({ now: FIRST_TUESDAY_MORNING, toFake: ["Date"] });
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

describe("monthly email: this month's email, as it would go out", () => {
  it("shows the subject, the preview line and the email, built from the published website", async () => {
    publishMonth(world);
    const res = await callApi(world, getPreview, { path: "/api/email/preview" });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    const { email } = res.data;
    assert.equal(email.today, "2026-12-01");
    assert.equal(email.monthStart, MONTH);
    assert.equal(email.month.span, "1 to 31 Dec");
    assert.equal(email.empty, false);
    assert.equal(email.nights, 2);
    assert.match(email.subject, /^December at Gwenda: /);
    assert.match(email.subject, /Quiz Night/);
    assert.match(email.preheader, /Thu 3: Quiz Night/);
    assert.match(email.html, /Canalside Jazz/);
    // Links and the logo go to this environment's website: dev's here.
    assert.match(email.html, /https:\/\/gwenda-web-dev\.pages\.dev\/brand\/logo-email-social\.png/);
    assert.match(email.html, /https:\/\/gwenda-web-dev\.pages\.dev\/whats-on\/quiz/);
    assert.doesNotMatch(email.html, /localhost/);
    // The foot a campaign needs to be sent at all.
    assert.match(email.html, /\*\|UNSUB\|\*/);
  });

  it("ends with Bookings, as the website has it: a party and playing here, each to its half of /bookings", async () => {
    publishMonth(world);
    const { data } = await callApi(world, getPreview, { path: "/api/email/preview" });
    const { html } = data.email;
    for (const words of ["Have a party", "Play at Gwenda", "Book your party", "Apply to play"]) {
      assert.ok(html.includes(words), words);
    }
    assert.match(html, /href="https:\/\/gwenda-web-dev\.pages\.dev\/bookings#party"/);
    assert.match(html, /href="https:\/\/gwenda-web-dev\.pages\.dev\/bookings#play"/);
    // Near the end: after the month's nights, before the table and the foot.
    assert.ok(html.indexOf("Play at Gwenda") > html.indexOf("Canalside Jazz"));
    assert.ok(html.indexOf("Play at Gwenda") < html.indexOf(">Book a table</a>"));
  });

  it("is built from published nights only: a draft isn't in it", async () => {
    publishMonth(world);
    world.sanity.docs.set("drafts.event-secret-2026-12-04", {
      _id: "drafts.event-secret-2026-12-04",
      _type: "event",
      slug: { current: "secret-2026-12-04" },
      title: "Not Announced Yet",
      seriesId: "secret",
      date: "2026-12-04",
      description: [{ _type: "block", children: [{ _type: "span", text: "Soon." }] }],
    });
    const { data } = await callApi(world, getPreview, { path: "/api/email/preview" });
    assert.doesNotMatch(data.email.html, /Not Announced Yet/);
  });

  it("says when the month is empty, and why it wouldn't be sent", async () => {
    // Nothing left this month; one night the month after.
    publishNight(world, "2027-01-07");
    const res = await callApi(world, getPreview, { path: "/api/email/preview" });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.email.empty, true);
    assert.equal(res.data.email.nights, 0);
    assert.match(res.data.email.emptyReason, /No nights on the website for the rest of the month/);
    // It still shows what the email would look like.
    assert.match(res.data.email.html, /Quiz Night/);
  });

  it("only reads: two Sanity queries, nothing else", async () => {
    publishMonth(world);
    await callApi(world, getPreview, { path: "/api/email/preview" });
    const outside = world.calls;
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

describe("monthly email: send me a test", () => {
  async function pressSendTest({ email = "someone@example.com", body } = {}) {
    return callApi(world, sendTest, {
      method: "POST",
      path: "/api/email/test",
      headers: email ? await signedIn(world, email) : {},
      ...(body ? { body } : {}),
    });
  }

  it("sends this month's email to the person signed in, and leaves nothing behind in Mailchimp", async () => {
    publishMonth(world);
    world.mailchimp.connect(world.env);
    const res = await pressSendTest();
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.sentTo, "someone@example.com");
    assert.match(res.data.subject, /^December at Gwenda: /);
    assert.equal(res.data.warning, "");
    assert.equal(world.mailchimp.tests.length, 1);
    assert.deepEqual(world.mailchimp.tests[0].to, ["someone@example.com"]);
    assert.match(world.mailchimp.tests[0].html, /Canalside Jazz/);
    // The draft it rode on is gone, and the list got nothing.
    assert.equal(world.mailchimp.campaigns.size, 0);
    assert.match(world.mailchimp.deleted[0].settings.title, /^Test of the monthly email, 1 Dec \(safe to delete\)$/);
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
    publishMonth(world);
    world.mailchimp.connect(world.env);
    const res = await pressSendTest({
      body: { email: "stranger@example.com", to: "stranger@example.com", test_emails: ["stranger@example.com"] },
    });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.deepEqual(world.mailchimp.tests.map((test) => test.to), [["someone@example.com"]]);
  });

  it("needs a signed-in address: without one nothing is sent", async () => {
    publishMonth(world);
    world.mailchimp.connect(world.env);
    const res = await pressSendTest({ email: "" });
    assert.equal(res.status, 403);
    assert.match(res.data.error, /Sign in with Google/);
    assert.deepEqual(mailchimpCalls(), []);
  });

  it("without a Mailchimp key the page is preview only, and says so", async () => {
    publishMonth(world);
    const res = await pressSendTest();
    assert.equal(res.status, 409);
    assert.equal(res.data.error, "Mailchimp isn't connected here, so this page is preview only.");
    assert.deepEqual(mailchimpCalls(), []);
    // The preview still works.
    assert.equal((await callApi(world, getPreview, { path: "/api/email/preview" })).data.email.nights, 2);
  });

  it("is limited: one a minute and five an hour each", async () => {
    publishMonth(world);
    world.mailchimp.connect(world.env);
    assert.equal((await pressSendTest()).status, 200);
    const again = await pressSendTest();
    assert.equal(again.status, 429);
    assert.match(again.data.error, /Give it a minute/);
    // Someone else isn't held back by that.
    assert.equal((await pressSendTest({ email: "other@example.com" })).status, 200);
    for (let sent = 1; sent < 5; sent += 1) {
      vi.setSystemTime(new Date(FIRST_TUESDAY_MORNING.getTime() + sent * 2 * 60_000));
      assert.equal((await pressSendTest()).status, 200);
    }
    vi.setSystemTime(new Date(FIRST_TUESDAY_MORNING.getTime() + 12 * 60_000));
    const sixth = await pressSendTest();
    assert.equal(sixth.status, 429);
    assert.match(sixth.data.error, /five tests in an hour/);
    assert.equal(world.mailchimp.tests.length, 6);
  });

  it("says why when Mailchimp refuses, and still deletes the draft", async () => {
    publishMonth(world);
    world.mailchimp.connect(world.env);
    world.mailchimp.fail.test = { status: 400, detail: "You have hit the test email limit." };
    const res = await pressSendTest();
    assert.equal(res.status, 424);
    assert.equal(res.data.error, "The test didn't send. Mailchimp said no (400): You have hit the test email limit.");
    assert.deepEqual(world.mailchimp.tests, []);
    assert.equal(world.mailchimp.campaigns.size, 0);
  });

  it("says which draft to delete by hand when Mailchimp won't delete it", async () => {
    publishMonth(world);
    world.mailchimp.connect(world.env);
    world.mailchimp.fail.delete = { status: 500 };
    const res = await pressSendTest();
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.match(res.data.warning, /^The test went\. Its draft is still in Mailchimp: delete "Test of the monthly email, 1 Dec \(safe to delete\)" there\.$/);
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
    publishMonth(world);
    world.mailchimp.connect(world.env);
    world.env.SITE_ENV = "production";
    world.setConfig("sanity.project_id", "gwscpagy", { env: "production", service: "all" });
    const res = await pressSendTest();
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.deepEqual(world.mailchimp.audienceSends, []);
    assert.equal(mailchimpCalls().some((call) => call.endsWith("/actions/send")), false);
  });
});
