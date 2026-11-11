#!/usr/bin/env node
/**
 * Rehearse this branch's production rollout on dev, in one go:
 *
 *   npm run rehearse:rollout               for real, on dev
 *   npm run rehearse:rollout -- --dry-run  say what it would do; writes nothing
 *   npm run rehearse:rollout -- --no-copy  keep dev's data; migrate, stage and check only
 *
 * 1. Copy production over dev: the menu, events and artists (D1, through
 *    scripts/data-move.mjs, which logs a Time Travel bookmark of dev first)
 *    and the website content with its images (Sanity, scripts/lib/dev-copy).
 * 2. Apply the D1 schema to dev (scripts/d1-migrate.mjs).
 * 3. Run this branch's ops post-deploy migrations on dev (scripts/migrate.mjs),
 *    in file-name order: the ones in migrations/ that main doesn't have.
 *    Older ones have run in production already, so the copy carries their
 *    result (and the Baserow ones would ask for a login).
 * 4. Bring the website content up to date the way ops does by itself after a
 *    deploy: the menu's Update website, then the events' website job until
 *    nothing is waiting.
 * 5. Check the result and say so; a failed check exits 1.
 *
 * Dev is the only thing written. Production is read: its D1 with SELECT, its
 * Sanity project with an export. Any other target is refused.
 *
 * Two things a copy of production brings that dev must not act on:
 * - Each series' Drive folder is production's, and dev's Google service
 *   account is the same one, so deleting a series on dev would bin the real
 *   folder. data-move leaves those behind on any copy out of production
 *   (scripts/lib/data-move/features.mjs detachEvent), and says how many, so
 *   they never reach dev. A folder a series has later is one dev made since,
 *   and the migrations treat it as ops would (dev's calendar is its own; an
 *   entry id copied from production is simply not found there). Step 4 runs
 *   without the Google account: hosted dev ops keeps dev's calendar, not the
 *   rehearsal.
 * - Hosted dev ops runs main, which knows nothing of this branch. See
 *   holdHostedDev below.
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { environmentOf, readState, writeState } from "../shared/config.js";
import { databaseFor } from "../shared/d1-env.js";
import { DEV_SANITY_PROJECT_ID, REAL_SANITY_PROJECT_ID } from "../shared/sanity-projects.js";
import { publishedCategory } from "../ops/site/src/events/server/event-content.js";
import { listEvents } from "../ops/site/src/events/server/event-store.js";
import {
  FAILURES_KEY,
  contentSignature,
  parseFailures,
  runWebsiteJob,
} from "../ops/site/src/events/server/website-jobs.js";
import { flattenMenuSections } from "../ops/site/src/menu/menu-sections.js";
import { loadMenuTree } from "../ops/site/src/menu/server/menu-store.js";
import { sanityProjectId, sanityQuery } from "../ops/site/src/platform/sanity.js";
import { syncOpsMenuToSanity } from "../ops/site/src/website/server/publish-sync.js";
import { getReleaseDiff, markReleasedInOps, publishRelease } from "../ops/site/src/website/server/release.js";
import { copySanityContent } from "./lib/dev-copy/content.mjs";
import { loadMigrations, selectMigrations } from "./lib/migrations.mjs";
import { opsDataForMigration } from "./lib/ops-migration.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "dev";
/** Copied in this order: the menu's chapters may point at a series, so the menu goes first. */
const FEATURES = ["menu", "events", "artists"];
const COCKTAIL_HOUR = "Cocktail Hour 🍹";
const COCKTAIL_HOUR_WAS = "From Wednesday to Saturday is the Cocktail Hour 🍹";
const CATEGORIES = { [COCKTAIL_HOUR]: "promotion", "Chez Pickle": "popup" };

const flags = process.argv.slice(2);
const unknown = flags.filter((flag) => !["--dry-run", "--no-copy"].includes(flag));
if (unknown.length) {
  console.error(`Unknown argument: ${unknown.join(" ")}. The rehearsal only ever runs on dev; it takes --dry-run and --no-copy.`);
  process.exit(2);
}
const dryRun = flags.includes("--dry-run");
const copy = !flags.includes("--no-copy");

const step = (title) => console.log(`\n== ${title}${dryRun ? " (dry run)" : ""}`);
/** Step 4 gets no Google account: see the header. */
const quietEnv = { ...process.env, GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON: "", GOOGLE_SERVICE_ACCOUNT_JSON: "" };

function node(args, env = process.env) {
  console.log(`$ node ${args.join(" ")}`);
  const result = spawnSync(process.execPath, args, { cwd: ROOT, stdio: "inherit", env });
  if (result.status !== 0) throw new Error(`node ${args[0]} failed.`);
}

/** The ops post-deploy migrations this branch adds: in migrations/, and not on main. */
async function branchMigrations() {
  const git = (args) => {
    const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
    if (result.status !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr}`);
    return result.stdout.split("\n").filter(Boolean);
  };
  const added = new Set(
    [
      ...git(["diff", "--name-only", "--diff-filter=A", "origin/main", "--", "migrations"]),
      ...git(["ls-files", "--others", "--exclude-standard", "--", "migrations"]),
    ].map((file) => file.replace(/^migrations\//, "")),
  );
  const all = selectMigrations(await loadMigrations(resolve(ROOT, "migrations")), { app: "ops", phase: "post" });
  return all.filter((migration) => added.has(migration.name)).map((migration) => migration.name.replace(/\.mjs$/, ""));
}

/** Ops' use cases on dev's D1 and dev's Sanity project, without the Google account. */
async function devOps() {
  const { env } = await opsDataForMigration({
    env: TARGET,
    d1: (role) => databaseFor({ ...process.env, SITE_ENV: TARGET }, role),
    dryRun: false,
    log: () => {},
    processEnv: quietEnv,
  });
  if (environmentOf(env) !== TARGET || sanityProjectId(env) !== DEV_SANITY_PROJECT_ID || sanityProjectId(env) === REAL_SANITY_PROJECT_ID) {
    throw new Error("Not dev: refusing to go on.");
  }
  return env;
}

/** The menu's Update website (functions/api/menu/publish.js), without starting a site build. */
async function menuOnWebsite(env) {
  const sync = await syncOpsMenuToSanity(env, { target: "preview" });
  const ids = (await getReleaseDiff(env)).entries
    .filter((entry) => ["menuItem", "menuSection"].includes(entry.doc?._type || entry.type))
    .map((entry) => entry.id);
  const result = ids.length ? await publishRelease(env, { ids }) : { written: [], deleted: [], warnings: [] };
  if (ids.length) await markReleasedInOps(env, [...ids, ...result.written], { deleted: result.deleted });
  const warnings = [...(sync?.warnings || []), ...result.warnings];
  console.log(`Menu: ${result.written.length} documents put on the website, ${result.deleted.length} taken off.${warnings.length ? ` Notes: ${warnings.join("; ")}` : ""}`);
}

/** The events' website job (website-jobs.js), a step at a time until nothing is waiting. */
async function eventsOnWebsite(env) {
  const failed = new Map();
  let steps = 0;
  for (; steps < 600; steps += 1) {
    const result = await runWebsiteJob(env);
    if (result.idle) break;
    if (result.failed) failed.set(result.eventId, result.failed);
  }
  console.log(`Events: ${steps} website job steps; ${failed.size} series could not go on the website.`);
  for (const [id, message] of failed) console.log(`  series ${id}: ${message}`);
}

/**
 * TEMPORARY, until main has event categories (hosted dev ops deploys from
 * main; delete this function and its call then).
 * Delete when: this branch is merged to main and hosted dev ops has deployed it.
 *
 * Hosted dev ops shares dev's D1 and Sanity with this branch and runs its
 * website job every five minutes. Its older code leaves the category out of
 * what it compares, so it sees every promotion and pop-up kitchen staged by
 * this branch as out of date and stages it again without the category: on
 * the preview they turn back into nights. Its job skips a series it has
 * noted as failed for as long as the series is unchanged (website-jobs.js
 * currentFailure), so that note is written here, with the signature the
 * older code works out. This branch's code works out another signature and
 * takes no notice of it. Editing the series in ops ends the hold.
 */
async function holdHostedDev(env) {
  const held = (await listEvents(env)).filter((event) => publishedCategory(event.category));
  const state = environmentOf(env);
  const failures = parseFailures(await readState(env, "ops", FAILURES_KEY, state).catch(() => ""));
  for (const event of held) {
    failures[String(event.id)] = {
      message: "Held by npm run rehearse:rollout: staged by a branch with event categories. Hosted dev ops (main) would stage it again without them.",
      at: new Date().toISOString(),
      signature: contentSignature({ ...event, category: "event" }),
    };
  }
  if (!dryRun && held.length) await writeState(env, "ops", FAILURES_KEY, state, JSON.stringify(failures));
  console.log(`Hosted dev ops ${dryRun ? "would be" : "is"} held off ${held.length} series: ${held.map((event) => `"${event.name}"`).join(", ") || "none"}.`);
}

const weekday = (date) => ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date(`${date}T12:00:00Z`).getUTCDay()];

/** What the release promises, read from dev's D1 and dev's Sanity (preview and website). Returns the failures. */
async function check(env) {
  const problems = [];
  const say = (ok, line) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${line}`);
    if (!ok) problems.push(line);
  };
  const today = new Date().toISOString().slice(0, 10);
  const events = await listEvents(env, { withDeleted: true });
  say(!events.some((event) => event.name.trim() === "Happy Hour"), '"Happy Hour" is gone from ops');
  for (const view of ["preview", "production"]) {
    const left = await sanityQuery(env, view, `count(*[(_type == "eventSeries" && title == "Happy Hour") || (_type == "event" && title == "Happy Hour" && date >= $today)])`, { today });
    say(left === 0, `"Happy Hour" is gone from the ${view === "preview" ? "preview" : "website"} (${left} documents)`);
  }
  say(!events.some((event) => event.name.trim() === COCKTAIL_HOUR_WAS), `"${COCKTAIL_HOUR_WAS}" is now named "${COCKTAIL_HOUR}" in ops`);
  for (const [name, category] of Object.entries(CATEGORIES)) {
    const event = events.find((row) => row.name.trim() === name && !row.deletedAt);
    say(event?.category === category, `"${name}" is a ${category} in ops (${event ? event.category : "not found"})`);
    if (!event) continue;
    for (const view of ["preview", "production"]) {
      const docs =
        (await sanityQuery(env, view, `*[(_type == "eventSeries" && slug.current == $slug) || (_type == "event" && seriesId == $slug && date >= $today)]{ _type, title, category, date, removed }`, { slug: event.slug, today })) || [];
      const shown = docs.filter((doc) => doc.removed !== true);
      const nights = shown.filter((doc) => doc._type === "event");
      const without = shown.filter((doc) => doc.category !== category).length;
      const where = view === "preview" ? "preview" : "website";
      say(shown.length > nights.length && without === 0, `"${name}" on the ${where}: its page and ${nights.length} nights to come are a ${category} (${without} are not)`);
      if (name === COCKTAIL_HOUR) {
        const titles = [...new Set(shown.map((doc) => doc.title))];
        say(titles.join() === COCKTAIL_HOUR, `"${name}" on the ${where}: named ${titles.map((text) => `"${text}"`).join(", ")}, at /whats-on/${event.slug}`);
        const days = [...new Set(nights.map((doc) => weekday(doc.date)))].sort();
        say(nights.length > 0 && days.join() === ["fri", "sat", "thu", "wed"].join(), `"${name}" on the ${where}: nights on ${days.join(", ") || "no day"} (Wednesday to Saturday only)`);
      }
    }
    if (name === COCKTAIL_HOUR) say((event.weekdays || []).join() === "wed,thu,fri,sat", `"${name}" runs ${(event.weekdays || []).join(", ")} in ops`);
  }
  const sections = flattenMenuSections((await loadMenuTree(env)).sections);
  const chapter = sections.find((section) => section.slug === "chez-pickle");
  const popup = events.find((row) => row.name.trim() === "Chez Pickle");
  say(Boolean(chapter) && chapter.kind === "kitchen" && String(chapter.popupSeriesId || "") === String(popup?.id || "none"), `Chez Pickle's menu chapter is in ops, as food, belonging to the pop-up kitchen (series ${chapter?.popupSeriesId || "none"})`);
  say(sections.some((section) => section.slug === "beer" && !section.parentId), "The Beer chapter is in ops");
  for (const view of ["preview", "production"]) {
    const where = view === "preview" ? "preview" : "website";
    const docs = (await sanityQuery(env, view, `*[_type == "menuSection" && slug.current in ["chez-pickle", "beer"]]{ "slug": slug.current, kind, "popup": popupSeries._ref, "dishes": count(*[_type == "menuItem" && section._ref in *[_type == "menuSection" && parent._ref == ^.^._id]._id]) }`)) || [];
    const pickle = docs.find((doc) => doc.slug === "chez-pickle");
    say(pickle?.kind === "kitchen" && pickle.popup === (popup ? `series-${popup.slug}` : "none"), `Chez Pickle's chapter on the ${where}: ${pickle ? `${pickle.kind}, pop-up kitchen ${pickle.popup || "not linked"}, ${pickle.dishes} dishes` : "not there"}`);
    say(docs.some((doc) => doc.slug === "beer"), `The Beer chapter is on the ${where}`);
  }
  return problems;
}

try {
  console.log(`Rehearsing the rollout on ${TARGET}${dryRun ? " (dry run: nothing is written)" : ""}. Production is only read.`);
  if (copy) {
    step("1. Copy production to dev: menu, events, artists (D1)");
    for (const feature of FEATURES) {
      node(["scripts/data-move.mjs", "--feature", feature, "--from", "d1:production", "--to", `d1:${TARGET}`, ...(dryRun ? [] : ["--write"])]);
    }
    step("1. Copy production to dev: website content and images (Sanity)");
    copySanityContent({ dryRun, source: REAL_SANITY_PROJECT_ID, target: DEV_SANITY_PROJECT_ID });
  }
  step("2. D1 schema");
  node(["scripts/d1-migrate.mjs", "--env", TARGET, "--db", "ops", ...(dryRun ? ["--dry-run"] : [])]);
  // After the schema: ops' code reads the columns this branch adds.
  const env = await devOps();

  step("3. This branch's ops post-deploy migrations");
  const migrations = await branchMigrations();
  if (!migrations.length) console.log("This branch adds none.");
  for (const name of migrations) {
    // A dry run works on a copy of dev's data as it is now, one migration at a time.
    node(["scripts/migrate.mjs", "--app", "ops", "--phase", "post", "--env", TARGET, "--only", name, ...(dryRun ? ["--dry-run"] : [])]);
  }

  step("4. The website follows: the menu, then the events");
  if (dryRun) console.log("Not run: it would publish the menu and run the events' website job until nothing is waiting.");
  else {
    await menuOnWebsite(env);
    await eventsOnWebsite(env);
  }
  await holdHostedDev(env);

  step("5. Check");
  const problems = await check(env);
  if (problems.length) {
    console.error(`\n${problems.length} check${problems.length === 1 ? "" : "s"} failed${dryRun ? " (dev as it is now; nothing was run)" : ""}.`);
    process.exit(1);
  }
  console.log("\nDone: dev is as production will be after the rollout.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
