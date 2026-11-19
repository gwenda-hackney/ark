/**
 * Use cases: the monthly what's on email going to the mailing list, and everything that
 * must stop it. Through the real API handlers and the scheduler's tick, with
 * Sanity, Mailchimp and Gmail faked (testing/fake-world.js): no test here can
 * reach a real inbox. The clock is pinned.
 *
 * The rules these prove:
 *   1. off production nothing can reach the list, whatever is asked
 *   2. on production it's off until an admin switches it on
 *   3. switched on, it sends by itself at its time, or waits for an admin's
 *      Approve and send when they've asked to approve first
 *   4. one send per month, however often it's triggered; "send again" is an
 *      admin's explicit, confirmed choice
 *   5. an empty month, an email that can't be built, a retried request and a
 *      lost answer never cause a wrong or second send
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { resetConfigCacheForTests } from "../../../../shared/config.js";
import { createTestD1 } from "../../../../shared/testing/d1-sqlite.js";
import { onRequestPost as approve } from "../../functions/api/email/approve.js";
import { onRequestGet as getAudienceSize } from "../../functions/api/email/audience.js";
import { onRequestPost as prepare } from "../../functions/api/email/prepare.js";
import { onRequestGet as getReports } from "../../functions/api/email/reports.js";
import { onRequestGet as getPreview } from "../../functions/api/email/preview.js";
import { onRequestPost as sendAgain } from "../../functions/api/email/send-again.js";
import { onRequestPost as saveSettings } from "../../functions/api/email/settings.js";
import { onRequestGet as getStatus } from "../../functions/api/email/status.js";
import { onRequestPost as tick } from "../../functions/api/web/tick.js";
import { callApi, createFakeWorld } from "../testing/fake-world.js";
import { d1WeeklyEmailRepository } from "./server/adapters/d1-weekly-email.js";
import { FIRST_MONDAY_SEND, FIRST_TUESDAY_SEND, MONTH, publishMonth, publishNight, signedIn } from "./testing.js";

const ADMIN = "admin@example.com";
const STAFF = "staff@example.com";

let world;

/** Minutes after Tuesday 11:02, just past the default send time. */
const later = (minutes) => new Date(FIRST_TUESDAY_SEND.getTime() + minutes * 60_000);
/** January's first Tuesday, 11:02: the month after's send. */
const NEXT_MONTH_SEND = new Date("2027-01-05T11:02:00Z");
const NEXT_MONTH = "2027-01-01";

function setting(name, value, envName = world.env.SITE_ENV) {
  world.setConfig(name, value, { env: envName });
}

/** Production ops with Mailchimp connected, one admin, and a month of nights published. */
function production({ nights = true } = {}) {
  world.env.SITE_ENV = "production";
  world.env.GMAIL_SERVICE_ACCOUNT_JSON = world.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON;
  world.mailchimp.connect(world.env);
  setting("ops.admin_emails", ADMIN);
  if (nights) publishMonth(world);
}

const switchOn = () => setting("weekly_email.sending", "on");
const approveFirst = () => setting("weekly_email.mode", "approve");

/** The five-minute scheduler pass, as the deploy webhook's cron calls it. */
async function runTick() {
  const res = await callApi(world, tick, {
    method: "POST",
    path: "/api/web/tick?step=email",
    headers: { Authorization: `Bearer ${world.env.DEPLOY_WEBHOOK_SECRET}` },
  });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return res.data.email;
}

async function as(email, handler, path, body) {
  return callApi(world, handler, {
    method: body === undefined && handler === getStatus ? "GET" : "POST",
    path,
    headers: await signedIn(world, email),
    ...(body === undefined ? {} : { body }),
  });
}

const pressApprove = (email = ADMIN, body = { confirm: "send" }) => as(email, approve, "/api/email/approve", body);
const pressTryAgain = (email = ADMIN) => as(email, prepare, "/api/email/prepare", {});
const pressSendAgain = (after, email = ADMIN, body = { confirm: "send-again", after }) =>
  as(email, sendAgain, "/api/email/send-again", body);

async function status(email = STAFF) {
  const res = await callApi(world, getStatus, { path: "/api/email/status", headers: await signedIn(world, email) });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return res.data;
}

const runs = () => d1WeeklyEmailRepository(world.env.OPS_DB).history(20);
const sends = () => world.mailchimp.audienceSends;
const mailchimpCalls = () => world.mailchimp.log;

beforeEach(async () => {
  vi.useFakeTimers({ now: FIRST_TUESDAY_SEND, toFake: ["Date"] });
  resetConfigCacheForTests();
  world = await createFakeWorld();
  world.env.OPS_DB = createTestD1("ops");
  world.install();
});

afterEach(() => {
  world.restore();
  vi.useRealTimers();
});

describe("monthly email: nothing reaches the list off production", () => {
  for (const [name, env] of [
    ["hosted dev", { SITE_ENV: "dev" }],
    ["a developer's machine", { SITE_ENV: "local" }],
  ]) {
    it(`${name}: with a key, switched on and due, the tick does nothing`, async () => {
      Object.assign(world.env, env);
      world.mailchimp.connect(world.env);
      publishMonth(world);
      setting("weekly_email.sending", "on", "dev");
      // A machine's tick is skipped altogether; hosted dev's email step says why.
      const res = await callApi(world, tick, {
        method: "POST",
        path: "/api/web/tick?step=email",
        headers: { Authorization: `Bearer ${world.env.DEPLOY_WEBHOOK_SECRET}` },
      });
      assert.equal(res.status, 200);
      if (env.SITE_ENV === "dev") assert.deepEqual(res.data.email, { action: "none", why: "not production" });
      assert.deepEqual(mailchimpCalls(), []);
      assert.deepEqual(await runs(), []);
    });

    it(`${name}: Approve and send, Try again and Send again are refused, and touch nothing`, async () => {
      Object.assign(world.env, env);
      world.mailchimp.connect(world.env);
      publishMonth(world);
      setting("weekly_email.sending", "on", "dev");
      // Everyone is an admin on dev, so this is the environment refusing, not the role.
      for (const res of [await pressApprove(), await pressTryAgain(), await pressSendAgain(1)]) {
        assert.equal(res.status, 403, JSON.stringify(res.data));
        assert.equal(res.data.error, "Nothing goes to the mailing list from here: only production ops can send.");
      }
      assert.deepEqual(mailchimpCalls(), []);
      assert.deepEqual(sends(), []);
      assert.deepEqual(await runs(), []);
      const shown = await status();
      assert.deepEqual(shown.access, { mailchimp: true, audience: false });
    });
  }

  it("a local copy on live data (ops:prod) can't send either, even with a draft waiting", async () => {
    production();
    switchOn();
    approveFirst();
    assert.equal((await runTick()).action, "waiting");
    world.env.OPS_LOCAL_LIVE = "1";
    const res = await pressApprove();
    assert.equal(res.status, 403);
    assert.deepEqual(sends(), []);
    assert.equal((await status()).access.audience, false);
  });

  it("dev without a key: preview only", async () => {
    publishMonth(world);
    assert.deepEqual((await status()).access, { mailchimp: false, audience: false });
    assert.equal((await callApi(world, getPreview, { path: "/api/email/preview" })).data.email.nights, 2);
  });
});

describe("monthly email: off until an admin switches it on", () => {
  it("production, with a key, at its time: nothing is sent, prepared or recorded", async () => {
    production();
    assert.deepEqual(await runTick(), { action: "none", why: "switched off" });
    assert.deepEqual(mailchimpCalls(), []);
    assert.deepEqual(await runs(), []);
    const shown = await status();
    assert.deepEqual(shown.settings, { sending: false, mode: "auto", day: "tue", time: "11:00", notify: [] });
    assert.deepEqual(shown.access, { mailchimp: true, audience: true });
  });

  it("only the word on switches it on", async () => {
    production();
    setting("weekly_email.sending", "yes");
    assert.equal((await runTick()).why, "switched off");
    assert.deepEqual(sends(), []);
  });

  it("only an admin can switch it on, or change anything", async () => {
    production();
    const refused = await as(STAFF, saveSettings, "/api/email/settings", { sending: true });
    assert.equal(refused.status, 403);
    assert.equal(refused.data.error, "Only admins can change the schedule or send to the mailing list.");
    resetConfigCacheForTests();
    assert.equal((await status()).settings.sending, false);

    const saved = await as(ADMIN, saveSettings, "/api/email/settings", {
      sending: true,
      mode: "approve",
      day: "wed",
      time: "10:30",
      notify: "someone@example.com",
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    const expected = { sending: true, mode: "approve", day: "wed", time: "10:30", notify: ["someone@example.com"] };
    assert.deepEqual(saved.data.settings, expected);
    resetConfigCacheForTests();
    assert.deepEqual((await status()).settings, expected);

    const bad = await as(ADMIN, saveSettings, "/api/email/settings", { time: "teatime" });
    assert.equal(bad.status, 400);
    assert.match(bad.data.error, /HH:MM/);
  });

  it("with it off, an admin can't send by hand either", async () => {
    production();
    for (const res of [await pressApprove(), await pressTryAgain(), await pressSendAgain(1)]) {
      assert.equal(res.status, 409, JSON.stringify(res.data));
      assert.equal(res.data.error, "The monthly email is switched off. Switch it on first.");
    }
    assert.deepEqual(mailchimpCalls(), []);
  });

  it("without a Mailchimp key on production, the tick does nothing", async () => {
    production();
    delete world.env.MAILCHIMP_API_KEY;
    switchOn();
    assert.deepEqual(await runTick(), { action: "none", why: "no Mailchimp key" });
    assert.deepEqual(await runs(), []);
  });
});

describe("monthly email: switched on, it sends by itself at its time", () => {
  beforeEach(() => {
    production();
    switchOn();
  });

  it("the first Tuesday, 11:00: this month's email goes to the list, once", async () => {
    assert.deepEqual(await runTick(), { action: "sent", month: MONTH });
    assert.equal(sends().length, 1);
    assert.match(sends()[0].subject, /^December at Gwenda: /);
    assert.match(sends()[0].html, /Canalside Jazz/);
    assert.match(sends()[0].html, /https:\/\/gwenda\.co\.uk\/whats-on\/quiz/);
    assert.deepEqual(mailchimpCalls(), [
      "GET /lists/list-test",
      "POST /campaigns",
      "PUT /campaigns/camp1/content",
      "POST /campaigns/camp1/actions/send",
    ]);
    assert.equal(world.mailchimp.campaigns.get("camp1").settings.title, "What's on email, December 2026");

    const shown = await status();
    assert.equal(shown.current.status, "sent");
    assert.equal(shown.current.recipients, 244);
    assert.equal(shown.current.startedBy, "schedule");
    assert.equal(shown.current.sentAt, FIRST_TUESDAY_SEND.toISOString());
    assert.equal(shown.current.campaignUrl, "https://us99.admin.mailchimp.com/campaigns/show/?id=5001");
    assert.deepEqual(shown.schedule.next, { date: "2027-01-05", time: "11:00" });
    // Nobody needs telling when it just worked.
    assert.deepEqual(world.google.mail, []);
  });

  it("every email sent to the list shows with its opens, clicks and unsubscribes", async () => {
    await runTick();
    world.mailchimp.reportStats.set("camp1", { uniqueOpens: 120, uniqueClicks: 31, unsubscribed: 2, bounces: 3 });
    world.mailchimp.otherListReports.push({ id: "other1", subject_line: "Not ours" });

    const res = await callApi(world, getReports, { path: "/api/email/reports", headers: await signedIn(world, STAFF) });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.deepEqual(res.data.reports, [
      {
        id: "camp1",
        subject: sends()[0].subject,
        sentAt: FIRST_TUESDAY_SEND.toISOString(),
        emailsSent: 244,
        opens: 120,
        openRate: 120 / 244,
        clicks: 31,
        clickRate: 31 / 244,
        unsubscribed: 2,
        bounces: 3,
      },
    ]);
  });

  it("without Mailchimp the reports say so, and nothing is asked of it", async () => {
    delete world.env.MAILCHIMP_API_KEY;
    const before = world.mailchimp.log.length;
    const res = await callApi(world, getReports, { path: "/api/email/reports", headers: await signedIn(world, STAFF) });
    assert.equal(res.status, 409);
    assert.equal(world.mailchimp.log.length, before);
  });

  it("the next ticks that month do nothing: one send per month", async () => {
    await runTick();
    // To the month's end; 1 January is a new month, which waits for its own first Tuesday.
    for (const minutes of [5, 10, 60, 24 * 60, 7 * 24 * 60, 29 * 24 * 60]) {
      vi.setSystemTime(later(minutes));
      assert.deepEqual(await runTick(), { action: "none", why: "this month is sent" });
    }
    vi.setSystemTime(new Date("2027-01-01T11:02:00Z"));
    assert.deepEqual(await runTick(), { action: "none", why: "not time yet" });
    assert.equal(sends().length, 1);
    assert.equal((await runs()).length, 1);
  });

  it("the cron firing twice at once sends once", async () => {
    const both = await Promise.all([runTick(), runTick()]);
    assert.deepEqual(both.map((result) => result.action).sort(), ["none", "sent"]);
    assert.equal(sends().length, 1);
    assert.equal(world.mailchimp.campaigns.size, 1);
    assert.equal((await runs()).length, 1);
  });

  it("the month after, it sends that month's", async () => {
    await runTick();
    vi.setSystemTime(NEXT_MONTH_SEND);
    assert.deepEqual(await runTick(), { action: "sent", month: NEXT_MONTH });
    assert.equal(sends().length, 2);
    assert.match(sends()[1].subject, /^January at Gwenda: /);
    assert.deepEqual((await status()).history.map((run) => [run.monthStart, run.status]), [
      [NEXT_MONTH, "sent"],
      [MONTH, "sent"],
    ]);
  });

  it("before its time, nothing", async () => {
    vi.setSystemTime(new Date("2026-12-01T10:58:00Z"));
    assert.deepEqual(await runTick(), { action: "none", why: "not time yet" });
    assert.deepEqual(mailchimpCalls(), []);
    assert.deepEqual((await status()).schedule.next, { date: "2026-12-01", time: "11:00" });
  });

  it("switched on after this month's time has passed: it waits for next month, no surprise send", async () => {
    vi.setSystemTime(new Date("2026-12-03T15:00:00Z"));
    assert.deepEqual(await runTick(), { action: "none", why: "missed this month's time" });
    assert.deepEqual(mailchimpCalls(), []);
    const shown = await status();
    assert.equal(shown.schedule.state, "missed");
    assert.equal(shown.current, null);
    assert.deepEqual(shown.schedule.next, { date: "2027-01-05", time: "11:00" });
  });

  it("goes on the first of the settings' weekday, at their time", async () => {
    setting("weekly_email.day", "thu");
    setting("weekly_email.time", "16:30");
    assert.equal((await runTick()).why, "not time yet");
    // December's first Thursday is the 3rd.
    vi.setSystemTime(new Date("2026-12-03T16:31:00Z"));
    assert.equal((await runTick()).action, "sent");
    // Built for the day it goes: Thursday's night is tonight.
    assert.match(world.mailchimp.campaigns.get("camp1").settings.preview_text, /^Tonight: Quiz Night/);
  });
});

describe("monthly email: the month it covers, and tonight", () => {
  it("the first Tuesday: the rest of the month, a series once with its other dates, tonight's in red", async () => {
    production({ nights: false });
    publishNight(world, "2026-12-01", "chess", "Negroni Society");
    publishNight(world, "2026-12-03", "quiz", "Quiz Night");
    publishNight(world, "2026-12-10", "quiz", "Quiz Night");
    publishNight(world, "2026-12-17", "quiz", "Quiz Night");
    publishNight(world, "2026-12-31", "nye", "New Year's Eve");
    publishNight(world, "2027-01-04", "roast", "Monday Roast");
    switchOn();
    const { email } = (await callApi(world, getPreview, { path: "/api/email/preview" })).data;
    assert.equal(email.today, "2026-12-01");
    assert.deepEqual([email.monthStart, email.month.start, email.month.end, email.month.name], [MONTH, MONTH, "2026-12-31", "December"]);
    assert.equal(email.month.span, "1 to 31 Dec");
    assert.equal(email.nights, 3, "the quiz once, with its other Thursdays");
    assert.equal(email.preheader, "Tonight: Negroni Society · Thu 3: Quiz Night · Thu 31: New Year's Eve");
    assert.match(email.html, /Tonight/);
    assert.match(email.html, /Also 10 and 17 Dec/);
    assert.match(email.html, /What’s on in December/);
    // January's night is in Early January, not this month's.
    assert.match(email.html, /Early January/);
    assert.doesNotMatch(email.preheader, /Monday Roast/);
    assert.deepEqual(await runTick(), { action: "sent", month: MONTH });
    assert.equal(sends()[0].html, email.html);
    assert.equal(world.mailchimp.campaigns.get("camp1").settings.preview_text, email.preheader);
  });

  it("set to Mondays: it goes on the first Monday, from that day on", async () => {
    vi.setSystemTime(FIRST_MONDAY_SEND);
    production({ nights: false });
    setting("weekly_email.day", "mon");
    publishNight(world, "2026-12-03", "chess", "Negroni Society");
    publishNight(world, "2026-12-08", "roast", "Tuesday Roast");
    switchOn();
    const { email } = (await callApi(world, getPreview, { path: "/api/email/preview" })).data;
    assert.equal(email.today, "2026-12-07");
    assert.equal(email.month.span, "7 to 31 Dec");
    assert.equal(email.nights, 1, "the 3rd has been and gone");
    assert.equal(email.preheader, "Tue 8: Tuesday Roast");
    assert.doesNotMatch(email.html, /Tonight/i);
    assert.equal((await runTick()).action, "sent");
    assert.equal(sends()[0].html, email.html);
  });
});

describe("monthly email: approve first", () => {
  beforeEach(() => {
    production();
    switchOn();
    approveFirst();
  });

  it("at its time the draft waits, the admins are told, and nothing is sent", async () => {
    assert.deepEqual(await runTick(), { action: "waiting", month: MONTH });
    assert.deepEqual(sends(), []);
    assert.equal(world.mailchimp.drafts().length, 1);
    const shown = await status();
    assert.equal(shown.current.status, "waiting");
    assert.equal(shown.current.recipients, 244);
    assert.equal(world.google.mail.length, 1);
    assert.equal(world.google.mail[0].to, ADMIN);
    assert.equal(world.google.mail[0].subject, "This month's email is waiting for your OK");
    assert.match(world.google.mail[0].text, /would go to 244 people/);
    assert.match(world.google.mail[0].text, /https:\/\/gwenda-ops-dev\.pages\.dev\/email/);
  });

  it("tells the people in the settings instead, when there are any", async () => {
    setting("weekly_email.notify_emails", "someone@example.com, other@example.com");
    await runTick();
    assert.equal(world.google.mail[0].to, "someone@example.com, other@example.com");
  });

  it("it keeps waiting: later ticks never send it, nor does switching back to automatic", async () => {
    await runTick();
    vi.setSystemTime(later(30));
    assert.deepEqual(await runTick(), { action: "none", why: "this month is waiting" });
    setting("weekly_email.mode", "auto");
    vi.setSystemTime(later(60));
    assert.deepEqual(await runTick(), { action: "none", why: "this month is waiting" });
    assert.deepEqual(sends(), []);
    assert.equal(world.google.mail.length, 1);
  });

  it("only an admin can approve, and only with the confirmation", async () => {
    await runTick();
    const staff = await pressApprove(STAFF);
    assert.equal(staff.status, 403);
    const unconfirmed = await pressApprove(ADMIN, {});
    assert.equal(unconfirmed.status, 400);
    assert.deepEqual(sends(), []);
    assert.equal((await status()).current.status, "waiting");
  });

  it("the confirmation can name how many people it goes to", async () => {
    const res = await callApi(world, getAudienceSize, { path: "/api/email/audience", headers: await signedIn(world, ADMIN) });
    assert.deepEqual(res.data.audience, { name: "Gwenda", memberCount: 244 });
    const staff = await callApi(world, getAudienceSize, { path: "/api/email/audience", headers: await signedIn(world, STAFF) });
    assert.equal(staff.status, 403);
  });

  it("Approve and send sends it, as the website is at that moment", async () => {
    await runTick();
    // A night announced after the draft was made is in what goes out.
    publishNight(world, "2026-12-04", "disco", "Late Disco");
    vi.setSystemTime(later(45));
    const res = await pressApprove();
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.current.status, "sent");
    assert.equal(res.data.current.approvedBy, ADMIN);
    assert.equal(res.data.current.sentAt, later(45).toISOString());
    assert.equal(sends().length, 1);
    assert.match(sends()[0].html, /Late Disco/);
    assert.match(sends()[0].subject, /Late Disco|Quiz Night/);
    // The one campaign made for the month is the one that went.
    assert.equal(world.mailchimp.campaigns.size, 1);
  });

  it("pressing it twice, or a retried request, sends once", async () => {
    await runTick();
    const both = await Promise.all([pressApprove(), pressApprove()]);
    assert.deepEqual(both.map((res) => res.status), [200, 200]);
    const again = await pressApprove();
    assert.equal(again.status, 200);
    assert.equal(again.data.current.status, "sent");
    assert.equal(sends().length, 1);
  });

  it("nothing waiting: nothing to approve", async () => {
    const res = await pressApprove();
    assert.equal(res.status, 409);
    assert.equal(res.data.error, "Nothing is waiting for approval this month.");
    assert.deepEqual(mailchimpCalls(), []);
  });

  it("switched off while a draft waits: it can't be approved until it's on again", async () => {
    await runTick();
    setting("weekly_email.sending", "off");
    const res = await pressApprove();
    assert.equal(res.status, 409);
    assert.equal(res.data.error, "The monthly email is switched off. Switch it on first.");
    assert.deepEqual(sends(), []);
  });

  it("a draft nobody approved isn't sent the month after; the new month gets its own", async () => {
    await runTick();
    vi.setSystemTime(NEXT_MONTH_SEND);
    assert.deepEqual(await runTick(), { action: "waiting", month: NEXT_MONTH });
    await pressApprove();
    assert.equal(sends().length, 1);
    assert.deepEqual((await status()).history.map((run) => [run.monthStart, run.status]), [
      [NEXT_MONTH, "sent"],
      [MONTH, "waiting"],
    ]);
  });
});

describe("monthly email: turning approval on or off mid-month", () => {
  beforeEach(() => {
    production();
    switchOn();
  });

  it("turned on before its time: the draft waits for approval", async () => {
    vi.setSystemTime(new Date("2026-12-01T09:00:00Z"));
    await runTick();
    approveFirst();
    vi.setSystemTime(FIRST_TUESDAY_SEND);
    assert.equal((await runTick()).action, "waiting");
    assert.deepEqual(sends(), []);
  });

  it("turned on after this month's went: nothing is resent, and next month's waits", async () => {
    assert.equal((await runTick()).action, "sent");
    approveFirst();
    vi.setSystemTime(later(60));
    assert.deepEqual(await runTick(), { action: "none", why: "this month is sent" });
    assert.equal((await pressApprove()).data.current.status, "sent");
    assert.equal(sends().length, 1);
    vi.setSystemTime(NEXT_MONTH_SEND);
    assert.equal((await runTick()).action, "waiting");
    assert.equal(sends().length, 1);
  });
});

describe("monthly email: a month with nothing left on", () => {
  beforeEach(() => {
    production({ nights: false });
    // Only next month's.
    publishNight(world, "2027-01-07");
    switchOn();
  });

  it("isn't sent, and says why; Mailchimp is never touched", async () => {
    assert.deepEqual(await runTick(), { action: "skipped", month: MONTH });
    assert.deepEqual(mailchimpCalls(), []);
    const shown = await status();
    assert.equal(shown.current.status, "skipped");
    assert.equal(shown.current.reason, "No nights on the website for the rest of the month, so there's nothing to send.");
    vi.setSystemTime(later(10));
    assert.deepEqual(await runTick(), { action: "none", why: "this month is skipped" });
  });

  it("once a night is published, an admin can try again: it waits for their approval", async () => {
    await runTick();
    publishNight(world, "2026-12-04", "disco", "Late Disco");
    const res = await pressTryAgain();
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.current.status, "waiting");
    assert.deepEqual(sends(), []);
    assert.equal((await pressApprove()).data.current.status, "sent");
    assert.equal(sends().length, 1);
  });

  it("an approval that finds the month has emptied sends nothing", async () => {
    publishNight(world, "2026-12-04", "disco", "Late Disco");
    approveFirst();
    assert.equal((await runTick()).action, "waiting");
    // The night is cancelled before anyone approves.
    world.sanity.docs.delete("event-disco-2026-12-04");
    const res = await pressApprove();
    assert.equal(res.status, 200);
    assert.equal(res.data.current.status, "skipped");
    assert.deepEqual(sends(), []);
  });
});

describe("monthly email: failures", () => {
  beforeEach(() => {
    production();
    switchOn();
  });

  it("an email that can't be built isn't sent: it fails, says why, and tells the admins", async () => {
    const realHandle = world.sanity.handle.bind(world.sanity);
    world.sanity.handle = async () => new Response("nope", { status: 500 });
    assert.deepEqual(await runTick(), { action: "failed", month: MONTH });
    assert.deepEqual(mailchimpCalls(), []);
    const shown = await status();
    assert.equal(shown.current.status, "failed");
    assert.match(shown.current.reason, /Couldn't build the email: Sanity .* answered 500/);
    assert.equal(world.google.mail[0].subject, "This month's email didn't go out");

    // It isn't retried by itself, even once the website is back.
    world.sanity.handle = realHandle;
    vi.setSystemTime(later(5));
    assert.deepEqual(await runTick(), { action: "none", why: "this month is failed" });
    assert.deepEqual(sends(), []);

    // Try again prepares it and waits for the admin, though the mode is automatic.
    const staff = await pressTryAgain(STAFF);
    assert.equal(staff.status, 403);
    const retried = await pressTryAgain();
    assert.equal(retried.data.current.status, "waiting");
    assert.deepEqual(sends(), []);
    assert.equal((await pressApprove()).data.current.status, "sent");
    assert.equal(sends().length, 1);
  });

  it("Mailchimp refusing the draft: failed, with what it said", async () => {
    world.mailchimp.fail.create = { status: 400, detail: "Your account is under review.", once: true };
    assert.equal((await runTick()).action, "failed");
    assert.equal((await status()).current.reason, "Mailchimp said no (400): Your account is under review.");
    assert.deepEqual(sends(), []);
    assert.equal((await pressTryAgain()).data.current.status, "waiting");
  });

  it("Mailchimp refusing the send: failed, nothing went, and trying again uses the same campaign", async () => {
    world.mailchimp.fail.send = { status: 500, detail: "Try later.", once: true };
    assert.equal((await runTick()).action, "failed");
    assert.deepEqual(sends(), []);
    assert.equal((await status()).current.reason, "Mailchimp said no (500): Try later.");
    assert.equal((await pressTryAgain()).data.current.status, "waiting");
    assert.equal((await pressApprove()).data.current.status, "sent");
    assert.equal(sends().length, 1);
    assert.equal(world.mailchimp.nextCampaign, 2);
  });

  it("the send went but its answer was lost: it's marked sent, never sent again", async () => {
    world.mailchimp.fail.send = { status: 504, detail: "Gateway timeout.", landed: true, once: true };
    assert.deepEqual(await runTick(), { action: "sent", month: MONTH });
    assert.equal(sends().length, 1);
    assert.equal((await status()).current.status, "sent");
    vi.setSystemTime(later(5));
    await runTick();
    assert.equal((await pressTryAgain()).status, 409);
    assert.equal(sends().length, 1);
  });

  it("the answer was lost and Mailchimp can't say what happened: failed, and a retry checks before it does anything", async () => {
    world.mailchimp.fail.send = { status: 504, landed: true, once: true };
    world.mailchimp.fail.campaign = { status: 500 };
    assert.equal((await runTick()).action, "failed");
    assert.match((await status()).current.reason, /Check the campaign in Mailchimp before trying again/);
    // Still can't check: the retry stops rather than make a second campaign.
    const blind = await pressTryAgain();
    assert.equal(blind.data.current.status, "failed");
    assert.equal(world.mailchimp.nextCampaign, 2);
    // Once Mailchimp answers, the retry finds it went and marks it sent.
    delete world.mailchimp.fail.campaign;
    assert.equal((await pressTryAgain()).data.current.status, "sent");
    assert.equal(sends().length, 1);
    assert.equal(world.mailchimp.nextCampaign, 2);
  });

  it("a send cut off mid-way is settled by asking Mailchimp, not by sending again", async () => {
    approveFirst();
    await runTick();
    const repo = d1WeeklyEmailRepository(world.env.OPS_DB);
    const [run] = await runs();
    // The Worker died after the send went out, before it was recorded.
    await repo.move(run.id, ["waiting"], "sending", {}, FIRST_TUESDAY_SEND);
    const campaign = world.mailchimp.campaigns.get("camp1");
    campaign.status = "sent";
    assert.equal((await status()).stuck, false);
    vi.setSystemTime(later(1));
    assert.deepEqual(await runTick(), { action: "none", why: "this month is sending" });
    vi.setSystemTime(later(5));
    assert.equal((await status()).stuck, true);
    assert.deepEqual(await runTick(), { action: "settled", status: "sent" });
    assert.deepEqual(sends(), []); // nothing sent by settling
    assert.equal((await status()).current.status, "sent");
  });

  it("a send cut off before it went: failed, to be tried again by an admin", async () => {
    approveFirst();
    await runTick();
    const repo = d1WeeklyEmailRepository(world.env.OPS_DB);
    const [run] = await runs();
    await repo.move(run.id, ["waiting"], "sending", {}, FIRST_TUESDAY_SEND);
    vi.setSystemTime(later(5));
    assert.deepEqual(await runTick(), { action: "settled", status: "failed" });
    assert.equal((await status()).current.reason, "The send was started but didn't go through. Nothing was sent.");
    assert.deepEqual(sends(), []);
    assert.equal((await pressTryAgain()).data.current.status, "waiting");
    assert.equal((await pressApprove()).data.current.status, "sent");
    assert.equal(sends().length, 1);
  });
});

describe("monthly email: send again", () => {
  beforeEach(() => {
    production();
    switchOn();
  });

  it("an admin can send this month's a second time, with the confirmation", async () => {
    await runTick();
    const [first] = await runs();
    assert.equal((await pressSendAgain(first.id, STAFF)).status, 403);
    assert.equal((await pressSendAgain(first.id, ADMIN, { after: first.id })).status, 400);
    assert.equal(sends().length, 1);

    vi.setSystemTime(later(120));
    const res = await pressSendAgain(first.id);
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(sends().length, 2);
    assert.deepEqual(
      res.data.history.map((run) => [run.monthStart, run.attempt, run.status, run.startedBy, run.approvedBy]),
      [
        [MONTH, 2, "sent", "manual", ADMIN],
        [MONTH, 1, "sent", "schedule", ""],
      ],
    );
    assert.match(world.mailchimp.campaigns.get("camp2").settings.title, /\(sent again, 2\)$/);
  });

  it("the same request retried doesn't send a third", async () => {
    await runTick();
    const [first] = await runs();
    await pressSendAgain(first.id);
    const retried = await pressSendAgain(first.id);
    assert.equal(retried.status, 409);
    assert.match(retried.data.error, /already asked for/);
    assert.equal(sends().length, 2);
  });

  it("pressed twice at once sends one more, not two", async () => {
    await runTick();
    const [first] = await runs();
    const both = await Promise.all([pressSendAgain(first.id), pressSendAgain(first.id)]);
    assert.deepEqual(both.map((res) => res.status).sort(), [200, 409]);
    assert.equal(sends().length, 2);
  });

  it("there's nothing to send again until this month's has gone", async () => {
    const res = await pressSendAgain(1);
    assert.equal(res.status, 409);
    assert.match(res.data.error, /hasn't been sent/);
    assert.deepEqual(mailchimpCalls(), []);
  });
});
