/**
 * The Drive copy (#183): each event's photos, one way from Sanity into a
 * "website images" folder in the event's Drive folder, so collaborators can
 * use them for promotion. Ops never reads them back.
 *
 * Every copy carries a private Drive tag (appProperties.opsImage =
 * "<role>:<date>:<asset>"). The copy only touches tagged files: anything
 * people add by hand stays. A gallery photo that came from Drive (the
 * backfill) has its original moved in and tagged instead of a second copy.
 *
 * It runs as its own step of the scheduler's tick, a few files per run
 * (Cloudflare allows 50 outbound calls a request). Each event's copied set
 * is remembered as a signature (drive.mirrored), so unchanged events cost
 * nothing; failures go in drive.mirror_failures, never on the website job.
 */
import { environmentOf, readState, writeState } from "../../../../../shared/config.js";
import { parseImageAssetId, sanityImageUrl } from "../../../../../shared/sanity-image.js";
import {
  ensureNamedChildFolder,
  getDriveFile,
  isOwnEventFolder,
  listDriveChildren,
  moveDriveFile,
  trashDriveFile,
  uploadDriveFile,
} from "../../platform/google-drive.js";
import { sanityProjectId } from "../../platform/sanity.js";
import { listEvents } from "./event-store.js";

export const MIRROR_FOLDER_NAME = "website images";
const MIRRORED_KEY = "drive.mirrored";
const FAILURES_KEY = "drive.mirror_failures";
/** Outbound calls one run may use, leaving room under Cloudflare's 50. */
export const MIRROR_CALL_BUDGET = 40;
const TAG = "opsImage";

function extension(asset) {
  const ext = parseImageAssetId(asset)?.ext || "jpg";
  return ext === "jpeg" ? "jpg" : ext;
}

function safeName(value) {
  return String(value || "").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
}

/** The photos an event should have in Drive, each with its tag and file name. */
export function desiredImages(event) {
  const out = [];
  const name = safeName(event.name) || "Event";
  const add = (role, date, asset, fileName, adopt = "") => {
    if (!parseImageAssetId(asset)) return;
    const tag = `${role}:${date}:${asset}`;
    if (out.some((item) => item.tag === tag)) return;
    out.push({ tag, asset, name: `${fileName}.${extension(asset)}`, ...(adopt ? { adopt } : {}) });
  };
  add("hero", "", event.mainImage?.asset, `hero - ${name}`);
  for (const night of event.dates || []) {
    add("flyer", night.date, night.overrides?.image?.asset, `${night.date} flyer - ${name}`);
  }
  for (const photo of event.gallery || []) {
    const fromDrive = String(photo.source || "").startsWith("drive:") ? photo.source.slice(6) : "";
    add(
      "gallery",
      photo.date || "",
      photo.asset,
      `gallery ${photo.date ? `${photo.date} ` : ""}- ${photo.key}`,
      fromDrive,
    );
  }
  return out;
}

/** One string for the folder and set, so an unchanged event is skipped without asking Drive. */
export function mirrorSignature(event, desired) {
  return [event.driveFolderId, ...desired.map((item) => item.tag).sort()].join("|");
}

/** What to do in the folder: copy (or adopt) what's missing, bin tagged files no longer wanted. */
export function mirrorPlan(desired, existing) {
  const have = new Set(existing.map((file) => file.appProperties?.[TAG]).filter(Boolean));
  const want = new Set(desired.map((item) => item.tag));
  return {
    copy: desired.filter((item) => !have.has(item.tag)),
    trash: existing.filter((file) => file.appProperties?.[TAG] && !want.has(file.appProperties[TAG])),
  };
}

function parseState(text) {
  try {
    const parsed = text ? JSON.parse(text) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function readMap(env, key) {
  return parseState(await readState(env, "ops", key, environmentOf(env)).catch(() => ""));
}

async function writeMap(env, key, value) {
  await writeState(env, "ops", key, environmentOf(env), JSON.stringify(value));
}

/** Move a Drive original into the folder and tag it; false when it's gone. */
async function adopt(env, item, folderId) {
  try {
    const file = await getDriveFile(env, item.adopt);
    const from = Array.isArray(file?.parents) ? file.parents[0] : "";
    if (!from || file?.trashed) return false;
    await moveDriveFile(env, item.adopt, {
      addParentId: folderId,
      removeParentId: from,
      name: item.name,
      appProperties: { [TAG]: item.tag },
    });
    return true;
  } catch (error) {
    if (error?.status === 404) return false;
    throw error;
  }
}

async function copyFromSanity(env, item, folderId) {
  const response = await fetch(sanityImageUrl(sanityProjectId(env), item.asset));
  if (!response.ok) throw new Error(`Could not read ${item.name} from Sanity (${response.status}).`);
  await uploadDriveFile(env, {
    name: item.name,
    parentId: folderId,
    bytes: await response.arrayBuffer(),
    contentType: response.headers.get("content-type") || "image/jpeg",
    appProperties: { [TAG]: item.tag },
  });
}

/**
 * One run: bring as many events' Drive copies up to date as the budget allows.
 * Returns what it did, for the tick's log.
 */
export async function runDriveMirrorJob(env, { budget = MIRROR_CALL_BUDGET } = {}) {
  let calls = 6; // events, nights, state and the Drive token
  const [events, mirrored, failures] = await Promise.all([
    listEvents(env),
    readMap(env, MIRRORED_KEY),
    readMap(env, FAILURES_KEY),
  ]);
  const behind = events
    .filter((event) => event.driveFolderId)
    .map((event) => ({ event, desired: desiredImages(event) }))
    .filter(({ event, desired }) => mirrored[event.id] !== mirrorSignature(event, desired));
  const done = [];
  let copied = 0;
  let binned = 0;
  let changedState = false;

  for (const { event, desired } of behind) {
    if (calls + 4 > budget) break;
    try {
      calls += 2;
      // Another environment's folder (a copied row): nothing of ours goes there.
      // Its folder id is in the signature, so a new folder is copied again.
      if (!(await isOwnEventFolder(env, event.driveFolderId))) {
        mirrored[event.id] = mirrorSignature(event, desired);
        changedState = true;
        continue;
      }
      calls += 2;
      const folder = await ensureNamedChildFolder(env, event.driveFolderId, MIRROR_FOLDER_NAME);
      calls += 1;
      const plan = mirrorPlan(desired, await listDriveChildren(env, folder.id));
      let complete = true;
      for (const file of plan.trash) {
        if (calls + 1 > budget) {
          complete = false;
          break;
        }
        calls += 1;
        await trashDriveFile(env, file.id);
        binned += 1;
      }
      for (const item of plan.copy) {
        if (!complete || calls + 2 > budget) {
          complete = false;
          break;
        }
        calls += 2;
        if (!(item.adopt && (await adopt(env, item, folder.id)))) {
          if (item.adopt) calls += 2;
          await copyFromSanity(env, item, folder.id);
        }
        copied += 1;
      }
      if (!complete) break;
      mirrored[event.id] = mirrorSignature(event, desired);
      if (failures[event.id]) delete failures[event.id];
      changedState = true;
      done.push(event.id);
    } catch (error) {
      failures[event.id] = error?.message || "The Drive copy failed.";
      changedState = true;
    }
  }

  // Forget events that are gone.
  const ids = new Set(events.map((event) => String(event.id)));
  for (const id of Object.keys(mirrored)) {
    if (!ids.has(id)) {
      delete mirrored[id];
      changedState = true;
    }
  }
  if (changedState) {
    await writeMap(env, MIRRORED_KEY, mirrored);
    await writeMap(env, FAILURES_KEY, failures);
  }
  return { behind: behind.length, done, copied, binned, failed: Object.keys(failures) };
}
