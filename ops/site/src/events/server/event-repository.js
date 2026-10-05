/**
 * EventRepository (#186): the only way the events domain reads or writes
 * storage. It speaks in records (event-model.js), never in tables or columns.
 * Each adapter implements all of it, and event-repository.contract.test.js
 * holds every adapter to the same behaviour:
 *
 *   listEvents()                  EventRecord[]
 *   listEventsWithNights()        [{ event: EventRecord, nights: NightRecord[] }]
 *   get(id)                       EventRecord; a 404 "Event not found." when missing
 *   nightsOf(eventId)             NightRecord[]
 *   getNight(id)                  NightRecord, or null when missing
 *   create(fields)                EventRecord
 *   update(id, fields)            EventRecord; only the given fields change
 *   remove(id)
 *   saveNight(eventId, night)     NightRecord; creates it when it has no id.
 *                                 Without `overrides`, the night's overrides are kept.
 *   saveNights(eventId, nights)   many at once
 *   removeNight(id)               a missing night is fine
 *   saveNightSnapshots(updates)   [{ id, snapshots, clearCalendar? }]
 *   setNightCalendarLinks(links)  [{ id, value }]
 *   addGalleryPhoto(eventId, photo)    EventRecord; newest first, and a photo whose
 *                                      asset is already in the gallery isn't added again
 *   removeGalleryPhoto(eventId, key)   EventRecord
 *   capabilities()                { formerSlugs, shortDescriptionOverride, calendarLinks }:
 *                                 what this storage can keep yet (columns added by migration)
 *
 * Baserow is the adapter today; D1 comes with #127.
 */
import { baserowEventRepository } from "./adapters/baserow-events.js";

/** The repository for this runtime. Tests may hand one in as env.eventRepository. */
export function eventRepository(env) {
  return env?.eventRepository || baserowEventRepository(env);
}
