/**
 * The menu and the events, for a deploy migration (migrations/*.mjs): their
 * repositories on this environment's D1, or for a dry run on a rehearsal
 * copy (d1-rehearsal.mjs), so the migration runs the real use cases either
 * way. Every write is logged as what changed. A migration that changes an
 * event the owner wants on the website now puts it there with
 * putEventOnWebsiteNow.
 */
import {
  EVENT_D1_TABLES,
  d1EventRepository,
} from "../../ops/site/src/events/server/adapters/d1-events.js";
import { putEventOnWebsite } from "../../ops/site/src/events/server/event-publish.js";
import {
  droppedNights,
  getEvent,
  liveNightsBehind,
  previewBehind,
} from "../../ops/site/src/events/server/event-store.js";
import { runWebsiteJob } from "../../ops/site/src/events/server/website-jobs.js";
import {
  MENU_D1_TABLES,
  d1MenuRepository,
} from "../../ops/site/src/menu/server/adapters/d1-menu.js";
import { DEV_SANITY_PROJECT_ID, REAL_SANITY_PROJECT_ID } from "../../shared/sanity-projects.js";
import { databaseForMigration } from "./d1-rehearsal.mjs";

const show = (value) => (value == null || value === "" ? "nothing" : JSON.stringify(value));

/** "name "A" → "B", order 3 → 2" for the fields of `fields` that differ from `before`. */
export function describeChange(before, fields) {
  return Object.entries(fields)
    .filter(([key, value]) => value !== undefined && JSON.stringify(before?.[key] ?? null) !== JSON.stringify(value ?? null))
    .map(([key, value]) => `${key} ${show(before?.[key])} → ${show(value)}`)
    .join(", ");
}

const label = (collection, record) =>
  `${collection} ${record?.id ?? "?"}${record?.name ? ` "${record.name}"` : record?.channel ? ` (${record.channel})` : ""}`;

/** A menu repository that logs each write: what was added, what changed from what, what went. */
export function loggingMenuRepository(repo, say) {
  async function write(changes) {
    const list = changes || [];
    const before = [];
    for (const change of list) {
      before.push(change.op === "create" ? null : await repo.get(change.collection, change.id));
    }
    const out = await repo.write(list);
    list.forEach((change, index) => {
      if (change.op === "create") say(`add ${label(change.collection, out[index])}`);
      else if (change.op === "remove") say(`remove ${label(change.collection, before[index])}`);
      else {
        const what = describeChange(before[index], change.fields);
        if (what) say(`change ${label(change.collection, before[index])}: ${what}`);
      }
    });
    return out;
  }
  return {
    ...repo,
    write,
    create: async (collection, fields) => (await write([{ op: "create", collection, fields }]))[0],
    update: async (collection, id, fields) => (await write([{ op: "update", collection, id, fields }]))[0],
    remove: async (collection, id) => {
      await write([{ op: "remove", collection, id }]);
    },
  };
}

/** An event repository that logs a series being added, changed or removed. */
export function loggingEventRepository(repo, say) {
  return {
    ...repo,
    async remove(id) {
      const before = await repo.get(id);
      await repo.remove(id);
      say(`remove ${label("events", before)}`);
    },
    async create(fields) {
      const record = await repo.create(fields);
      say(`add ${label("events", record)}`);
      return record;
    },
    async update(id, fields) {
      const before = await repo.get(id);
      const record = await repo.update(id, fields);
      const what = describeChange(before, fields);
      if (what) say(`change ${label("events", before)}: ${what}`);
      return record;
    },
  };
}

/**
 * The website shows the event as ops has it: its preview and the website are
 * in step, and no night dropped from its schedule is still there.
 */
export function eventInStepWithWebsite(event) {
  return !droppedNights(event).length && !previewBehind(event) && !liveNightsBehind(event);
}

/**
 * Put one event on the website now, the way ops' website job does after a
 * save (website-jobs.js: calendar entries, then the preview, then the
 * website), and with Update website for it (putEventOnWebsite) when the
 * setting website.auto_update is off: the owner asked for the change. Built
 * pages follow with the next automatic website update. Not for a dry run.
 * Throws, saying what to do, when it does not get there.
 * @returns {Promise<object>} the event, in step with the website
 */
export async function putEventOnWebsiteNow(env, id) {
  for (let step = 0; step < 80; step += 1) {
    const result = await runWebsiteJob(env, { eventId: id, retry: true });
    if (result.failed) throw new Error(`Event ${id} did not reach the website: ${result.failed}. Run again.`);
    if (result.done) break;
  }
  if (!eventInStepWithWebsite(await getEvent(env, id))) await putEventOnWebsite(env, id);
  const event = await getEvent(env, id);
  if (!eventInStepWithWebsite(event)) {
    throw new Error(
      `"${event.name}" (event ${id}) is saved in ops, but the website is not in step with it yet. Run again, or press Update website for it in ops.`,
    );
  }
  return event;
}

/**
 * @returns {Promise<{ env: object }>} the `env` to hand the menu's and the
 *   events' use cases (menu-store.js, event-store.js): its repositories say
 *   where the data lives. Use cases that reach the website get this
 *   environment's Sanity project, whatever the shell says. A dry run has no
 *   Google service account, so nothing it runs can change the calendar or
 *   Drive; Sanity has no copy to rehearse on, so a migration must not call a
 *   use case that writes there on a dry run.
 */
export async function opsDataForMigration({ env, d1, dryRun, log, processEnv = {} }) {
  const db = await databaseForMigration(d1("ops"), {
    env,
    role: "ops",
    tables: [...EVENT_D1_TABLES, ...MENU_D1_TABLES],
    dryRun,
    log,
  });
  const say = (line) => log(`${dryRun ? "would " : ""}${line}`);
  return {
    env: {
      ...processEnv,
      SITE_ENV: env,
      SANITY_PROJECT_ID: env === "production" ? REAL_SANITY_PROJECT_ID : DEV_SANITY_PROJECT_ID,
      ...(dryRun ? { GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON: "" } : {}),
      menuRepository: loggingMenuRepository(d1MenuRepository(db), say),
      eventRepository: loggingEventRepository(d1EventRepository(db), say),
    },
  };
}
