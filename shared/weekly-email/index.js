/**
 * The weekly "what's on" email (#240): the website's upcoming nights as an
 * email that looks like the website. Read the catalog (catalog.js), shape the
 * week (model.js), render it (render.js). Nothing here sends anything.
 */
export { fetchWeeklyCatalog, mapCatalog } from "./catalog.js";
export { weeklyEmailModel } from "./model.js";
export { MAILCHIMP_TAGS, renderWeeklyEmail } from "./render.js";
