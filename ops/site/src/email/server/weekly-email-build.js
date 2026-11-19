/**
 * This month's "what's on" email, built the moment it's asked for from the
 * website's published nights (shared/weekly-email): the same Sanity documents
 * and the same What's on rules as the page, so the two can't disagree.
 *
 * Read-only: two Sanity queries. Nothing here knows Mailchimp.
 */
import { londonToday } from "../../../../../marketing/web/src/lib/london-day.js";
import { monthStart } from "./weekly-email-model.js";
import { fetchWeeklyCatalog, renderWeeklyEmail, weeklyEmailModel } from "../../../../../shared/weekly-email/index.js";
import { DATASET, sanityProjectId } from "../../platform/sanity.js";
import { emailFrame } from "./email-frame.js";

/** Why a month with no nights left isn't sent. */
export const EMPTY_MONTH = "No nights on the website for the rest of the month, so there's nothing to send.";

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
 *   today: string, monthStart: string, month: { start: string, end: string, name: string, span: string },
 *   empty: boolean, emptyReason: string, nights: number, deals: number, kitchens: number,
 *   subject: string, preheader: string, html: string, text: string, origin: string,
 * }>}
 */
export async function buildWeeklyEmail(env, { now = new Date() } = {}) {
  const today = londonToday(now);
  const frame = emailFrame(env);
  const origin = frame.site.origin;
  let model;
  let email;
  try {
    const catalog = await fetchWeeklyCatalog({
      projectId: sanityProjectId(env),
      dataset: DATASET,
      token: String(env.SANITY_API_TOKEN || "").trim(),
    });
    model = weeklyEmailModel(catalog, { today, origin });
    email = renderWeeklyEmail(model, { logoUrl: frame.logoUrl });
  } catch (error) {
    throw buildFailed(error);
  }
  if (!email?.html || !email.subject) throw buildFailed(new Error("the email came out blank"));
  // A what's-on email with no nights isn't worth an inbox, whatever deals run.
  const empty = model.nights.length === 0;
  return {
    today,
    monthStart: monthStart(today),
    month: model.month,
    empty,
    emptyReason: empty ? EMPTY_MONTH : "",
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
