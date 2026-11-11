/**
 * The venue's opening hours (#240), as confirmed by the owner: shut
 * Mondays; Tuesday to Thursday 5–10:30pm; Friday 4–11:30pm; Saturday
 * 4pm–1am; Sunday 4–10pm. (Google Maps had Tuesday till 10pm; the owner
 * moved it to 10:30 on 2026-11-11, and Google is updated at launch.)
 *
 * From now on they are kept in ops (Settings → Venue details), and this
 * gives ops its first week. It saves through ops' own use case
 * (venue-details.js saveOpeningHours), so the website gets them the way a
 * save in ops gives them: the preview at once, the website too unless
 * `website.auto_update` is "off", and built pages with the next automatic
 * website update.
 *
 * Only once: a week already in ops is the venue's own, and is left as it
 * is. If that week isn't on the website yet (a run that stopped halfway),
 * it is put there. Safe to run again.
 *
 * Runs after the ops deploy (phase post): its table comes with the D1
 * schema (db/ops/migrations/0010_opening_hours.sql), which deploys apply
 * first. --dry-run (with --only) changes nothing: ops' side runs on a copy
 * of the data (scripts/lib/d1-rehearsal.mjs), and for the website it says
 * what would happen, since Sanity has no copy to rehearse on.
 */
import { DAY_NAMES, assertValidWeek, dayHoursLabel } from "../ops/site/src/venue/hours-model.js";
import { VENUE_D1_TABLES, d1VenueRepository } from "../ops/site/src/venue/server/adapters/d1-venue.js";
import { saveOpeningHours } from "../ops/site/src/venue/server/venue-details.js";
import { putVenueOnWebsite, venueOnWebsite } from "../ops/site/src/venue/server/venue-website.js";
import { DEV_SANITY_PROJECT_ID, REAL_SANITY_PROJECT_ID } from "../shared/sanity-projects.js";
import { databaseForMigration } from "../scripts/lib/d1-rehearsal.mjs";

export const app = "ops";
export const phase = "post";
export const about = "Venue details: the opening hours, once (shut Mondays, Saturday till 1am)";

/** The week, Monday first. Times are London; Saturday's close is after midnight. */
export const WEEK = [
  { day: "mon", closed: true },
  { day: "tue", opens: "17:00", closes: "22:30" },
  { day: "wed", opens: "17:00", closes: "22:30" },
  { day: "thu", opens: "17:00", closes: "22:30" },
  { day: "fri", opens: "16:00", closes: "23:30" },
  { day: "sat", opens: "16:00", closes: "01:00" },
  { day: "sun", opens: "16:00", closes: "22:00" },
];

/** Who the saved week says changed it last. */
export const SAVED_BY = "migration: opening hours";

const words = (days) => days.map((day) => `${DAY_NAMES[day.day]} ${dayHoursLabel(day)}`).join("; ");

const STATES = {
  live: "the website shows them",
  preview: "the preview shows them, waiting for Update website",
  behind: "the website shows other hours",
  none: "the website has none",
};

export async function up({ env, d1, processEnv = {}, log = console.log, dryRun = false }) {
  const db = await databaseForMigration(d1("ops"), { env, role: "ops", tables: VENUE_D1_TABLES, dryRun, log });
  const opsEnv = {
    ...processEnv,
    SITE_ENV: env,
    SANITY_PROJECT_ID: env === "production" ? REAL_SANITY_PROJECT_ID : DEV_SANITY_PROJECT_ID,
    venueRepository: d1VenueRepository(db),
  };
  const say = (line) => log(`${dryRun ? "would " : ""}${line}`);

  const existing = await opsEnv.venueRepository.getOpeningHours();
  if (existing) {
    log(
      `left alone: ops already has opening hours (last changed ${existing.updatedAt || "at an unknown time"}${existing.updatedBy ? ` by ${existing.updatedBy}` : ""}): ${words(existing.days)}`,
    );
    // The whole document: the party facts (#240) go with the hours, so putting one there never drops the other.
    const details = { openingHours: existing.days, parties: await opsEnv.venueRepository.getParties() };
    const state = await venueOnWebsite(opsEnv, details);
    if (state === "live" || state === "preview") {
      log(`on the website: ${STATES[state]}; nothing to do`);
      return { saved: false, published: false };
    }
    if (dryRun) {
      say(`put them on the website (now ${STATES[state]})`);
      return { saved: false, published: false };
    }
    const { published } = await putVenueOnWebsite(opsEnv, details);
    log(published ? "put them on the website" : "put them on the preview; Update website puts them live");
    return { saved: false, published };
  }

  const days = assertValidWeek(WEEK);
  if (dryRun) {
    await opsEnv.venueRepository.saveOpeningHours({ days, updatedAt: new Date().toISOString(), updatedBy: SAVED_BY });
    say(`save the opening hours in ops: ${words(days)}`);
    const state = await venueOnWebsite(opsEnv, { openingHours: days }).catch(() => "");
    say(`put them on the website (now ${STATES[state] || "not checked"})`);
    return { saved: true, published: false };
  }
  const result = await saveOpeningHours(opsEnv, days, { by: SAVED_BY });
  log(`saved the opening hours in ops: ${words(result.openingHours.days)}`);
  if (result.published) log("put them on the website; built pages follow with the next automatic website update");
  else if (result.website === "preview") log("put them on the preview; Update website on the Website page puts them live");
  for (const warning of result.warnings) log(`warning: ${warning}`);
  if (!result.published && result.website !== "preview") {
    throw new Error(
      `The opening hours are saved in ops but not on the website: ${result.warnings.join("; ") || "unknown"}. Run again to try again.`,
    );
  }
  return { saved: true, published: result.published };
}
