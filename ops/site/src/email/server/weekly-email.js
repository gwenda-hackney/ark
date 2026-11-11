/**
 * Use cases of the weekly "what's on" email (#240): what the page and the
 * scheduler can do. Rules live in weekly-email-model.js, storage behind
 * weekly-email-repository.js, Mailchimp behind platform/mailchimp.js.
 *
 * Who can reach what:
 *   anyone signed in   see the email; send a test to their own address
 *   hosted production  the only place anything goes to the mailing list
 */
import { nowIso } from "../../../../../shared/d1.js";
import { isGmailConfigured, sendGmail } from "../../../../../shared/gmail-send.js";
import { NOTIFICATIONS_FROM } from "../../../../../shared/mail-from.js";
import { ADMIN_EMAILS_KEY, parseAdminEmails } from "../../access/server/admin.js";
import { getConfigValues, setConfigString } from "../../platform/config-store.js";
import {
  MailchimpError,
  campaignUrl,
  canReachAudience,
  createCampaign,
  deleteCampaign,
  getAudience,
  getCampaign,
  mailchimpConfigured,
  sendCampaignTest,
  sendCampaignToAudience,
  setCampaignContent,
  updateCampaign,
} from "../../platform/mailchimp.js";
import { EMPTY_WEEK, buildWeeklyEmail } from "./weekly-email-build.js";
import {
  isStuck,
  scheduleAt,
  settingsChange,
  settingsFromValues,
  testLimitReason,
} from "./weekly-email-model.js";
import { weeklyEmailRepository } from "./weekly-email-repository.js";

/** An error whose message is for the person on the page (a 4xx, so it's shown as it is). */
export function refusal(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/** A step outside ops that failed: Mailchimp, or building the email. 424, so the page shows why. */
function upstream(what, error) {
  const known = error instanceof MailchimpError || error?.status === 502;
  if (!known) return error;
  return refusal(424, `${what} ${error.message}`);
}

export const NO_MAILCHIMP = "Mailchimp isn't connected here, so this page is preview only.";

/** What this runtime can do, for the page. */
export function emailAccess(env) {
  return {
    /** Whether Mailchimp can be reached at all (tests to yourself). */
    mailchimp: mailchimpConfigured(env),
    /** Whether anything can go to the mailing list from here: hosted production only. */
    audience: canReachAudience(env) && mailchimpConfigured(env),
  };
}

function shortDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

/**
 * Send this week's email, as it would go out now, to one person: the staff
 * member signed in (`email` comes from their session, never from the page).
 * A draft campaign is made for it and deleted again; the list gets nothing.
 */
export async function sendTestToSelf(env, { email, now = new Date() }) {
  if (!mailchimpConfigured(env)) throw refusal(409, NO_MAILCHIMP);
  const to = String(email || "").trim().toLowerCase();
  if (!to) throw refusal(403, "Sign in with Google to send yourself a test: it goes to your own address.");
  const repo = weeklyEmailRepository(env);
  const limited = testLimitReason(await repo.testsSince(nowIso(new Date(now.getTime() - 86_400_000))), to, now);
  if (limited) throw refusal(429, limited);
  // Counted before it's tried, so hammering the button can't hammer Mailchimp.
  await repo.logTest({ email: to, sentAt: nowIso(now) });

  let built;
  try {
    built = await buildWeeklyEmail(env, { now });
  } catch (error) {
    throw upstream("The test didn't send.", error);
  }
  const title = `Test of the weekly email, ${shortDate(built.today)} (safe to delete)`;
  let campaign = null;
  let failure = null;
  try {
    const audience = await getAudience(env);
    campaign = await createCampaign(env, {
      title,
      subject: built.subject,
      preheader: built.preheader,
      fromName: audience.fromName,
      replyTo: audience.replyTo,
    });
    await setCampaignContent(env, campaign.id, { html: built.html, text: built.text });
    await sendCampaignTest(env, campaign.id, to);
  } catch (error) {
    failure = error;
  }
  // The draft was only a vehicle for the test: take it away again, sent or not.
  let leftover = "";
  if (campaign) {
    await deleteCampaign(env, campaign.id).catch(() => {
      leftover = ` Its draft is still in Mailchimp: delete "${title}" there.`;
    });
  }
  if (failure) {
    const shown = upstream("The test didn't send.", failure);
    if (shown !== failure) shown.message += leftover;
    throw shown;
  }
  return {
    sentTo: to,
    subject: built.subject,
    warning: leftover ? `The test went.${leftover}` : "",
  };
}

// ---------------------------------------------------------------- settings

/** The settings as stored for this environment; the defaults (off) for anything unset. */
export async function readSettings(env) {
  return settingsFromValues(await getConfigValues(env));
}

/**
 * Change settings (an admin, checked by the caller): on/off, the mode, the
 * day and time, who's told. Stored as this environment's own config rows.
 * Other runtimes read a change within a minute (the config cache).
 */
export async function saveSettings(env, patch) {
  const change = settingsChange(patch);
  const values = { ...(await getConfigValues(env)) };
  for (const [key, value] of Object.entries(change)) {
    await setConfigString(env, key, value);
    values[key] = value;
  }
  return settingsFromValues(values);
}

// ------------------------------------------------- sending to the mailing list

export const NOT_PRODUCTION = "Nothing goes to the mailing list from here: only production ops can send.";
export const SWITCHED_OFF = "The weekly email is switched off. Switch it on first.";
const CUT_OFF_PREPARING = "It was cut off while being prepared. Nothing was sent.";
const CUT_OFF_SENDING = "The send was started but didn't go through. Nothing was sent.";

/**
 * Every way to the mailing list passes here first: hosted production, with
 * Mailchimp connected, and the weekly email switched on by an admin. Off
 * production this throws before anything is read or written.
 */
async function assertCanSend(env) {
  if (!canReachAudience(env)) throw refusal(403, NOT_PRODUCTION);
  if (!mailchimpConfigured(env)) throw refusal(409, NO_MAILCHIMP);
  const settings = await readSettings(env);
  if (!settings.sending) throw refusal(409, SWITCHED_OFF);
  return settings;
}

function longDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

const why = (error) => String(error?.message || "unknown error");
const hasGone = (campaign) => ["sent", "sending", "schedule"].includes(campaign.status);

/**
 * Build a claimed run's email and put it in a Mailchimp draft: preparing →
 * waiting, or skipped (no nights), or failed (and why). Nothing is sent. A
 * run that already has a campaign reuses it, and if that campaign turns out
 * to have gone already the run is marked sent, never prepared twice.
 */
async function prepare(env, run, { now }) {
  const repo = weeklyEmailRepository(env);
  const end = (to, fields) => repo.move(run.id, ["preparing"], to, fields, now);
  let built;
  try {
    built = await buildWeeklyEmail(env, { now });
  } catch (error) {
    return end("failed", { reason: why(error) });
  }
  if (built.weekStart !== run.weekStart) {
    return end("failed", { reason: "That week is over, so its email wasn't prepared." });
  }
  if (built.empty) return end("skipped", { reason: EMPTY_WEEK, subject: built.subject, preheader: built.preheader });
  try {
    const audience = await getAudience(env);
    if (!audience.memberCount) return end("skipped", { reason: "Nobody is on the mailing list." });
    let campaign = null;
    if (run.campaignId) {
      // Only "it's gone from Mailchimp" (404) allows a new campaign. Any other
      // failure stops here: the earlier one may have been sent.
      campaign = await getCampaign(env, run.campaignId).catch((error) => {
        if (error instanceof MailchimpError && error.mailchimpStatus === 404) return null;
        throw error;
      });
    }
    if (campaign && hasGone(campaign)) {
      return end("sent", { sentAt: campaign.sendTime || nowIso(now), recipients: campaign.emailsSent || run.recipients, reason: "" });
    }
    if (campaign?.status === "save") {
      await updateCampaign(env, campaign.id, { subject: built.subject, preheader: built.preheader });
    } else {
      campaign = await createCampaign(env, {
        title: `Weekly email, week of ${longDate(run.weekStart)}${run.attempt > 1 ? ` (sent again, ${run.attempt})` : ""}`,
        subject: built.subject,
        preheader: built.preheader,
        fromName: audience.fromName,
        replyTo: audience.replyTo,
      });
      // Kept at once: whatever happens next, this run has this campaign and no other.
      await repo.update(run.id, { campaignId: campaign.id, campaignWebId: campaign.webId }, now);
    }
    await setCampaignContent(env, campaign.id, { html: built.html, text: built.text });
    return end("waiting", {
      subject: built.subject,
      preheader: built.preheader,
      campaignId: campaign.id,
      campaignWebId: campaign.webId,
      recipients: audience.memberCount,
      reason: "",
    });
  } catch (error) {
    if (!(error instanceof MailchimpError)) throw error;
    return end("failed", { reason: why(error) });
  }
}

/**
 * Send a waiting run's campaign to the mailing list: waiting → sending →
 * sent. Whoever moves it to `sending` owns the send; anyone else gets the run
 * back untouched. `fresh` rebuilds the email first, so an approval sends what
 * the page shows now, not what was drafted earlier. A campaign goes once: if
 * the answer to the send is lost, Mailchimp is asked what happened rather
 * than asked to send again.
 */
async function send(env, run, { approvedBy = "", fresh = false, now }) {
  await assertCanSend(env);
  const repo = weeklyEmailRepository(env);
  const mine = await repo.move(run.id, ["waiting"], "sending", { approvedBy }, now);
  if (!mine) return repo.get(run.id);
  const end = (to, fields) => repo.move(run.id, ["sending"], to, fields, now);
  let { subject, preheader, recipients } = mine;
  try {
    if (!mine.campaignId) return end("failed", { reason: "It has no Mailchimp draft. Try again." });
    if (fresh) {
      let built;
      try {
        built = await buildWeeklyEmail(env, { now });
      } catch (error) {
        return end("failed", { reason: why(error) });
      }
      if (built.weekStart !== mine.weekStart) return end("failed", { reason: "That week is over, so its email wasn't sent." });
      if (built.empty) return end("skipped", { reason: EMPTY_WEEK });
      ({ subject, preheader } = built);
      await updateCampaign(env, mine.campaignId, { subject, preheader });
      await setCampaignContent(env, mine.campaignId, { html: built.html, text: built.text });
      recipients = (await getAudience(env)).memberCount || recipients;
    }
    await sendCampaignToAudience(env, mine.campaignId);
  } catch (error) {
    if (!(error instanceof MailchimpError)) {
      await end("failed", { reason: why(error) });
      throw error;
    }
    // Did it go anyway? Ask; never send again to find out.
    const campaign = await getCampaign(env, mine.campaignId).catch(() => null);
    if (!campaign || !hasGone(campaign)) {
      return end("failed", {
        reason: campaign ? why(error) : `${why(error)} Check the campaign in Mailchimp before trying again.`,
      });
    }
  }
  return end("sent", { subject, preheader, recipients, sentAt: nowIso(now), reason: "" });
}

/** A run cut off mid-step (the Worker died): find out what happened, without sending anything. */
async function settleStuck(env, run, { now }) {
  const repo = weeklyEmailRepository(env);
  if (run.status === "preparing") return repo.move(run.id, ["preparing"], "failed", { reason: CUT_OFF_PREPARING }, now);
  const campaign = run.campaignId ? await getCampaign(env, run.campaignId).catch(() => null) : null;
  if (campaign && hasGone(campaign)) {
    return repo.move(run.id, ["sending"], "sent", { sentAt: campaign.sendTime || nowIso(now), reason: "" }, now);
  }
  if (run.campaignId && !campaign) return run; // Mailchimp didn't say: leave it and look again next time.
  return repo.move(run.id, ["sending"], "failed", { reason: CUT_OFF_SENDING }, now);
}

/** Tell whoever looks after the email (the notify list, else the admins). Never fails the caller. */
async function tell(env, settings, { subject, lines, opsUrl }) {
  try {
    if (!isGmailConfigured(env)) return false;
    const to = settings.notify.length
      ? settings.notify
      : [...parseAdminEmails((await getConfigValues(env))[ADMIN_EMAILS_KEY])];
    if (!to.length) return false;
    const link = opsUrl ? `${String(opsUrl).replace(/\/+$/, "")}/email` : "";
    await sendGmail(env, {
      from: NOTIFICATIONS_FROM,
      to,
      subject,
      text: [...lines, ...(link ? ["", `Weekly email in ops: ${link}`] : [])].join("\n"),
    });
    return true;
  } catch {
    return false;
  }
}

function tellAbout(env, settings, run, opsUrl) {
  if (run?.status === "waiting") {
    return tell(env, settings, {
      subject: "This week's email is waiting for your OK",
      lines: [
        `"${run.subject}" is ready and would go to ${run.recipients} people.`,
        "It isn't sent until an admin presses Approve and send.",
      ],
      opsUrl,
    });
  }
  if (run?.status === "failed") {
    return tell(env, settings, {
      subject: "This week's email didn't go out",
      lines: [run.reason || "Something went wrong.", "Nothing was sent. An admin can try again from ops."],
      opsUrl,
    });
  }
  return false;
}

/**
 * The scheduler's pass, every five minutes (functions/api/web/tick.js,
 * ?step=email). Off production it does nothing at all. On production, with
 * sending on, it starts this week's email once its time has come: one claim
 * per week, so a second tick (or the cron firing twice) finds the week taken
 * and stops. Approve-first: the draft waits and the admins are told.
 * Otherwise it's sent. It never sends a draft that's waiting for approval,
 * and never touches a week that has a run already, except to settle one that
 * was cut off.
 */
export async function runWeeklyEmailTick(env, { now = new Date(), opsUrl = "" } = {}) {
  if (!canReachAudience(env)) return { action: "none", why: "not production" };
  if (!mailchimpConfigured(env)) return { action: "none", why: "no Mailchimp key" };
  const settings = await readSettings(env);
  if (!settings.sending) return { action: "none", why: "switched off" };
  const repo = weeklyEmailRepository(env);
  const schedule = scheduleAt(settings, now);
  const existing = await repo.latest(schedule.week);
  if (existing) {
    if (!isStuck(existing, now)) return { action: "none", why: `this week is ${existing.status}` };
    const settled = await settleStuck(env, existing, { now });
    if (settled?.status === "failed") await tellAbout(env, settings, settled, opsUrl);
    return { action: "settled", status: settled?.status || existing.status };
  }
  if (schedule.state !== "due") return { action: "none", why: schedule.state === "before" ? "not time yet" : "missed this week's time" };
  const claimed = await repo.claim({ weekStart: schedule.week, attempt: 1, startedBy: "schedule", now });
  if (!claimed) return { action: "none", why: "this week is taken" };
  let run = await prepare(env, claimed, { now });
  if (run?.status === "waiting" && settings.mode === "auto") run = await send(env, run, { now });
  await tellAbout(env, settings, run, opsUrl);
  return { action: run?.status || "none", week: schedule.week };
}

/**
 * "Approve and send" (an admin, on production): send this week's waiting
 * draft, rebuilt from the website as it is now. Pressing it twice, or a
 * retried request, sends once: only a waiting run can be sent.
 */
export async function approveAndSend(env, { email = "", now = new Date() } = {}) {
  const settings = await assertCanSend(env);
  const repo = weeklyEmailRepository(env);
  const run = await repo.latest(scheduleAt(settings, now).week);
  if (run?.status === "sent" || run?.status === "sending") return run;
  if (run?.status !== "waiting") throw refusal(409, "Nothing is waiting for approval this week.");
  return send(env, run, { approvedBy: email, fresh: true, now });
}

/**
 * "Try again" / "Prepare this week's now" (an admin, on production): build
 * this week's email and leave it waiting for Approve and send, whatever the
 * mode. For a week with no run yet (its time was missed), or one that failed
 * or was skipped. Never for a week that's sent, sending or already waiting.
 */
export async function prepareNow(env, { now = new Date() } = {}) {
  const settings = await assertCanSend(env);
  const repo = weeklyEmailRepository(env);
  const week = scheduleAt(settings, now).week;
  let existing = await repo.latest(week);
  if (existing && isStuck(existing, now)) existing = await settleStuck(env, existing, { now });
  let run;
  if (!existing) run = await repo.claim({ weekStart: week, attempt: 1, startedBy: "manual", now });
  else if (existing.status === "failed" || existing.status === "skipped") {
    run = await repo.move(existing.id, ["failed", "skipped"], "preparing", { reason: "" }, now);
  } else if (existing.status === "sent") throw refusal(409, "This week's email has already been sent.");
  else if (existing.status === "waiting") return existing;
  if (!run) throw refusal(409, "This week's email is already being prepared.");
  return prepare(env, run, { now });
}

/**
 * "Send again" (an admin, on production, after a confirmation): a second
 * email for a week that already had one. `after` is the id of the run they
 * were looking at: a retried request names the same run and finds the next
 * attempt already taken, so it can't send a third.
 */
export async function sendAgain(env, { after, email = "", now = new Date() } = {}) {
  const settings = await assertCanSend(env);
  const repo = weeklyEmailRepository(env);
  const week = scheduleAt(settings, now).week;
  const last = await repo.latest(week);
  if (last?.status !== "sent") throw refusal(409, "This week's email hasn't been sent, so there's nothing to send again.");
  if (Number(after) !== last.id) throw refusal(409, "That was already asked for. Refresh to see where it is.");
  const claimed = await repo.claim({ weekStart: week, attempt: last.attempt + 1, startedBy: "manual", now });
  if (!claimed) throw refusal(409, "That was already asked for. Refresh to see where it is.");
  const run = await prepare(env, claimed, { now });
  if (run?.status !== "waiting") return run;
  return send(env, run, { approvedBy: email, now });
}

/** How many people it would go to, for the confirmation. Reads Mailchimp; changes nothing. */
export async function audienceSize(env) {
  if (!mailchimpConfigured(env)) throw refusal(409, NO_MAILCHIMP);
  try {
    const audience = await getAudience(env);
    return { name: audience.name, memberCount: audience.memberCount };
  } catch (error) {
    throw upstream("Couldn't read the mailing list.", error);
  }
}

// ------------------------------------------------------------------ status

function runView(env, run) {
  if (!run) return null;
  const { campaignId: _campaignId, campaignWebId, ...shown } = run;
  return { ...shown, campaignUrl: campaignUrl(env, campaignWebId) };
}

/**
 * Everything the page shows besides the email itself: what can be done here,
 * the settings, when the next one is due, this week's run and the last few.
 * Reads ops' own data only; never Mailchimp.
 */
export async function weeklyEmailStatus(env, { now = new Date() } = {}) {
  const settings = await readSettings(env);
  const schedule = scheduleAt(settings, now);
  let history = [];
  let historyProblem = "";
  try {
    history = await weeklyEmailRepository(env).history(8);
  } catch (error) {
    historyProblem = "Couldn't read what's been sent.";
  }
  const current = history.find((run) => run.weekStart === schedule.week) || null;
  return {
    access: emailAccess(env),
    settings,
    schedule,
    current: runView(env, current),
    stuck: Boolean(current && isStuck(current, now)),
    history: history.map((run) => runView(env, run)),
    historyProblem,
  };
}
