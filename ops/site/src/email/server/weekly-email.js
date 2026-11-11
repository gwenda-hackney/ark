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
import {
  MailchimpError,
  canReachAudience,
  createCampaign,
  deleteCampaign,
  getAudience,
  mailchimpConfigured,
  sendCampaignTest,
  setCampaignContent,
} from "../../platform/mailchimp.js";
import { buildWeeklyEmail } from "./weekly-email-build.js";
import { testLimitReason } from "./weekly-email-model.js";
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
