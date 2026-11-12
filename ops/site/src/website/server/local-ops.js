/**
 * Local ops pauses hosted dev's automatic website updates (#300).
 *
 * `npm run ops:dev` and the ops deployed on dev share dev's databases and
 * dev's Sanity. Left alone, hosted dev's scheduler (the deploy webhook's
 * cron calling /api/web/tick) re-sends whatever it thinks is out of date
 * with its own, older code, and undoes what local ops just did.
 *
 * So while it runs, local ops checks in every minute (scripts/ops-dev.mjs,
 * through scripts/lib/ops-dev-checkin.mjs): one machine-state row in dev's
 * config, LOCAL_OPS_KEY. On hosted dev, a check-in newer than
 * LOCAL_OPS_FRESH_MS pauses what the scheduler does by itself: the queue
 * that gets saved events ready for the website (events/server/website-jobs.js)
 * and site builds (site-pending.js). Whatever someone does by hand (a save,
 * Update website) still goes. A local ops that stops clears its check-in; one
 * that crashes stops checking in, so the pause lapses by itself.
 *
 * Production never reads it, and `npm run ops:prod` (--live) never writes it.
 */
import { environmentOf, isLocalMachine, readState, writeState } from "../../../../../shared/config.js";

/** The machine-state row: Service ops, Env dev (a developer's machine is dev). */
export const LOCAL_OPS_KEY = "site.local_ops";
const SERVICE = "ops";
const SCOPE = "dev";

/** How often local ops checks in. */
export const LOCAL_OPS_CHECK_IN_MS = 60_000;

/** A check-in older than this is a local ops that stopped or crashed: no pause. */
export const LOCAL_OPS_FRESH_MS = 3 * 60_000;

/**
 * @typedef {{ since: string, at: string, by: string, session: string }} CheckIn
 *   since: when that local ops started; at: its last check-in; by: the
 *   developer's email; session: one run of ops:dev, so it clears only its own.
 * @typedef {{ reason: "local-ops", since: string, by: string }} LocalOpsPause
 */

/** @returns {CheckIn | null} */
export function parseCheckIn(text) {
  try {
    const value = text ? JSON.parse(text) : null;
    if (!value || typeof value !== "object" || Number.isNaN(Date.parse(value.at))) return null;
    return {
      since: Number.isNaN(Date.parse(value.since)) ? value.at : value.since,
      at: value.at,
      by: String(value.by || ""),
      session: String(value.session || ""),
    };
  } catch {
    return null;
  }
}

/**
 * The pause a check-in makes at `now` (epoch ms), or null when it is stale.
 * A check-in from further ahead than the window (a wrong clock) doesn't
 * count either, so no clock can pause dev for long.
 * @param {CheckIn | null} checkIn
 * @returns {LocalOpsPause | null}
 */
export function pauseFrom(checkIn, now) {
  if (!checkIn) return null;
  const age = now - Date.parse(checkIn.at);
  if (Math.abs(age) > LOCAL_OPS_FRESH_MS) return null;
  return { reason: "local-ops", since: checkIn.since, by: checkIn.by };
}

/** Hosted dev only: production never pauses, and local ops isn't paused by itself. */
function pausesHere(env) {
  try {
    return environmentOf(env) === "dev" && !isLocalMachine(env);
  } catch {
    return false;
  }
}

/**
 * Whether hosted dev's automatic website updates wait right now, and why.
 * Null anywhere else, and when the check-in can't be read: then the
 * scheduler carries on as it always has.
 * @returns {Promise<LocalOpsPause | null>}
 */
export async function localOpsPause(env, { read = readState, now = Date.now() } = {}) {
  if (!pausesHere(env)) return null;
  const text = await Promise.resolve()
    .then(() => read(env, SERVICE, LOCAL_OPS_KEY, SCOPE))
    .catch(() => "");
  return pauseFrom(parseCheckIn(text), now);
}

/** One line for logs and the tick's answer. */
export function describePause(pause) {
  return `local ops is running (since ${pause.since}${pause.by ? `, ${pause.by}` : ""})`;
}

function assertDeveloperMachine(env) {
  if (!isLocalMachine(env)) {
    throw new Error("Only ops on a developer's machine (npm run ops:dev) checks in.");
  }
}

/**
 * Local ops' check-in: `since` (when it started) and `now`, epoch ms.
 * Writes dev's row, the environment a developer's machine belongs to.
 */
export async function checkIn(env, { session, since, by, now = Date.now() }, { write = writeState } = {}) {
  assertDeveloperMachine(env);
  const value = { since: new Date(since).toISOString(), at: new Date(now).toISOString(), by, session };
  await write(env, SERVICE, LOCAL_OPS_KEY, SCOPE, JSON.stringify(value));
}

/** Local ops stopping: clears the check-in if it is still this session's. */
export async function clearCheckIn(env, session, { read = readState, write = writeState } = {}) {
  assertDeveloperMachine(env);
  const current = parseCheckIn(await read(env, SERVICE, LOCAL_OPS_KEY, SCOPE));
  if (current?.session !== session) return;
  await write(env, SERVICE, LOCAL_OPS_KEY, SCOPE, "");
}
