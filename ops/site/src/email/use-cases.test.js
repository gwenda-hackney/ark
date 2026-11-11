/**
 * Use cases: what staff do with the weekly "what's on" email in ops, end to
 * end through the real API handlers, with Sanity (and later Mailchimp) faked
 * (testing/fake-world.js). The clock is pinned: nothing here depends on the
 * day the tests run.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { resetConfigCacheForTests } from "../../../../shared/config.js";
import { onRequestGet as getPreview } from "../../functions/api/email/preview.js";
import { callApi, createFakeWorld } from "../testing/fake-world.js";
import { TUESDAY_MORNING, WEEK, publishNight, publishWeek } from "./testing.js";

let world;

beforeEach(async () => {
  vi.useFakeTimers({ now: TUESDAY_MORNING, toFake: ["Date"] });
  resetConfigCacheForTests();
  world = await createFakeWorld();
  world.install();
});

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
