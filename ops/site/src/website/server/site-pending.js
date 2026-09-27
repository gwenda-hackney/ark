/**
 * "Waiting for the website": changes in the data that the built site does not
 * show yet, and the automatic update that follows once edits go quiet.
 *
 * A build records a snapshot of what it was made from (shared/site-snapshot.js).
 * Pending = current data vs that snapshot. The deploy webhook's cron calls
 * autoUpdateTick every few minutes; when a site has pending changes and nobody
 * has changed anything for QUIET_MS, it starts one build. One automatic retry
 * after a failure, then it waits for someone to press "Update website now".
 */
import {
  snapshotConfigKey,
  SNAPSHOT_DOCS_QUERY,
  parseSnapshot,
  pendingSignature,
  pendingSince,
} from "../../../../../shared/site-snapshot.js";
import { readState as readConfigState, writeState as writeConfigState } from "../../../../../shared/config.js";
import { listArtists } from "../../artists/server/artist-store.js";
import { PREVIEW, sanityQuery } from "../../platform/sanity.js";
import {
  buildEnvironment,
  dispatchProductionDeploy,
  dispatchPreviewDeploy,
  fetchDeployStatus,
} from "./site-deploy.js";

export const SITES = ["production", "preview"];
export const QUIET_MS = 10 * 60 * 1000;
const STATE_KEY = "site.auto_update";

/** Dev ops keeps its scheduler state apart from prod's. */
function stateKey(env) {
  return buildEnvironment(env) === "dev" ? `${STATE_KEY}.dev` : STATE_KEY;
}
const MAX_AUTO_FAILURES = 2;

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
  return parseState(await read(env, "ops", stateKey(env), site).catch(() => ""));
}

export async function writeState(env, site, state, { write = writeConfigState } = {}) {
  await write(env, "ops", stateKey(env), site, JSON.stringify(state));
}

/** Current data vs the last build of one site. */
export async function computePending(
  env,
  site,
  { query = sanityQuery, artists = listArtists, read = readConfigState } = {},
) {
  const [snapshotText, docs, artistRows] = await Promise.all([
    read(env, "web", snapshotConfigKey(buildEnvironment(env)), site).catch(() => ""),
    query(env, VIEWS[site], SNAPSHOT_DOCS_QUERY),
    artists(env).catch(() => []),
  ]);
  return pendingSince(parseSnapshot(snapshotText), { docs: docs || [], artists: artistRows });
}

/**
 * Advance one site's state and say what to do. Pure: no I/O, so the rules are
 * testable. `now` is epoch ms; `run` is the status of state.runId, if any.
 */
export function decide(state, pending, { now, run = null }) {
  const next = { ...state };
  const iso = new Date(now).toISOString();
  const items = pending.known ? pending.items : [];
  const signature = items.length ? pendingSignature(items) : "";
  if (signature !== state.signature) {
    next.signature = signature;
    next.changedAt = signature ? iso : null;
  }

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

/** One scheduler pass over both sites. */
export async function autoUpdateTick(env, deps = {}) {
  const now = deps.now ?? Date.now();
  const status = deps.status ?? fetchDeployStatus;
  const results = {};
  for (const site of SITES) {
    const state = await readState(env, site, deps);
    const pending = await computePending(env, site, deps);
    const run = state.runId ? await status(env, state.runId).catch(() => null) : null;
    let { state: next, action } = decide(state, pending, { now, run });
    if (action === "build") {
      try {
        next = await startBuild(env, site, next, now, (deps.dispatch ?? dispatcherFor)(site));
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
    await writeState(env, site, next, deps);
    results[site] = { action, pending: pending.items.length };
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

/** What the Website page and the menu badge show. */
export async function siteStatus(env, site, deps = {}) {
  const [pending, state] = await Promise.all([
    computePending(env, site, deps),
    readState(env, site, deps),
  ]);
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
    // Estimate only: the next cron tick after the quiet period.
    autoUpdateAt:
      pending.items.length && changedAt && !state.runId
        ? new Date(Math.max(changedAt + QUIET_MS, Date.now())).toISOString()
        : null,
  };
}
