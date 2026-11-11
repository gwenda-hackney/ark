/**
 * This week's "what's on" email, built the moment it's asked for from the
 * website's published nights (shared/weekly-email): the same Sanity documents
 * and the same What's on rules as the page, so the two can't disagree.
 *
 * Read-only: two Sanity queries. Nothing here knows Mailchimp.
 */
import { londonToday, weekStart } from "../../../../../marketing/web/src/lib/london-day.js";
import { fetchWeeklyCatalog, renderWeeklyEmail, weeklyEmailModel } from "../../../../../shared/weekly-email/index.js";
import { DATASET, sanityProjectId } from "../../platform/sanity.js";
import { publicSiteOrigin } from "../../website/server/site-urls.js";

/** Why a week with no nights isn't sent. */
export const EMPTY_WEEK = "No nights on the website this week, so there's nothing to send.";

/** A failure the page can show as it is: the email couldn't be built. */
function buildFailed(error) {
  const failed = new Error(`Couldn't build the email: ${error?.message || "unknown error"}`);
  failed.status = 502;
  return failed;
}

/**
 * @param {Record<string, any>} env
 * @param {{ now?: Date }} [options] the moment it's built (tests pin it)
 * @returns {Promise<{
 *   today: string, weekStart: string, week: { start: string, end: string, span: string },
 *   empty: boolean, emptyReason: string, nights: number, deals: number, kitchens: number,
 *   subject: string, preheader: string, html: string, text: string, origin: string,
 * }>}
 */
export async function buildWeeklyEmail(env, { now = new Date() } = {}) {
  const today = londonToday(now);
  const origin = publicSiteOrigin(env);
  let model;
  let email;
  try {
    const catalog = await fetchWeeklyCatalog({
      projectId: sanityProjectId(env),
      dataset: DATASET,
      token: String(env.SANITY_API_TOKEN || "").trim(),
    });
    model = weeklyEmailModel(catalog, { today, origin });
    email = renderWeeklyEmail(model);
  } catch (error) {
    throw buildFailed(error);
  }
  if (!email?.html || !email.subject) throw buildFailed(new Error("the email came out blank"));
  // A what's-on email with no nights isn't worth an inbox, whatever deals run.
  const empty = model.nights.length === 0;
  return {
    today,
    weekStart: weekStart(today),
    week: model.week,
    empty,
    emptyReason: empty ? EMPTY_WEEK : "",
    nights: model.nights.length,
    deals: model.deals.length,
    kitchens: model.kitchens.length,
    subject: email.subject,
    preheader: email.preheader,
    html: email.html,
    text: email.text,
    origin,
  };
}
