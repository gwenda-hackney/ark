/**
 * Whether what staff save goes on the website by itself (#240): saved
 * events (events/server/website-jobs.js) and opening hours
 * (hours/server/hours-website.js). The setting `website.auto_update` set to
 * "off" stops them at the preview, waiting for Update website.
 */
import { getSetting } from "../../../../../shared/config.js";

export const AUTO_UPDATE_KEY = "website.auto_update";

/**
 * True unless the setting says "off". When the settings can't be read it
 * may say "off", so the answer is no for this pass: the save stops at the
 * preview, and the next pass (or save) asks again.
 */
export async function websiteFollowsSaves(env, { read = getSetting } = {}) {
  try {
    const value = await read(env, "ops", AUTO_UPDATE_KEY);
    return String(value || "").toLowerCase() !== "off";
  } catch {
    return false;
  }
}
