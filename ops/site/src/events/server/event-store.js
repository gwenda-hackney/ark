/**
 * Ops events, the use cases: create, edit and delete series and their nights.
 * Rules live in event-model.js; storage only through the EventRepository
 * (event-repository.js), never tables or columns here (#186).
 */
import { itemSlug, namesClash } from "../../menu/item-key.js";
import { parseImageAssetId } from "../../../../../shared/sanity-image.js";
import { sanityProjectId, sanityUploadImage } from "../../platform/sanity.js";
import {
  dayBeforeIso,
  expandSeriesOccurrenceDates,
  normalizeExtraDates,
  normalizeSkippedDates,
  planOccurrenceMove,
  todayIso,
} from "../event-recurrence.js";
import {
  occurrenceSlug,
  resolveOccurrenceContent,
  seriesSlug,
  titleOverrideEchoesSeries,
  titleOverrideForSave,
} from "./event-content.js";
import {
  forgetCalendarOccurrences,
  noteCalendarWarning,
} from "./event-calendar-sync.js";
import {
  GALLERY_FOLDER_NAME,
  createEventDriveFolder,
  ensureNamedChildFolder,
  isOwnEventFolder,
  renameDriveFile,
  trashDriveFile,
  untrashDriveFile,
} from "../../platform/google-drive.js";
import { forgetGalleryStaged } from "./event-gallery.js";
import { parseNightSchedule } from "./night-schedule.js";
import { eventRepository } from "./event-repository.js";
import {
  buildEvent,
  buildNight,
  clockTime,
  eventFieldsFromInput,
  isoDate,
  keepsDroppedNight,
  linksFrom,
  nightForSave,
  occurrenceRank,
  slugChangePlan,
  text,
} from "./event-model.js";

export {
  dedupeOccurrences,
  droppedNights,
  keepsDroppedNight,
  normalizePageUrl,
  previewBehind,
  publishState,
  slugChangePlan,
} from "./event-model.js";

/** How ops shows images: from the Sanity project it writes to (#183). */
function buildOptions(env) {
  return { projectId: sanityProjectId(env) };
}

export async function hasShortDescriptionOverrideColumn(env) {
  return (await eventRepository(env).capabilities()).shortDescriptionOverride;
}

async function assertUniqueName(env, name, exceptId = "") {
  const events = await eventRepository(env).listEvents();
  const clash = events.find(
    (event) => String(event.id) !== String(exceptId) && namesClash(event.name, name),
  );
  if (clash) {
    const error = new Error("An event with that name already exists.");
    error.status = 409;
    throw error;
  }
  const slug = itemSlug(name);
  if (!slug) {
    const error = new Error(
      "Use letters or numbers in the name so it can be a link.",
    );
    error.status = 400;
    throw error;
  }
  return slug;
}

async function planSlugChange(env, current, value) {
  if (itemSlug(value) === current.slug) return null;
  const events = eventRepository(env);
  if (!(await events.capabilities()).formerSlugs) {
    const error = new Error(
      "Changing the web address is not set up yet: the events table needs its Former slugs column.",
    );
    error.status = 503;
    throw error;
  }
  return slugChangePlan(current, value, await events.listEvents());
}

/** One-off events that replace (or sit beside) this series follow its new address. */
async function repointReplacedSeries(env, { slug, previous, events }) {
  for (const event of events) {
    const value = event.replacesSeries;
    const next =
      value === previous ? slug : value === `keep:${previous}` ? `keep:${slug}` : "";
    if (next) await eventRepository(env).update(event.id, { replacesSeries: next });
  }
}

/** Events in ops; `withDeleted` adds those waiting to leave the website (#23). */
export async function listEvents(env, { withDeleted = false } = {}) {
  const options = buildOptions(env);
  return (await eventRepository(env).listEventsWithNights())
    .filter(({ event }) => event.name && (withDeleted || !event.deletedAt))
    .map(({ event, nights }) => buildEvent(event, nights, options))
    .sort(
      (a, b) =>
        (a.publish.nextDate || "9999").localeCompare(
          b.publish.nextDate || "9999",
        ) || a.name.localeCompare(b.name),
    );
}

export async function getEvent(env, id) {
  const events = eventRepository(env);
  const record = await events.get(id);
  return buildEvent(record, await events.nightsOf(id), buildOptions(env));
}

async function takenDriveFolderIds(env, exceptId = "") {
  return (await eventRepository(env).listEvents())
    .filter((event) => String(event.id) !== String(exceptId) && event.driveFolderId)
    .map((event) => event.driveFolderId);
}

/**
 * Ensure the event has a Drive folder of this environment's own; create one
 * if it has none, or if the row points at another environment's folder (see
 * isOwnEventFolder). A new folder starts with an empty gallery, so the staged
 * gallery is forgotten and copied again.
 */
export async function ensureEventDriveFolder(env, id) {
  const event = await getEvent(env, id);
  if (event.driveFolderId && (await isOwnEventFolder(env, event.driveFolderId))) return event;
  const folder = await createEventDriveFolder(env, event.name || "Event", {
    takenFolderIds: await takenDriveFolderIds(env, id),
  });
  await eventRepository(env).update(id, { driveFolderId: folder.id });
  if (event.driveFolderId) await forgetGalleryStaged(env, id);
  return getEvent(env, id);
}

/** Gallery folder under the series. The hero copy sits in the series folder. */
export async function ensureEventGalleryFolder(env, id) {
  const event = await ensureEventDriveFolder(env, id);
  const gallery = await ensureNamedChildFolder(
    env,
    event.driveFolderId,
    GALLERY_FOLDER_NAME,
  );
  return { event, gallery };
}

export async function createEvent(env, input) {
  const name = text(input?.name);
  const slug = await assertUniqueName(env, name);
  const driveFolder = await createEventDriveFolder(env, name, {
    takenFolderIds: await takenDriveFolderIds(env),
  });
  const fields = { ...eventFieldsFromInput(input || {}, { slug }), driveFolderId: driveFolder.id };
  let record;
  try {
    record = await eventRepository(env).create(fields);
  } catch (error) {
    if (!driveFolder.reused && driveFolder.id) {
      try {
        await trashDriveFile(env, driveFolder.id);
      } catch {
        /* keep the storage error */
      }
    }
    throw error;
  }
  return syncEventOccurrences(env, buildEvent(record, [], buildOptions(env)));
}

export async function updateEvent(env, id, input) {
  const current = await getEvent(env, id);
  const previousName = text(current.name);
  const merged = {
    name: input?.name !== undefined ? input.name : current.name,
    artist: input?.artist !== undefined ? input.artist : current.artist,
    offer: input?.offer !== undefined ? input.offer : current.offer,
    takingApplications:
      input?.takingApplications !== undefined
        ? input.takingApplications
        : current.takingApplications,
    pageUrl: input?.pageUrl !== undefined ? input.pageUrl : current.pageUrl,
    shortDescription:
      input?.shortDescription !== undefined
        ? input.shortDescription
        : current.shortDescription,
    description:
      input?.description !== undefined
        ? input.description
        : current.description,
    operationsNotes:
      input?.operationsNotes !== undefined
        ? input.operationsNotes
        : current.operationsNotes,
    imageLinks:
      input?.imageLinks !== undefined ? input.imageLinks : current.imageLinks,
    heroCrops:
      input?.heroCrops !== undefined ? input.heroCrops : current.heroCrops,
    nightSchedule:
      input?.nightSchedule !== undefined
        ? input.nightSchedule
        : current.nightSchedule,
    startsOn: input?.startsOn !== undefined ? input.startsOn : current.startsOn,
    time: input?.time !== undefined ? input.time : current.time,
    startTime:
      input?.startTime !== undefined ? input.startTime : current.startTime,
    endTime: input?.endTime !== undefined ? input.endTime : current.endTime,
    repeatEvery:
      input?.repeatEvery !== undefined
        ? input.repeatEvery
        : current.repeatEvery,
    repeatUnit:
      input?.repeatUnit !== undefined ? input.repeatUnit : current.repeatUnit,
    weekdays: input?.weekdays !== undefined ? input.weekdays : current.weekdays,
    monthDay: input?.monthDay !== undefined ? input.monthDay : current.monthDay,
    endsOn: input?.endsOn !== undefined ? input.endsOn : current.endsOn,
    skippedDates:
      input?.skippedDates !== undefined
        ? input.skippedDates
        : current.skippedDates,
  };
  if (input?.extraDates !== undefined) {
    merged.extraDates = input.extraDates;
  }
  if (input?.replacesSeries !== undefined) {
    merged.replacesSeries = input.replacesSeries;
  }
  if (input?.name !== undefined)
    await assertUniqueName(env, text(merged.name), id);
  const slugChange =
    input?.slug !== undefined
      ? await planSlugChange(env, current, input.slug)
      : null;
  const fields = eventFieldsFromInput(merged, {
    slug: slugChange?.slug || current.slug || seriesSlug(merged.name),
  });
  if (slugChange) fields.formerSlugs = slugChange.formerSlugs;
  const nextName = text(merged.name);
  const nameChanged =
    input?.name !== undefined &&
    previousName &&
    nextName &&
    previousName.toLowerCase() !== nextName.toLowerCase();
  if (nameChanged && current.driveFolderId) {
    await renameDriveFile(env, current.driveFolderId, nextName);
  }
  let record;
  try {
    record = await eventRepository(env).update(id, fields);
  } catch (error) {
    if (nameChanged && current.driveFolderId) {
      try {
        await renameDriveFile(env, current.driveFolderId, previousName);
      } catch {
        /* keep the storage error */
      }
    }
    throw error;
  }
  if (slugChange) await repointReplacedSeries(env, slugChange);
  let event = buildEvent(record, await eventRepository(env).nightsOf(id), buildOptions(env));
  if (nameChanged) {
    event = await clearSeriesTitleEchoes(env, event, previousName);
  }
  return syncEventOccurrences(env, event);
}

/** Drop night title overrides that only repeated the old series name. */
async function clearSeriesTitleEchoes(env, event, previousName) {
  let changed = false;
  for (const row of event.dates || []) {
    const overrideName = text(row.overrides?.name);
    if (!titleOverrideEchoesSeries(previousName, overrideName)) continue;
    await saveOccurrence(env, event.id, {
      ...row,
      label: `${event.name} · ${row.date}`,
      overrides: {
        ...row.overrides,
        name: "",
      },
    });
    changed = true;
  }
  return changed ? getEvent(env, event.id) : event;
}

export async function syncEventOccurrences(env, event) {
  const wanted = new Set(expandSeriesOccurrenceDates(event));
  const byDate = new Map();
  const extras = [];
  for (const row of event.dates || []) {
    const prev = byDate.get(row.date);
    if (!prev) {
      byDate.set(row.date, row);
      continue;
    }
    const keep =
      occurrenceRank(row) > occurrenceRank(prev) ||
      (occurrenceRank(row) === occurrenceRank(prev) &&
        Number(row.id) > Number(prev.id))
        ? row
        : prev;
    const drop = keep === row ? prev : row;
    byDate.set(row.date, keep);
    extras.push(drop);
  }
  for (const row of extras) {
    if (row?.id) await removeOccurrence(env, row.id);
  }
  const today = todayIso();
  for (const [date, row] of byDate) {
    if (wanted.has(date)) continue;
    if (keepsDroppedNight(row, today)) continue;
    if (row?.id) await removeOccurrence(env, row.id);
    byDate.delete(date);
  }
  for (const date of wanted) {
    if (byDate.has(date)) continue;
    await saveOccurrence(env, event.id, {
      date,
      slug: occurrenceSlug(event.slug, date),
      label: `${event.name} · ${date}`,
      overrides: {
        name: "",
        artist: "",
        offer: "",
        pageUrl: "",
        description: "",
        time: "",
        startTime: "",
        endTime: "",
        operationsNotes: "",
        imageLinks: [],
        image: null,
      },
    });
  }
  return getEvent(env, event.id);
}

/** Mark an event deleted (an ISO time), or restore it (""). */
export async function setEventDeletedAt(env, id, at) {
  await eventRepository(env).update(id, { deletedAt: at });
}

export async function deleteEvent(env, id) {
  const event = await getEvent(env, id);
  const dates = event.dates || [];
  const folderId = event.driveFolderId;
  if (folderId) await trashDriveFile(env, folderId);
  try {
    for (const row of dates) {
      if (row?.id) await removeOccurrence(env, row.id);
    }
    await eventRepository(env).remove(id);
  } catch (error) {
    if (folderId) {
      try {
        await untrashDriveFile(env, folderId);
      } catch {
        /* keep the storage error */
      }
    }
    throw error;
  }
  return { id: String(id), dates };
}

/**
 * Targets for a scoped occurrence delete. Same scopes as occurrence edit:
 * this, following, all (all upcoming from today).
 */
export function occurrenceDeleteTargets(event, date, scope = "this") {
  const normalized = isoDate(date);
  if (!normalized) {
    const error = new Error("Date is not valid.");
    error.status = 400;
    throw error;
  }
  const resolved = ["this", "following", "all"].includes(scope)
    ? scope
    : "this";
  const today = todayIso();
  if (
    String(event?.repeatUnit || "none").toLowerCase() === "none" ||
    resolved === "all"
  ) {
    if (
      resolved === "all" &&
      String(event?.repeatUnit || "none").toLowerCase() !== "none"
    ) {
      return {
        scope: "all",
        mode: "end",
        date: normalized,
        endsOn: dayBeforeIso(today),
        targets: (event.dates || []).filter((row) => row.date >= today),
      };
    }
    const dates = event.dates || [];
    // Open series: remove only the targeted night, even its last one (#151).
    if (
      String(event?.repeatUnit || "none").toLowerCase() === "none" &&
      resolved === "this" &&
      dates.some((item) => item.date === normalized)
    ) {
      const row = dates.find((item) => item.date === normalized);
      return {
        scope: "this",
        mode: "detach",
        date: normalized,
        endsOn: "",
        targets: row ? [row] : [],
      };
    }
    if (
      String(event?.repeatUnit || "none").toLowerCase() === "none" &&
      resolved === "following" &&
      dates.some((row) => row.date > normalized)
    ) {
      const targets = dates.filter((row) => row.date >= normalized);
      if (targets.length < dates.length) {
        return {
          scope: "following",
          mode: "detach",
          date: normalized,
          endsOn: "",
          targets,
        };
      }
    }
    return {
      scope: resolved === "all" ? "all" : "this",
      mode: "series",
      date: normalized,
      endsOn: "",
      targets: dates,
    };
  }
  if (resolved === "following") {
    return {
      scope: "following",
      mode: "end",
      date: normalized,
      endsOn: dayBeforeIso(normalized),
      targets: (event.dates || []).filter((row) => row.date >= normalized),
    };
  }
  const row = (event.dates || []).find((item) => item.date === normalized);
  return {
    scope: "this",
    mode: "skip",
    date: normalized,
    endsOn: "",
    targets: row ? [row] : [],
  };
}

/**
 * Delete nights by changing the schedule. `removeRow` and `removeEvent` say
 * what happens to a night's row and to an event left with no nights; the
 * delete endpoint keeps nights still on the website until Update website (#23).
 */
export async function deleteOccurrences(
  env,
  eventId,
  date,
  scope = "this",
  { removeRow = removeOccurrence, removeEvent = deleteEvent } = {},
) {
  const event = await getEvent(env, eventId);
  const plan = occurrenceDeleteTargets(event, date, scope);

  if (plan.mode === "series") {
    await removeEvent(env, eventId);
    return {
      deleted: true,
      event: null,
      scope: plan.scope,
      removed: plan.targets.length,
      targets: plan.targets,
    };
  }

  if (plan.mode === "detach") {
    let series = event;
    for (const row of plan.targets) {
      series = (await detachOccurrenceFromSeries(env, series, row, { removeRow, removeEvent })) || null;
      if (!series) {
        return {
          deleted: true,
          event: null,
          scope: plan.scope,
          removed: plan.targets.length,
          targets: plan.targets,
        };
      }
    }
    return {
      deleted: false,
      event: series,
      scope: plan.scope,
      removed: plan.targets.length,
      targets: plan.targets,
    };
  }

  if (plan.mode === "end") {
    const endsOn = plan.endsOn;
    if (!endsOn || (event.startsOn && endsOn < event.startsOn)) {
      await removeEvent(env, eventId);
      return {
        deleted: true,
        event: null,
        scope: plan.scope,
        removed: (event.dates || []).length,
        targets: event.dates || [],
      };
    }
    for (const row of plan.targets) {
      if (row?.id) await removeRow(env, row.id);
    }
    const updated = await updateEvent(env, eventId, { endsOn });
    return {
      deleted: false,
      event: updated,
      scope: plan.scope,
      removed: plan.targets.length,
      targets: plan.targets,
    };
  }

  // skip this night
  if (!expandSeriesOccurrenceDates(event).includes(plan.date)) {
    const error = new Error(
      "Choose an upcoming occurrence from this event schedule.",
    );
    error.status = 400;
    throw error;
  }
  for (const row of plan.targets) {
    if (row?.id) await removeRow(env, row.id);
  }
  const skippedDates = normalizeSkippedDates([
    ...(event.skippedDates || []),
    plan.date,
  ]);
  const updated = await updateEvent(env, eventId, { skippedDates });
  if (!expandSeriesOccurrenceDates(updated).length) {
    await removeEvent(env, eventId);
    return {
      deleted: true,
      event: null,
      scope: "this",
      removed: plan.targets.length || 1,
      targets: plan.targets,
    };
  }
  return {
    deleted: false,
    event: updated,
    scope: "this",
    removed: plan.targets.length || 1,
    targets: plan.targets,
  };
}

/** Upload a photo to Sanity; the asset is the image's only copy (#183). */
async function uploadEventPhoto(env, { bytes, filename, contentType }) {
  const asset = await sanityUploadImage(env, bytes, { filename, contentType });
  if (!parseImageAssetId(asset?._id)) {
    const error = new Error("The photo didn't upload to Sanity.");
    error.status = 502;
    throw error;
  }
  return asset._id;
}

/** The series main image: a new photo starts with no crop. */
async function writeMainImage(env, id, asset) {
  const events = eventRepository(env);
  await events.get(id);
  const record = await events.update(id, { mainImage: asset ? { asset } : null, heroCrops: null });
  return buildEvent(record, await events.nightsOf(id), buildOptions(env));
}

export async function setEventImage(env, id, upload) {
  return writeMainImage(env, id, await uploadEventPhoto(env, upload));
}

/** Takes the photo off the event. The Sanity asset stays: the live site may still show it. */
export async function clearEventImage(env, id) {
  return writeMainImage(env, id, "");
}

export async function saveOccurrence(env, eventId, occurrence) {
  const saved = await eventRepository(env).saveNight(eventId, nightForSave(occurrence));
  return buildNight(saved, buildOptions(env));
}

/** Save many nights at once: keeps a series save inside Cloudflare's call limit. */
export async function saveOccurrences(env, eventId, occurrences) {
  const list = (occurrences || []).filter(Boolean);
  if (!list.length) return;
  await eventRepository(env).saveNights(eventId, list.map(nightForSave));
}

/** Ensure a calendar night exists on the series, even outside the recurrence rule. */
export async function ensureOccurrence(env, eventId, date, overrides = {}) {
  const event = await getEvent(env, eventId);
  const normalized = isoDate(date);
  if (!normalized) {
    const error = new Error("Date is required.");
    error.status = 400;
    throw error;
  }
  const existing = event.dates.find((row) => row.date === normalized);
  if (existing) {
    if (!hasOccurrenceInput(overrides) && !overrides.image) {
      return { event, occurrence: existing, created: false };
    }
    // Update the night's own row (keeping its ids), not a second row for the date.
    const occurrence = await saveOccurrence(env, eventId, {
      ...existing,
      date: normalized,
      slug: occurrenceSlug(event.slug, normalized),
      label: `${titleOverrideForSave(event.name, overrides.name) || event.name} · ${normalized}`,
      overrides: {
        name: titleOverrideForSave(event.name, overrides.name),
        artist: text(overrides.artist),
        offer: text(overrides.offer),
        pageUrl: text(overrides.pageUrl),
        description: text(overrides.description),
        shortDescription: text(overrides.shortDescription),
        time: text(overrides.time),
        startTime: clockTime(overrides.startTime),
        endTime: clockTime(overrides.endTime),
        nightSchedule:
          overrides.nightSchedule == null
            ? null
            : parseNightSchedule(overrides.nightSchedule),
        operationsNotes: text(overrides.operationsNotes),
        imageLinks: linksFrom(overrides.imageLinks),
        image: overrides.image || existing.overrides?.image || null,
        heroCrops: existing.overrides?.heroCrops || null,
      },
    });
    return {
      event: await getEvent(env, eventId),
      occurrence,
      created: false,
    };
  }
  const wanted = expandSeriesOccurrenceDates(event);
  let series = event;
  if (!wanted.includes(normalized)) {
    const unit = String(event.repeatUnit || "none").toLowerCase();
    const openScheduled =
      (unit === "none" || unit === "") && !isoDate(event.startsOn);
    series = await updateEvent(
      env,
      eventId,
      openScheduled
        ? {
            startsOn: normalized,
            skippedDates: normalizeSkippedDates(event.skippedDates).filter(
              (item) => item !== normalized,
            ),
          }
        : {
            extraDates: normalizeExtraDates([
              ...(event.extraDates || []),
              normalized,
            ]),
            skippedDates: normalizeSkippedDates(event.skippedDates).filter(
              (item) => item !== normalized,
            ),
          },
    );
    const created = series.dates.find((row) => row.date === normalized);
    if (created && !hasOccurrenceInput(overrides) && !overrides.image) {
      return { event: series, occurrence: created, created: true };
    }
  }
  const occurrence = await saveOccurrence(env, eventId, {
    ...(series.dates.find((row) => row.date === normalized) || {}),
    date: normalized,
    slug: occurrenceSlug(series.slug, normalized),
    label: `${titleOverrideForSave(series.name, overrides.name) || series.name} · ${normalized}`,
    overrides: {
      name: titleOverrideForSave(series.name, overrides.name),
      artist: text(overrides.artist),
      offer: text(overrides.offer),
      pageUrl: text(overrides.pageUrl),
      description: text(overrides.description),
      shortDescription: text(overrides.shortDescription),
      time: text(overrides.time),
      startTime: clockTime(overrides.startTime),
      endTime: clockTime(overrides.endTime),
      nightSchedule:
        overrides.nightSchedule == null
          ? null
          : parseNightSchedule(overrides.nightSchedule),
      operationsNotes: text(overrides.operationsNotes),
      imageLinks: linksFrom(overrides.imageLinks),
      image: overrides.image || null,
    },
  });
  return {
    event: await getEvent(env, eventId),
    occurrence,
    created: true,
  };
}

/**
 * Move a night onto another series (Baserow Events row), keeping overrides.
 */
export async function assignOccurrenceToSeries(
  env,
  fromEventId,
  date,
  toEventId,
  input = {},
) {
  const fromId = String(fromEventId || "").trim();
  const toId = String(toEventId || "").trim();
  const fromDate = isoDate(date);
  if (!fromId || !toId || !fromDate) {
    const error = new Error("Series and date are required.");
    error.status = 400;
    throw error;
  }
  if (fromId === toId) {
    return updateOccurrenceContent(env, fromId, fromDate, {
      ...input,
      scope: "this",
    });
  }

  const fromEvent = await getEvent(env, fromId);
  const existing = fromEvent.dates.find((row) => row.date === fromDate);
  if (!existing) {
    const error = new Error("Occurrence not found.");
    error.status = 404;
    throw error;
  }

  const resolved = resolveOccurrenceContent(fromEvent, existing);
  const toDate = isoDate(input?.date) || fromDate;
  const overrides = {
    name: text(input?.name !== undefined ? input.name : resolved.name),
    artist: text(input?.artist !== undefined ? input.artist : resolved.artist),
    offer: text(input?.offer !== undefined ? input.offer : resolved.offer),
    pageUrl: text(input?.pageUrl !== undefined ? input.pageUrl : resolved.pageUrl),
    description: text(
      input?.description !== undefined
        ? input.description
        : resolved.description,
    ),
    shortDescription: text(
      input?.shortDescription !== undefined
        ? input.shortDescription
        : resolved.shortDescription,
    ),
    operationsNotes: text(
      input?.operationsNotes !== undefined
        ? input.operationsNotes
        : resolved.operationsNotes,
    ),
    imageLinks:
      input?.imageLinks !== undefined
        ? linksFrom(input.imageLinks)
        : resolved.imageLinks || [],
    time: text(input?.time !== undefined ? input.time : resolved.time),
    startTime: clockTime(
      input?.startTime !== undefined ? input.startTime : resolved.startTime,
    ),
    endTime: clockTime(
      input?.endTime !== undefined ? input.endTime : resolved.endTime,
    ),
    image: existing.overrides?.image || null,
  };

  const created = await ensureOccurrence(env, toId, toDate, overrides);
  await detachOccurrenceFromSeries(env, fromEvent, existing);

  let sourceDeleted = false;
  try {
    await getEvent(env, fromId);
  } catch (error) {
    if (error?.status === 404) sourceDeleted = true;
    else throw error;
  }

  return {
    event: created.event,
    occurrence: created.occurrence,
    assignedTo: toId,
    movedFrom: fromDate,
    movedTo: toDate,
    updated: 1,
    scope: "this",
    sourceDeleted,
  };
}

/** Drop one night from a series without using the public delete scopes. */
async function detachOccurrenceFromSeries(
  env,
  event,
  occurrence,
  { removeRow = removeOccurrence, removeEvent = deleteEvent } = {},
) {
  const date = occurrence.date;
  if (occurrence?.id) {
    await removeRow(env, occurrence.id);
  }
  const remaining = (event.dates || []).filter((row) => row.date !== date);
  const unit = String(event.repeatUnit || "none").toLowerCase();
  // An open series may have no nights, so it outlives its last one (#151).
  if (unit === "none" || unit === "") {
    return updateEvent(env, event.id, {
      startsOn: remaining[0]?.date || "",
      extraDates: remaining.slice(1).map((row) => row.date),
      skippedDates: normalizeSkippedDates(event.skippedDates).filter(
        (item) => item !== date,
      ),
    });
  }
  if (!remaining.length) {
    await removeEvent(env, event.id);
    return null;
  }
  const inRule = expandSeriesOccurrenceDates({
    ...event,
    skippedDates: [],
    extraDates: [],
  }).includes(date);
  return updateEvent(env, event.id, {
    skippedDates: inRule
      ? normalizeSkippedDates([...(event.skippedDates || []), date])
      : normalizeSkippedDates(event.skippedDates).filter(
          (item) => item !== date,
        ),
    extraDates: normalizeExtraDates(event.extraDates).filter(
      (item) => item !== date,
    ),
  });
}

function hasOccurrenceInput(overrides) {
  if (!overrides || typeof overrides !== "object") return false;
  if (Array.isArray(overrides.nightSchedule) && overrides.nightSchedule.length) return true;
  return [
    "name",
    "artist",
    "offer",
    "pageUrl",
    "description",
    "shortDescription",
    "time",
    "startTime",
    "endTime",
    "operationsNotes",
    "imageLinks",
  ].some((key) => overrides[key] !== undefined && overrides[key] !== "");
}

function requireOccurrenceDate(event, date) {
  const normalized = isoDate(date);
  if (!normalized) {
    const error = new Error(
      "Choose an upcoming occurrence from this event schedule.",
    );
    error.status = 400;
    throw error;
  }
  const allowed = new Set(expandSeriesOccurrenceDates(event));
  for (const row of event.dates || []) {
    if (row?.date) allowed.add(row.date);
  }
  if (!allowed.has(normalized)) {
    const error = new Error(
      "Choose an upcoming occurrence from this event schedule.",
    );
    error.status = 400;
    throw error;
  }
  return normalized;
}

async function occurrenceForDate(env, eventId, date) {
  const event = await getEvent(env, eventId);
  const normalized = requireOccurrenceDate(event, date);
  return {
    event,
    date: normalized,
    occurrence: event.dates.find((row) => row.date === normalized) || null,
  };
}

export async function updateOccurrenceContent(env, eventId, date, input) {
  const targetSeriesId = String(
    input?.seriesId || input?.targetEventId || "",
  ).trim();
  if (targetSeriesId && targetSeriesId !== String(eventId)) {
    return assignOccurrenceToSeries(env, eventId, date, targetSeriesId, input);
  }
  const {
    event,
    date: normalized,
    occurrence,
  } = await occurrenceForDate(env, eventId, date);
  if (!occurrence) {
    const error = new Error("Occurrence not found.");
    error.status = 404;
    throw error;
  }
  const scope = ["this", "following", "all"].includes(input?.scope)
    ? input.scope
    : "this";
  const nextDate = isoDate(input?.date) || normalized;
  if (nextDate !== normalized) {
    if (scope !== "this") {
      const error = new Error(
        "Moving a night only applies to this event, not following nights.",
      );
      error.status = 400;
      throw error;
    }
    return moveOccurrence(env, eventId, normalized, nextDate, input);
  }
  const today = todayIso();
  const targets = event.dates.filter((row) => {
    if (scope === "this") return row.date === normalized;
    if (scope === "following") return row.date >= normalized;
    return row.date >= today;
  });
  const current = resolveOccurrenceContent(event, occurrence);
  const startTime =
    input?.startTime !== undefined
      ? clockTime(input.startTime)
      : current.startTime;
  const endTime =
    input?.endTime !== undefined ? clockTime(input.endTime) : current.endTime;
  if (input?.startTime && !startTime) {
    const error = new Error("Start time must use 24-hour HH:mm.");
    error.status = 400;
    throw error;
  }
  if (input?.endTime && !endTime) {
    const error = new Error("End time must use 24-hour HH:mm.");
    error.status = 400;
    throw error;
  }
  const imageLinks =
    input?.imageLinks !== undefined
      ? linksFrom(input.imageLinks)
      : current.imageLinks;
  const invalid = imageLinks.find((link) => !/^https?:\/\/\S+$/i.test(link));
  if (invalid) {
    const error = new Error(
      `Image link must start with http:// or https://: ${invalid}`,
    );
    error.status = 400;
    throw error;
  }
  const overrides = {
    name: titleOverrideForSave(
      event.name,
      input?.name !== undefined ? text(input.name) : current.title,
    ),
    artist: input?.artist !== undefined ? text(input.artist) : current.artist,
    offer: input?.offer !== undefined ? text(input.offer) : current.offer,
    pageUrl: input?.pageUrl !== undefined ? text(input.pageUrl) : current.pageUrl,
    description:
      input?.description !== undefined
        ? text(input.description)
        : current.description,
    shortDescription:
      input?.shortDescription !== undefined
        ? text(input.shortDescription)
        : current.shortDescription,
    time: input?.time !== undefined ? text(input.time) : current.time,
    startTime,
    endTime,
    nightSchedule:
      input?.nightSchedule !== undefined
        ? parseNightSchedule(input.nightSchedule)
        : occurrence.overrides?.nightSchedule != null
          ? parseNightSchedule(occurrence.overrides.nightSchedule)
          : null,
    operationsNotes:
      input?.operationsNotes !== undefined
        ? text(input.operationsNotes)
        : current.operationsNotes,
    imageLinks,
    image: occurrence.overrides?.image || null,
    heroCrops:
      input?.heroCrops !== undefined
        ? input.heroCrops
        : occurrence.overrides?.heroCrops || null,
  };
  if (scope === "all" || scope === "following") {
    const baselineCutoff = scope === "all" ? today : normalized;
    for (const row of event.dates.filter(
      (item) => item.date < baselineCutoff,
    )) {
      const content = resolveOccurrenceContent(event, row);
      await saveOccurrence(env, eventId, {
        ...row,
        label: `${content.title || event.name} · ${row.date}`,
        overrides: {
          name: titleOverrideForSave(event.name, content.title),
          artist: content.artist,
          offer: content.offer,
          pageUrl: content.pageUrl,
          description: content.description,
          time: content.time,
          startTime: content.startTime,
          endTime: content.endTime,
          nightSchedule: row.overrides?.nightSchedule ?? null,
          operationsNotes: content.operationsNotes,
          imageLinks: content.imageLinks,
          // Keep a real per-night flyer only. Never bake the series main image
          // into Override image (that falsely creates "special guests").
          image: row.overrides?.image || null,
          heroCrops: row.overrides?.heroCrops || null,
        },
      });
    }
    await updateEvent(env, eventId, {
      name: overrides.name || event.name,
      artist: overrides.artist,
      offer: overrides.offer,
      pageUrl: overrides.pageUrl,
      description: overrides.description,
      time: overrides.time,
      startTime: overrides.startTime,
      endTime: overrides.endTime,
      nightSchedule: overrides.nightSchedule ?? event.nightSchedule,
      operationsNotes: overrides.operationsNotes,
      imageLinks: overrides.imageLinks,
    });
    let saved = occurrence;
    for (const row of targets) {
      saved = await saveOccurrence(env, eventId, {
        ...row,
        label: `${overrides.name || event.name} · ${row.date}`,
        overrides: {
          name: "",
          artist: "",
          offer: "",
          pageUrl: "",
          description: "",
          time: "",
          startTime: "",
          endTime: "",
          nightSchedule: null,
          operationsNotes: "",
          imageLinks: [],
          image: row.overrides?.image || null,
          heroCrops: row.overrides?.heroCrops || null,
        },
      });
    }
    return {
      event: await getEvent(env, eventId),
      occurrence: saved,
      updated: targets.length,
      scope,
    };
  }
  let saved = occurrence;
  for (const row of targets) {
    saved = await saveOccurrence(env, eventId, {
      ...row,
      label: `${overrides.name || event.name} · ${row.date}`,
      overrides: {
        ...row.overrides,
        ...overrides,
        image: row.overrides?.image || null,
      },
    });
  }
  return {
    event: await getEvent(env, eventId),
    occurrence: saved,
    updated: targets.length,
    scope,
  };
}

/** Move one night to another date without changing Starts on / Ends on. */
export async function moveOccurrence(
  env,
  eventId,
  fromDate,
  toDate,
  input = {},
) {
  const event = await getEvent(env, eventId);
  const from = requireOccurrenceDate(event, fromDate);
  const to = isoDate(toDate);
  if (!to) {
    const error = new Error("Date is not valid.");
    error.status = 400;
    throw error;
  }
  const plan = planOccurrenceMove(event, from, to);
  if (!plan.ok) {
    const error = new Error(plan.error || "Date is not valid.");
    error.status = 400;
    throw error;
  }
  const fromOccurrence = event.dates.find((row) => row.date === from) || null;
  if (!fromOccurrence) {
    const error = new Error("Occurrence not found.");
    error.status = 404;
    throw error;
  }
  const current = resolveOccurrenceContent(event, fromOccurrence);
  const startTime =
    input?.startTime !== undefined
      ? clockTime(input.startTime)
      : current.startTime;
  const endTime =
    input?.endTime !== undefined ? clockTime(input.endTime) : current.endTime;
  if (input?.startTime && !startTime) {
    const error = new Error("Start time must use 24-hour HH:mm.");
    error.status = 400;
    throw error;
  }
  if (input?.endTime && !endTime) {
    const error = new Error("End time must use 24-hour HH:mm.");
    error.status = 400;
    throw error;
  }
  const imageLinks =
    input?.imageLinks !== undefined
      ? linksFrom(input.imageLinks)
      : current.imageLinks;
  const overrides = {
    name: titleOverrideForSave(
      event.name,
      input?.name !== undefined ? text(input.name) : current.title,
    ),
    artist: input?.artist !== undefined ? text(input.artist) : current.artist,
    offer: input?.offer !== undefined ? text(input.offer) : current.offer,
    pageUrl: input?.pageUrl !== undefined ? text(input.pageUrl) : current.pageUrl,
    description:
      input?.description !== undefined
        ? text(input.description)
        : current.description,
    shortDescription:
      input?.shortDescription !== undefined
        ? text(input.shortDescription)
        : current.shortDescription,
    time: input?.time !== undefined ? text(input.time) : current.time,
    startTime,
    endTime,
    operationsNotes:
      input?.operationsNotes !== undefined
        ? text(input.operationsNotes)
        : current.operationsNotes,
    imageLinks,
    image: fromOccurrence.overrides?.image || null,
  };

  if (plan.unchanged) {
    return updateOccurrenceContent(env, eventId, from, {
      ...input,
      date: from,
      scope: "this",
    });
  }

  if (plan.oneOff) {
    await updateEvent(env, eventId, {
      startsOn: plan.startsOn,
      name: overrides.name || event.name,
      artist: overrides.artist,
      offer: overrides.offer,
      pageUrl: overrides.pageUrl,
      description: overrides.description,
      time: overrides.time,
      startTime: overrides.startTime,
      endTime: overrides.endTime,
      operationsNotes: overrides.operationsNotes,
      imageLinks: overrides.imageLinks,
    });
    const updated = await getEvent(env, eventId);
    const occurrence =
      updated.dates.find((row) => row.date === to) || updated.dates[0] || null;
    return {
      event: updated,
      occurrence,
      updated: 1,
      scope: "this",
      movedFrom: from,
      movedTo: to,
    };
  }

  const clash = event.dates.find(
    (row) => row.date === to && String(row.id) !== String(fromOccurrence.id),
  );
  await updateEvent(env, eventId, {
    skippedDates: plan.skippedDates,
    extraDates: plan.extraDates,
  });
  let series = await getEvent(env, eventId);
  let target = series.dates.find((row) => row.date === to) || clash || null;
  if (!target) {
    target = await saveOccurrence(env, eventId, {
      date: to,
      slug: occurrenceSlug(series.slug, to),
      label: `${overrides.name || series.name} · ${to}`,
      overrides: {
        ...overrides,
        image: overrides.image,
      },
    });
  } else {
    target = await saveOccurrence(env, eventId, {
      ...target,
      date: to,
      slug: occurrenceSlug(series.slug, to),
      label: `${overrides.name || series.name} · ${to}`,
      overrides: {
        ...target.overrides,
        ...overrides,
        image: overrides.image || target.overrides?.image || null,
      },
    });
  }
  // A night already on the website stays as a dropped night, so the website job
  // marks it removed and Update website takes it off (#57).
  const leftover = series.dates.find((row) => row.date === from);
  if (leftover?.id && !keepsDroppedNight(leftover)) {
    await removeOccurrence(env, leftover.id);
  }
  series = await getEvent(env, eventId);
  return {
    event: series,
    occurrence: series.dates.find((row) => row.date === to) || target,
    updated: 1,
    scope: "this",
    movedFrom: from,
    movedTo: to,
  };
}

export async function setOccurrenceImage(env, eventId, date, upload) {
  const {
    event,
    date: normalized,
    occurrence,
  } = await occurrenceForDate(env, eventId, date);
  const asset = await uploadEventPhoto(env, upload);
  const saved = await saveOccurrence(env, eventId, {
    ...(occurrence || {}),
    date: normalized,
    slug: occurrence?.slug || occurrenceSlug(event.slug, normalized),
    label: `${event.name} · ${normalized}`,
    overrides: {
      ...(occurrence?.overrides || {}),
      image: { asset },
      heroCrops: null,
    },
  });
  return { event: await getEvent(env, eventId), occurrence: saved };
}

export async function clearOccurrenceImage(env, eventId, date) {
  const {
    event,
    date: normalized,
    occurrence,
  } = await occurrenceForDate(env, eventId, date);
  if (!occurrence) {
    return { event, occurrence: null };
  }
  const saved = await saveOccurrence(env, eventId, {
    ...occurrence,
    date: normalized,
    label: `${event.name} · ${normalized}`,
    overrides: { ...occurrence.overrides, image: null, heroCrops: null },
  });
  return { event: await getEvent(env, eventId), occurrence: saved };
}

export async function removeOccurrence(env, id) {
  const events = eventRepository(env);
  let warnings = [];
  try {
    const night = await events.getNight(id);
    if (night) warnings = await forgetCalendarOccurrences(env, [night]);
  } catch (error) {
    warnings = [
      noteCalendarWarning(
        env,
        error?.message ||
          "Could not remove that night from Google Calendar.",
      ),
    ];
  }
  await events.removeNight(id);
  return warnings;
}

/** Save only the publish snapshots of many nights (and clear dropped nights' calendar links). */
export async function saveOccurrenceSnapshots(env, updates) {
  if (!updates?.length) return 0;
  await eventRepository(env).saveNightSnapshots(updates);
  return updates.length;
}
