/**
 * The promotions and pop-up kitchens reach the website as what they are.
 * 2026-11-10-a-series-categories says what each series is in ops; the website
 * reads it from the series' page and from every night (`category`), so a
 * series whose documents don't carry it yet still shows as nights in What's
 * on. This puts each such series on the website now, the way ops does after a
 * save (event-publish.js putEventOnWebsite: stage the preview, then publish
 * this series' documents only), instead of waiting for the website job to
 * work through its nights.
 *
 * It runs last of the 2026-11-10 migrations (file names run in order), after
 * one happy hour is left and its days are right. Every series that is a
 * promotion or a pop-up kitchen is checked against the website itself: its
 * page and nights to come, on the preview and on the website. One that
 * already carries its category everywhere, with nothing waiting in ops, is
 * left. Where the website doesn't follow saves by itself (the setting
 * website.auto_update is "off") only the preview is staged, and the series
 * waits for Update website like any other save. Safe to run again.
 *
 * --dry-run (with --only) says which series it would put on the website and
 * writes nothing: the website has no copy to rehearse on.
 */
import { publishedCategory } from "../ops/site/src/events/server/event-content.js";
import { eventDocumentIds, publishEventPreview, putEventOnWebsite } from "../ops/site/src/events/server/event-publish.js";
import { listEvents, liveNightsBehind, previewBehind } from "../ops/site/src/events/server/event-store.js";
import { websiteFollowsSaves } from "../ops/site/src/events/server/website-jobs.js";
import { draftId, sanityQuery } from "../ops/site/src/platform/sanity.js";
import { opsDataForMigration } from "../scripts/lib/ops-migration.mjs";

export const app = "ops";
export const phase = "post";
export const about = "Events: promotions and pop-up kitchens on the website as what they are";

const WORDS = { promotion: "a promotion", popup: "a pop-up kitchen" };
const title = (event) => `"${event.name}" (series ${event.id})`;

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * How many of the series' documents (its page, its nights to come) lack its
 * category, on the preview (`drafts`) and on the website (`live`), and how
 * many aren't on the website at all (`missing`).
 */
export async function websiteGap(env, event, now = today()) {
  const want = publishedCategory(event.category);
  const ids = await eventDocumentIds(env, event);
  const docs =
    (await sanityQuery(env, "raw", "*[_id in $ids]{ _id, _type, category, date, removed }", {
      ids: [...ids, ...ids.map(draftId)],
    })) || [];
  const counts = (doc) => doc.removed !== true && (doc._type === "eventSeries" || String(doc.date || "") >= now);
  const drafts = docs.filter((doc) => doc._id.startsWith("drafts.") && counts(doc));
  const published = docs.filter((doc) => !doc._id.startsWith("drafts.") && counts(doc));
  const onWebsite = new Set(published.map((doc) => doc._id));
  const expected = [ids.at(-1), ...(event.dates || []).filter((night) => night.date >= now && night.sanityId).map((night) => night.sanityId)];
  return {
    drafts: drafts.filter((doc) => doc.category !== want).length,
    live: published.filter((doc) => doc.category !== want).length,
    missing: expected.filter((id) => !onWebsite.has(id)).length,
  };
}

/**
 * Put every promotion and pop-up kitchen on the website with its category.
 * @returns {Promise<{ put: number, staged: number }>}
 */
export async function promotionsOnWebsite(env, log = () => {}, { dryRun = false, now = today() } = {}) {
  const goesLive = await websiteFollowsSaves(env);
  let put = 0;
  let staged = 0;
  for (const event of await listEvents(env)) {
    const want = publishedCategory(event.category);
    if (!want || event.deletedAt) continue;
    if (!(event.publish?.previewDates || []).length) {
      log(`left alone: ${title(event)} has no night to come`);
      continue;
    }
    const gap = await websiteGap(env, event, now);
    // The documents decide, not only what ops remembers staging: older ops
    // code may have staged them since without the category.
    const differs = gap.drafts > 0 || (goesLive && (gap.live > 0 || gap.missing > 0));
    const waiting = previewBehind(event, now) || (goesLive && liveNightsBehind(event, now) > 0);
    if (!differs && !waiting) {
      log(`${title(event)} is already on the ${goesLive ? "website" : "preview"} as ${WORDS[want]}`);
      continue;
    }
    if (dryRun) {
      log(`would put ${title(event)} on the ${goesLive ? "website" : "preview"} as ${WORDS[want]}`);
      continue;
    }
    const stagedNow = differs || !goesLive ? await publishEventPreview(env, event.id, { force: differs }) : { warnings: [] };
    if (!goesLive) {
      staged += 1;
      log(`${title(event)} is on the preview as ${WORDS[want]}; the website waits for Update website (website.auto_update is off)${notes(stagedNow.warnings)}`);
      continue;
    }
    const result = await putEventOnWebsite(env, event.id);
    put += 1;
    log(`${title(event)} is on the website as ${WORDS[want]}: ${result.written.length} documents written${notes([...stagedNow.warnings, ...result.warnings])}`);
  }
  return { put, staged };
}

function notes(warnings) {
  return warnings?.length ? `. Notes: ${warnings.join("; ")}` : "";
}

export async function up({ env, d1, processEnv, log, dryRun = false }) {
  const data = await opsDataForMigration({ env, d1, dryRun, log, processEnv });
  const { put, staged } = await promotionsOnWebsite(data.env, log, { dryRun });
  if (dryRun) return;
  if (!put && !staged) log("Nothing to do: every promotion and pop-up kitchen is on the website as what it is.");
  if (put) log(`${put} series put on the website.`);
  if (staged) log(`${staged} series staged on the preview.`);
}
