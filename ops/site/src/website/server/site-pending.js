/**
 * "Waiting for the website": changes in the data that the built site does not
 * show yet, and the automatic update that follows once edits go quiet.
 *
 * A build records a snapshot of what it was made from (shared/site-snapshot.js).
 * Pending = current data vs that snapshot. The deploy webhook's cron calls
 * autoUpdateTick every few minutes; when a site has pending changes and nobody
 * has changed anything for QUIET_MS, it starts one build. One automatic retry
 * after a failure, then it waits for someone to press "Update website now".
 *
 * The site also changes with the date alone: it shows a pop-up kitchen
 * until its last night, decided when it is built. So a pop-up whose last
 * night has passed since the build is pending too ("… pop-up kitchen ended"),
 * and the site is rebuilt the morning after, once: that build's snapshot
 * records the new day, so the pop-up is no longer pending.
 *
 * While a developer runs `npm run ops:dev`, hosted dev starts no build by
 * itself (local-ops.js, #300): the tick keeps tracking what is pending and
 * any build someone started, and holds the one it would start, saying why.
 */
import {
  SNAPSHOT_CONFIG_KEY,
  SNAPSHOT_DOCS_QUERY,
  parseSnapshot,
  pendingSignature,
  pendingSince,
} from "../../../../../shared/site-snapshot.js";
import { readState as readConfigState, writeState as writeConfigState } from "../../../../../shared/config.js";
import { listArtists } from "../../../../../shared/artists.js";
import { londonToday } from "../../../../../marketing/web/src/lib/london-day.js";
import { popupLastNights } from "../../events/server/popups.js";
import { createLogger } from "../../platform/log.js";
import { PREVIEW, sanityQuery } from "../../platform/sanity.js";
import { describePause, localOpsPause } from "./local-ops.js";
import {
  dispatchProductionDeploy,
  dispatchPreviewDeploy,
  fetchDeployStatus,
} from "./site-deploy.js";

export const SITES = ["production", "preview"];
export const QUIET_MS = 10 * 60 * 1000;
const STATE_KEY = "site.auto_update";
const MAX_AUTO_FAILURES = 2;

/**
 * Documents a tick fingerprints at most, per site. Fingerprinting is the CPU
 * an ops request spends (the free plan allows 10 ms); fingerprints are kept by
 * revision in the state, so after the first ticks only new revisions cost.
 */
export const TICK_FINGERPRINT_BUDGET = 30;

/** How each site reads Sanity: "preview" is the preview site. */
const VIEWS = { production: "production", preview: PREVIEW };

function emptyState() {
  return {
    signature: "",
    changedAt: null,
    runId: null,
    runUrl: "",
    startedAt: null,
    failures: 0,
    failedAt: null,
    lastError: "",
    // { documentId: [rev, fingerprint] }: see pendingSince.
    fingerprints: {},
    // Why the last tick started nothing by itself (local-ops.js), or null.
    paused: null,
  };
}

export function parseState(text) {
  try {
    return { ...emptyState(), ...(text ? JSON.parse(text) : {}) };
  } catch {
    return emptyState();
  }
}

export async function readState(env, site, { read = readConfigState } = {}) {
  return parseState(await read(env, "ops", STATE_KEY, site).catch(() => ""));
}

export async function writeState(env, site, state, { write = writeConfigState } = {}) {
  await write(env, "ops", STATE_KEY, site, JSON.stringify(state));
}

/**
 * Pop-up kitchens the built site still shows but that are over: the last
 * night was on or after the day it was built, and before today (London days,
 * as the website decides). Pending items, so they show on the Website page.
 */
export function popupsEndedSince(builtAt, popups, today) {
  if (!builtAt || Number.isNaN(Date.parse(builtAt))) return [];
  const builtOn = londonToday(new Date(builtAt));
  return popups
    .filter((popup) => popup.lastNight >= builtOn && popup.lastNight < today)
    .map((popup) => ({
      kind: "popup",
      id: popup.id,
      change: "changed",
      label: `${popup.name}: pop-up kitchen ended`,
      type: "popup",
      name: popup.name,
      lastNight: popup.lastNight,
    }));
}

/** Current data vs the last build of one site. `now`: epoch ms, for pop-ups that have ended. */
export async function computePending(
  env,
  site,
  { query = sanityQuery, artists = listArtists, read = readConfigState, popups = popupLastNights } = {},
  { fingerprints = {}, budget = Infinity, now = Date.now() } = {},
) {
  const [snapshotText, docs, artistRows, popupRows] = await Promise.all([
    read(env, "web", SNAPSHOT_CONFIG_KEY, site).catch(() => ""),
    query(env, VIEWS[site], SNAPSHOT_DOCS_QUERY),
    artists(env).catch(() => []),
    // Without them the site is checked as before; the next tick tries again.
    popups(env).catch(() => []),
  ]);
  const pending = pendingSince(
    parseSnapshot(snapshotText),
    { docs: docs || [], artists: artistRows },
    { fingerprints, budget },
  );
  if (!pending.known) return pending;
  const ended = popupsEndedSince(pending.builtAt, popupRows, londonToday(new Date(now)));
  return ended.length ? { ...pending, items: [...pending.items, ...ended] } : pending;
}

/**
 * Advance one site's state and say what to do. Pure: no I/O, so the rules are
 * testable. `now` is epoch ms; `run` is the status of state.runId, if any.
 */
export function decide(state, pending, { now, run = null }) {
  const next = { ...state };
  const iso = new Date(now).toISOString();

  if (next.runId && run) {
    if (!run.completed) return { state: next, action: "wait-build" };
    if (run.conclusion === "success") {
      next.failures = 0;
      next.lastError = "";
    } else {
      next.failures += 1;
      next.failedAt = iso;
      next.lastError = run.conclusion || "failed";
    }
    next.runId = null;
    next.startedAt = null;
  }

  // Not every document fingerprinted yet: the list isn't known, so leave it be.
  if (pending.known && pending.complete === false) return { state: next, action: "checking" };
  const items = pending.known ? pending.items : [];
  const signature = items.length ? pendingSignature(items) : "";
  if (signature !== state.signature) {
    next.signature = signature;
    next.changedAt = signature ? iso : null;
  }

  if (!items.length) {
    next.failures = 0;
    next.lastError = "";
    return { state: next, action: "idle" };
  }
  if (next.failures >= MAX_AUTO_FAILURES) return { state: next, action: "needs-help" };
  const quietFor = now - Date.parse(next.changedAt || iso);
  const sinceFailure = next.failedAt ? now - Date.parse(next.failedAt) : Infinity;
  if (quietFor < QUIET_MS || sinceFailure < QUIET_MS) return { state: next, action: "wait-quiet" };
  return { state: next, action: "build" };
}

function dispatcherFor(site) {
  return site === "production" ? dispatchProductionDeploy : dispatchPreviewDeploy;
}

async function startBuild(env, site, state, now, dispatch) {
  const result = await dispatch(env);
  return {
    ...state,
    runId: result?.runId ?? null,
    runUrl: result?.runUrl || "",
    startedAt: new Date(now).toISOString(),
  };
}

/** Says in the log why a build started when a pop-up kitchen ending is part of it. */
function logPopupsEnded(log, site, items) {
  const ended = items.filter((item) => item.kind === "popup");
  if (!ended.length) return;
  const names = ended.map((item) => `${item.name} (last night ${item.lastNight})`).join(", ");
  log.info(`Rebuilding the ${site} website: a pop-up kitchen has ended: ${names}`, {
    site,
    popups: ended.map(({ id, name, lastNight }) => ({ id, name, lastNight })),
  });
}

/**
 * One scheduler pass over `sites` (both by default). `deps.log`: the
 * request's logger. While local ops is running (hosted dev only), a build it
 * would start is held: action "paused", and the site's state says why.
 */
export async function autoUpdateTick(env, deps = {}) {
  const now = deps.now ?? Date.now();
  const status = deps.status ?? fetchDeployStatus;
  const log = deps.log ?? createLogger();
  const pause = await localOpsPause(env, { read: deps.read, now });
  const results = {};
  for (const site of deps.sites ?? SITES) {
    const state = await readState(env, site, deps);
    const pending = await computePending(env, site, deps, {
      fingerprints: state.fingerprints,
      budget: deps.budget ?? TICK_FINGERPRINT_BUDGET,
      now,
    });
    const run = state.runId ? await status(env, state.runId).catch(() => null) : null;
    let { state: next, action } = decide(state, pending, { now, run });
    next = { ...next, paused: pause };
    if (action === "build" && pause) {
      action = "paused";
      log.info(`Not updating the ${site} website by itself: ${describePause(pause)}`, { site, paused: pause });
    } else if (action === "build") {
      try {
        next = await startBuild(env, site, next, now, (deps.dispatch ?? dispatcherFor)(site));
        logPopupsEnded(log, site, pending.items);
      } catch (error) {
        next = {
          ...next,
          failures: next.failures + 1,
          failedAt: new Date(now).toISOString(),
          lastError: error?.message || "Could not start the update.",
        };
        action = "dispatch-failed";
      }
    }
    if (pending.known) next = { ...next, fingerprints: pending.fingerprints };
    await writeState(env, site, next, deps);
    // While some documents aren't fingerprinted yet, the count isn't known.
    results[site] = {
      ...(pending.unresolved
        ? { action, pending: 0, unchecked: pending.unresolved }
        : { action, pending: pending.items.length }),
      ...(pause ? { paused: pause } : {}),
    };
  }
  return results;
}

/** "Update website now": start a build straight away and clear failures. */
export async function updateNow(env, site, deps = {}) {
  const now = deps.now ?? Date.now();
  const state = await readState(env, site, deps);
  let next = { ...state, failures: 0, failedAt: null, lastError: "" };
  next = await startBuild(env, site, next, now, (deps.dispatch ?? dispatcherFor)(site));
  await writeState(env, site, next, deps);
  return next;
}

/**
 * What the Website page and the menu badge show. `paused`: local ops is
 * running, so hosted dev updates nothing by itself (no autoUpdateAt then).
 */
export async function siteStatus(env, site, deps = {}) {
  // The tick keeps fingerprints by revision; reuse them, so a page load only
  // fingerprints documents changed since the last tick.
  const now = deps.now ?? Date.now();
  const [state, pause] = await Promise.all([
    readState(env, site, deps),
    localOpsPause(env, { read: deps.read, now }),
  ]);
  const pending = await computePending(env, site, deps, { fingerprints: state.fingerprints, now });
  const changedAt = state.changedAt ? Date.parse(state.changedAt) : null;
  return {
    site,
    known: pending.known,
    builtAt: pending.builtAt || null,
    items: pending.items,
    updating: Boolean(state.runId),
    runUrl: state.runUrl || "",
    failed: state.failures > 0,
    needsHelp: state.failures >= MAX_AUTO_FAILURES,
    lastError: state.lastError || "",
    paused: pause ? { since: pause.since, by: pause.by } : null,
    // Estimate only: the next cron tick after the quiet period.
    autoUpdateAt:
      pending.items.length && changedAt && !state.runId && !pause
        ? new Date(Math.max(changedAt + QUIET_MS, now)).toISOString()
        : null,
  };
}
