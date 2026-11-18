/**
 * "Send me a test", for every email ops builds (the weekly one, a one-off):
 * the email to the signed-in person's own address, through Mailchimp, so it
 * arrives exactly as the list would get it. A draft campaign carries it and
 * is deleted again; the list gets nothing. Tests are kept to a few each
 * (weekly-email-model.js TEST_LIMITS), counted together across both emails,
 * since they all cost Mailchimp the same.
 */
import { nowIso } from "../../../../../shared/d1.js";
import {
  MailchimpError,
  createCampaign,
  deleteCampaign,
  getAudience,
  mailchimpConfigured,
  sendCampaignTest,
  setCampaignContent,
} from "../../platform/mailchimp.js";
import { testLimitReason } from "./weekly-email-model.js";
import { weeklyEmailRepository } from "./weekly-email-repository.js";

/** An error whose message is for the person on the page (a 4xx, so it's shown as it is). */
export function refusal(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/** A step outside ops that failed: Mailchimp, or building the email. 424, so the page shows why. */
export function upstream(what, error) {
  const known = error instanceof MailchimpError || error?.status === 502;
  if (!known) return error;
  return refusal(424, `${what} ${error.message}`);
}

export const NO_MAILCHIMP = "Mailchimp isn't connected here, so this page is preview only.";

/**
 * Send one test. `build` makes the email only once the test is allowed and
 * counted, so a refused test costs nothing. Check what the page can fix
 * (no subject) before calling: a failed build still counts.
 * @param {Record<string, any>} env
 * @param {{ email: string, title: string, build: () => Promise<{ subject: string, preheader: string, html: string, text: string }>, now?: Date }} test
 *   `email` from the session, never the page; `title` names the throwaway draft in Mailchimp
 * @returns {Promise<{ sentTo: string, subject: string, warning: string }>}
 */
export async function sendTestToAddress(env, { email, title, build, now = new Date() }) {
  if (!mailchimpConfigured(env)) throw refusal(409, NO_MAILCHIMP);
  const to = String(email || "").trim().toLowerCase();
  if (!to) throw refusal(403, "Sign in with Google to send yourself a test: it goes to your own address.");
  const tests = weeklyEmailRepository(env);
  const limited = testLimitReason(await tests.testsSince(nowIso(new Date(now.getTime() - 86_400_000))), to, now);
  if (limited) throw refusal(429, limited);
  // Counted before it's tried, so hammering the button can't hammer Mailchimp.
  await tests.logTest({ email: to, sentAt: nowIso(now) });

  let built;
  try {
    built = await build();
  } catch (error) {
    throw upstream("The test didn't send.", error);
  }
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
  return { sentTo: to, subject: built.subject, warning: leftover ? `The test went.${leftover}` : "" };
}
