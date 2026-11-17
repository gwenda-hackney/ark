/**
 * Chez Pickle's own colour (#319): their logo's green, set on their event in
 * ops as the Images tab sets it (event-store.js setEventAccentColor). The
 * website then shows their name in it on home's Food board and on /kitchen,
 * and fills their card's day tag with it.
 *
 * COLOUR is the logo's most common ink colour, measured from
 * assets/2026-11-12-popup-logo/chez-pickle.png (the logo ops has) with
 * sharp: every opaque pixel that isn't the white ground or a grey edge,
 * grouped by colour; this one covers about a sixth of the ink, and the next
 * few are the same green a shade either way.
 *
 * Only when it has no colour: one the owner has set since is left as it is.
 * Then the website gets it as after any save, and Update website for this
 * event when automatic updates are off (ops-migration.mjs
 * putEventOnWebsiteNow). Found by its web address, /whats-on/chez-pickle,
 * which dev and production share; no Chez Pickle stops the deploy with a
 * message saying so. Safe to run again.
 *
 * --dry-run (with --only) changes nothing anywhere: it says what it would do.
 */
import { listEvents, setEventAccentColor } from "../ops/site/src/events/server/event-store.js";
import { eventInStepWithWebsite, opsDataForMigration, putEventOnWebsiteNow } from "../scripts/lib/ops-migration.mjs";

export const app = "ops";
export const phase = "post";
export const about = "Events: Chez Pickle's own colour, their logo's green, for their name and tag on the website";

/** /whats-on/chez-pickle */
export const SLUG = "chez-pickle";
/** Their logo's green (see above). */
export const COLOUR = "#024a34";

const title = (event) => `"${event.name}" (event ${event.id})`;

async function findChezPickle(env) {
  const events = await listEvents(env, { withDeleted: true });
  const found =
    events.find((event) => event.slug === SLUG) || events.find((event) => (event.formerSlugs || []).includes(SLUG));
  if (!found) {
    throw new Error(
      `Chez Pickle was not found: no event at /whats-on/${SLUG} (nor one that had that address). Nothing was changed. Check Events in ops, then run this again.`,
    );
  }
  return found;
}

export async function up({ env, d1, processEnv, log, dryRun = false }) {
  const data = await opsDataForMigration({ env, d1, dryRun, log, processEnv });
  const found = await findChezPickle(data.env);
  if (found.deletedAt) {
    log(`left alone: ${title(found)} is deleted in ops; nothing was changed`);
    return { colour: "owner's", published: false };
  }
  const has = String(found.accentColor || "");
  if (has && has !== COLOUR) {
    log(`left alone: ${title(found)} has a colour of its own, ${has}; it was not replaced`);
    return { colour: "owner's", published: false };
  }
  if (has === COLOUR && eventInStepWithWebsite(found)) {
    log(`Nothing to do: ${title(found)} has its colour, ${COLOUR}, and the website is in step.`);
    return { colour: "there", published: false };
  }
  if (dryRun) {
    log(`would set ${COLOUR} as the colour of ${title(found)} and put it on the website`);
    return { colour: has ? "there" : "added", published: false };
  }
  const event = has ? found : await setEventAccentColor(data.env, found.id, COLOUR);
  if (!has) log(`set ${COLOUR} as the colour of ${title(event)}`);
  const live = await putEventOnWebsiteNow(data.env, event.id);
  log(`${title(live)} is on the website with its colour: /whats-on/${live.slug}`);
  return { colour: has ? "there" : "added", published: true };
}
