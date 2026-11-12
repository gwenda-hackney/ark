/**
 * Chez Pickle's logo and Instagram move into ops (#296). Until now they were
 * in the website's code (siteConfig.guestChef and food/chez-pickle.png); from
 * now on a pop-up kitchen's logo is on its event in ops (its Images tab) and
 * its Instagram is its link (Details), and the website reads both from there.
 *
 * It goes the way ops does it:
 *
 * 1. The logo (assets/2026-11-12-popup-logo/chez-pickle.png, the file the
 *    website showed) is added as the Images tab adds one (event-store.js
 *    setEventLogo: uploaded to Sanity, kept in ops). Only when it has none:
 *    a logo the owner has set since is left as it is. A logo is known by its
 *    bytes: Sanity names an image by their SHA-1.
 * 2. Its Instagram (INSTAGRAM, what the website's code had) goes in its link
 *    through the editor's own save (event-store.js updateEvent), only when
 *    the link is empty: a link the owner has set is left as it is.
 * 3. The website then gets it as after any save (website-jobs.js), and
 *    Update website for this event when the setting website.auto_update is
 *    off (ops-migration.mjs putEventOnWebsiteNow). Built pages (home's Food
 *    board, the pop-up's card) follow with the next automatic website update.
 *
 * Found by its web address, /whats-on/chez-pickle, which dev and production
 * share; no Chez Pickle stops the deploy with a message saying so. Safe to
 * run again: once it has its logo and Instagram and the website is in step,
 * there is nothing to do, and a run that stopped halfway is finished.
 *
 * --dry-run (with --only) changes nothing anywhere: the save runs on a copy
 * of the data (scripts/lib/d1-rehearsal.mjs), and for the logo and the
 * website it says what would happen, since Sanity has no copy to rehearse on.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseImageAssetId } from "../shared/sanity-image.js";
import { listEvents, setEventLogo, updateEvent } from "../ops/site/src/events/server/event-store.js";
import { eventInStepWithWebsite, opsDataForMigration, putEventOnWebsiteNow } from "../scripts/lib/ops-migration.mjs";

export const app = "ops";
export const phase = "post";
export const about = "Events: Chez Pickle's logo and Instagram move from the website's code onto its event in ops";

/** /whats-on/chez-pickle */
export const SLUG = "chez-pickle";
/** The logo the website showed, kept here for this migration. */
export const LOGO = new URL("./assets/2026-11-12-popup-logo/chez-pickle.png", import.meta.url);
/** Its Instagram, as the website's code had it (siteConfig.guestChef.instagram). */
export const INSTAGRAM = "https://www.instagram.com/chezpickle";

const title = (event) => `"${event.name}" (event ${event.id})`;
const hashOf = (asset) => parseImageAssetId(asset)?.sha1 || "";
/** The same link, however it was typed: no case, no trailing slash. */
const sameLink = (a, b) => String(a || "").trim().replace(/\/+$/, "").toLowerCase() === String(b || "").trim().replace(/\/+$/, "").toLowerCase();

/** The logo as the Images tab uploads it: { filename, bytes, contentType, sha1 }. */
export async function planLogo(file = LOGO) {
  const bytes = await readFile(file).catch(() => {
    throw new Error(`The logo isn't at ${file.pathname}: the migration needs it.`);
  });
  return {
    filename: "chez-pickle.png",
    bytes,
    contentType: "image/png",
    sha1: createHash("sha1").update(bytes).digest("hex"),
  };
}

/** Chez Pickle by its web address, or a clear error. */
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

/**
 * Its logo, unless it has one.
 * @returns {Promise<{ event: object, logo: "added" | "there" | "owner's" }>}
 */
async function addLogo(env, event, logo, say, { dryRun }) {
  const has = hashOf(event.logo?.asset);
  if (has === logo.sha1) return { event, logo: "there" };
  if (has) {
    say(`left alone: ${title(event)} has a logo of its own; it was not replaced`);
    return { event, logo: "owner's" };
  }
  if (dryRun) {
    say(`would add ${logo.filename} as the logo of ${title(event)}`);
    return { event, logo: "added" };
  }
  const saved = await setEventLogo(env, event.id, logo);
  say(`added ${logo.filename} as the logo of ${title(saved)}`);
  return { event: saved, logo: "added" };
}

/**
 * Its Instagram in its link, unless it has a link.
 * @returns {Promise<{ event: object, instagram: "added" | "there" | "owner's" }>}
 */
async function addInstagram(env, event, say, { dryRun }) {
  const link = String(event.pageUrl || "").trim();
  if (sameLink(link, INSTAGRAM)) return { event, instagram: "there" };
  if (link) {
    say(`    left alone: its link is ${link}; it was not replaced`);
    return { event, instagram: "owner's" };
  }
  const saved = await updateEvent(env, event.id, { pageUrl: INSTAGRAM });
  say(`    its Instagram ${dryRun ? "would be" : "is now"} ${saved.pageUrl}`);
  return { event: saved, instagram: "added" };
}

export async function up({ env, d1, processEnv, log, dryRun = false }) {
  const logo = await planLogo();
  const data = await opsDataForMigration({ env, d1, dryRun, log, processEnv });
  const found = await findChezPickle(data.env);
  if (found.deletedAt) {
    log(`left alone: ${title(found)} is deleted in ops and waits on the Website page; nothing was changed`);
    return { logo: "owner's", instagram: "owner's", published: false };
  }

  const lines = [];
  const say = (line) => lines.push(line);
  if (found.category !== "popup") {
    say(`note: ${title(found)} is not a pop-up kitchen in ops; the website shows its logo once it is one`);
  }
  const withLogo = await addLogo(data.env, found, logo, say, { dryRun });
  const withLink = await addInstagram(data.env, withLogo.event, say, { dryRun });
  const event = withLink.event;
  const result = { logo: withLogo.logo, instagram: withLink.instagram };
  const changed = result.logo === "added" || result.instagram === "added";

  if (!changed && eventInStepWithWebsite(event)) {
    for (const line of lines) log(line);
    log(
      result.logo === "there" && result.instagram === "there"
        ? `Nothing to do: ${title(event)} has its logo and its Instagram, and the website is in step.`
        : `Nothing to do: ${title(event)} is as the owner left it, and the website is in step.`,
    );
    return { ...result, published: false };
  }
  for (const line of lines) log(line);
  if (!changed) log(`${title(event)} has its logo and Instagram in ops; finishing: putting it on the website`);
  if (dryRun) {
    log(`would put it on the website (/whats-on/${event.slug}): its logo on home's Food board, its card and its page`);
    return { ...result, published: false };
  }
  const live = await putEventOnWebsiteNow(data.env, event.id);
  log(`${title(live)} is on the website: /whats-on/${live.slug}, with its logo and Instagram`);
  return { ...result, published: true };
}
