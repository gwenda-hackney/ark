/**
 * EventRepository in memory (#186): for tests, and the reference for what
 * every adapter must do (event-repository.contract.test.js).
 */
const EMPTY_EVENT = {
  name: "",
  artist: "",
  offer: "",
  pageUrl: "",
  shortDescription: "",
  description: "",
  operationsNotes: "",
  imageLinks: [],
  startsOn: "",
  time: "",
  startTime: "",
  endTime: "",
  nightSchedule: [],
  repeatEvery: 1,
  repeatUnit: "none",
  weekdays: [],
  monthDay: 0,
  endsOn: "",
  skippedDates: [],
  extraDates: [],
  slug: "",
  formerSlugs: [],
  deletedAt: "",
  takingApplications: false,
  replacesSeries: "",
  driveFolderId: "",
  mainImage: null,
  heroCrops: null,
  gallery: null,
};

const EMPTY_OVERRIDES = {
  name: "",
  artist: "",
  offer: "",
  pageUrl: "",
  description: "",
  shortDescription: "",
  time: "",
  startTime: "",
  endTime: "",
  nightSchedule: null,
  operationsNotes: "",
  imageLinks: [],
  image: null,
  heroCrops: null,
};

const copy = (value) => structuredClone(value);

function notFound() {
  const error = new Error("Event not found.");
  error.status = 404;
  return error;
}

export function memoryEventRepository() {
  const events = new Map();
  const nights = new Map();
  let nextId = 1;
  const newId = () => String(nextId++);
  const nightsFor = (eventId) =>
    [...nights.values()].filter((night) => night.eventId === String(eventId)).map(({ eventId: _e, ...night }) => copy(night));

  /** Empty values the way storage reads them back: [] for no schedule on a night is null. */
  const tidyOverrides = (overrides) => {
    const tidy = { ...EMPTY_OVERRIDES, ...overrides };
    if (Array.isArray(tidy.nightSchedule) && !tidy.nightSchedule.length) tidy.nightSchedule = null;
    return tidy;
  };

  const writeNight = (eventId, night) => {
    const id = night.id ? String(night.id) : newId();
    const previous = nights.get(id);
    const saved = {
      eventId: String(eventId),
      id,
      date: night.date,
      slug: night.slug || "",
      label: night.label || "",
      sanityId: night.sanityId || "",
      clickupTaskId: night.clickupTaskId || "",
      snapshots: copy(night.snapshots || {}),
      googleCalendarEventId: previous?.googleCalendarEventId || "",
      overrides: night.overrides === undefined ? previous?.overrides || { ...EMPTY_OVERRIDES } : tidyOverrides(copy(night.overrides)),
    };
    nights.set(id, saved);
    const { eventId: _e, ...out } = saved;
    return copy(out);
  };

  return {
    async listEvents() {
      return [...events.values()].map(copy);
    },
    async listEventsWithNights() {
      return [...events.values()].map((event) => ({ event: copy(event), nights: nightsFor(event.id) }));
    },
    async get(id) {
      const event = events.get(String(id));
      if (!event) throw notFound();
      return copy(event);
    },
    async nightsOf(eventId) {
      return nightsFor(eventId);
    },
    async getNight(id) {
      const night = nights.get(String(id));
      if (!night) return null;
      const { eventId: _e, ...out } = night;
      return copy(out);
    },
    async create(fields) {
      const id = newId();
      const event = { ...EMPTY_EVENT, ...copy(fields), id };
      events.set(id, event);
      return copy(event);
    },
    async update(id, fields) {
      const event = events.get(String(id));
      if (!event) throw notFound();
      const { slug, ...rest } = copy(fields);
      Object.assign(event, rest, slug ? { slug } : {});
      return copy(event);
    },
    async remove(id) {
      events.delete(String(id));
    },
    async saveNight(eventId, night) {
      return writeNight(eventId, night);
    },
    async saveNights(eventId, list) {
      for (const night of list) writeNight(eventId, night);
    },
    async removeNight(id) {
      nights.delete(String(id));
    },
    async saveNightSnapshots(updates) {
      for (const update of updates) {
        const night = nights.get(String(update.id));
        if (!night) continue;
        night.snapshots = copy(update.snapshots || {});
        if (update.clearCalendar) night.googleCalendarEventId = "";
      }
    },
    async setNightCalendarLinks(links) {
      for (const { id, value } of links) {
        const night = nights.get(String(id));
        if (night) night.googleCalendarEventId = value;
      }
    },
    async addGalleryPhoto(eventId, photo) {
      const event = events.get(String(eventId));
      if (!event) throw notFound();
      const gallery = event.gallery || [];
      if (!gallery.some((item) => item.asset === photo.asset)) event.gallery = [copy(photo), ...gallery];
      else event.gallery = gallery;
      return copy(event);
    },
    async removeGalleryPhoto(eventId, key) {
      const event = events.get(String(eventId));
      if (!event) throw notFound();
      event.gallery = (event.gallery || []).filter((item) => item.key !== key);
      return copy(event);
    },
    async capabilities() {
      return { formerSlugs: true, shortDescriptionOverride: true, calendarLinks: true };
    },
  };
}
