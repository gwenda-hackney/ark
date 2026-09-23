import type { Event } from "../types/events";

export type EventSeries = Event & {
  dates: string[];
};

export type GuestEdition = Event & {
  weekLabel: "This week" | "Next week";
};

export type RegularEvent = Event & {
  guestEditions: GuestEdition[];
};

export type EventsPageModel = {
  regularEvents: RegularEvent[];
  datedEvents: Event[];
};

export function formatEventDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function eventDescriptionParagraphs(
  description: string,
  legacyTime?: string | null,
): string[] {
  const formatted = formatTimesInText(description);
  const paragraphs = formatted
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const sets =
    timeParts(legacyTime).length > 1 ? formatPublicTime(legacyTime) : "";
  if (sets && sets !== String(legacyTime || "").trim() && !formatted.includes(sets)) {
    paragraphs.push(sets);
  }
  return paragraphs;
}

export function formatEventRecurrence(recurrence: string): string {
  return recurrence.replace(/^every week on\s+/i, "Every ");
}

const DIARY_WEEKDAYS = ["Sun", "Mon", "Tues", "Wed", "Thur", "Fri", "Sat"];

const DIARY_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * The line above the title. The coming week is Tomorrow or Next Tues.
 * Later nights are "Tues 6 Oct", with the year only after 31 December.
 */
export function formatEventDiaryDate(isoDate: string, now = new Date()): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const eventDate = new Date(year, month - 1, day);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekday = DIARY_WEEKDAYS[eventDate.getDay()];
  const daysAway = Math.round((eventDate.getTime() - today.getTime()) / 86400000);

  if (daysAway === 0) return "Today";
  if (daysAway === 1) return "Tomorrow";
  if (daysAway > 1 && daysAway <= 7) return `Next ${weekday}`;

  const dated = `${weekday} ${day} ${DIARY_MONTHS[month - 1]}`;
  if (year !== today.getFullYear()) return `${dated} ${year}`;
  return dated;
}

export function eventWeekStart(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const daysSinceMonday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - daysSinceMonday);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function formatEventWeek(isoDate: string): string {
  const weekStart = eventWeekStart(isoDate);
  const [year, month, day] = weekStart.split("-").map(Number);
  return `Week beginning ${new Date(year, month - 1, day).toLocaleDateString(
    "en-GB",
    {
      day: "numeric",
      month: "long",
    },
  )}`;
}

function formatTicketTime(time: string | null | undefined): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(time ?? "").trim());
  if (!match) return "";
  const clock = parseClock(match[1], match[2]);
  return clock ? formatClock(clock) : "";
}

type Clock = { hours: number; minutes: number };

function parseClock(hoursText: string, minutesText: string): Clock | null {
  const hours = Number.parseInt(hoursText, 10);
  const minutes = Number.parseInt(minutesText, 10);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

function formatClock(clock: Clock): string {
  const period = clock.hours >= 12 ? "pm" : "am";
  let hours = clock.hours % 12;
  if (hours === 0) hours = 12;
  if (clock.minutes === 0) return `${hours}${period}`;
  return `${hours}:${String(clock.minutes).padStart(2, "0")}${period}`;
}

function formatClockRange(start: Clock, end: Clock): string {
  const samePeriod = start.hours >= 12 === end.hours >= 12;
  if (!samePeriod) return `${formatClock(start)}–${formatClock(end)}`;
  return `${formatClock(start).replace(/(am|pm)$/, "")}–${formatClock(end)}`;
}

function formatTimePart(part: string): string {
  const range =
    /^(\d{1,2})[:.](\d{2})\s*(?:[–—-]|to)\s*(\d{1,2})[:.](\d{2})$/i.exec(
      part.trim(),
    );
  if (range) {
    const start = parseClock(range[1], range[2]);
    const end = parseClock(range[3], range[4]);
    if (!start || !end) return "";
    return formatClockRange(start, end);
  }
  const single = /^(\d{1,2})[:.](\d{2})$/.exec(part.trim());
  if (!single) return "";
  const clock = parseClock(single[1], single[2]);
  return clock ? formatClock(clock) : "";
}

function joinTimes(parts: string[]): string {
  if (parts.length <= 1) return parts[0] || "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function timeParts(value: string | null | undefined): string[] {
  return String(value ?? "")
    .trim()
    .split(/\s*(?:\||\/|\band\b|\bthen\b|,)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Guest-facing sets. "19:00–20:30 | 21:00–22:30" becomes "7–8:30pm and 9–10:30pm". */
export function formatPublicTime(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const parts = timeParts(raw);
  const formatted = parts.map(formatTimePart);
  if (parts.length && formatted.every(Boolean)) return joinTimes(formatted);
  return raw;
}

/**
 * The line under the day. Start and end win. A single legacy public time is
 * used only when those are missing. A list of sets is not a start and end.
 */
export function formatEventSpan(
  start?: string | null,
  end?: string | null,
  legacy?: string | null,
): string {
  const startText = String(start || "").trim();
  const endText = String(end || "").trim();
  if (startText && endText) return formatPublicTime(`${startText}–${endText}`);
  if (startText) return formatPublicTime(startText);
  const raw = String(legacy || "").trim();
  if (!raw || timeParts(raw).length > 1) return "";
  return formatPublicTime(raw);
}

/** Rewrite clock ranges inside description copy. Leaves other sentences alone. */
export function formatTimesInText(text: string | null | undefined): string {
  return String(text ?? "").replace(
    /\d{1,2}[:.]\d{2}\s*(?:[–—-]|to)\s*\d{1,2}[:.]\d{2}(?:\s*(?:\||\/|,|\band\b|\bthen\b)\s*\d{1,2}[:.]\d{2}\s*(?:[–—-]|to)\s*\d{1,2}[:.]\d{2})*/gi,
    (match) => formatPublicTime(match),
  );
}

/** Date and door times for invite cards and listings. */
export function formatEventWhen(
  isoDate: string,
  startTime?: string | null,
  endTime?: string | null,
  time?: string | null,
): string {
  const datePart = formatEventDate(isoDate);
  const span = formatEventSpan(startTime, endTime, time);
  if (datePart && span) return `${datePart}, ${span}`;
  return datePart;
}

export function getUpcomingEvents(events: Event[], now = new Date()): Event[] {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  return events
    .filter((event) => {
      const [year, month, day] = event.date.split("-").map(Number);
      const eventDate = new Date(year, month - 1, day);
      return eventDate >= startOfToday;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

function isoFromDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return isoFromDate(date);
}

const WEEKDAY_NAMES = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

/** Monday is 0. Daily residencies come first. Anything without a weekday sorts last. */
export function eventWeekdayRank(recurrence: string | null | undefined): number {
  const text = String(recurrence || "").toLowerCase();
  if (/\bevery day\b/.test(text)) return -1;
  let rank = WEEKDAY_NAMES.length;
  for (let index = 0; index < WEEKDAY_NAMES.length; index += 1) {
    if (text.includes(WEEKDAY_NAMES[index])) rank = Math.min(rank, index);
  }
  return rank;
}

export function buildEventsPageModel(
  events: Event[],
  now = new Date(),
): EventsPageModel {
  const upcoming = getUpcomingEvents(events, now);
  const thisWeek = eventWeekStart(isoFromDate(now));
  const nextWeek = addDays(thisWeek, 7);
  const guestWindowEnd = addDays(thisWeek, 13);
  const groups = new Map<string, Event[]>();
  const datedEvents: Event[] = [];

  for (const event of upcoming) {
    if (!event.recurrence?.trim()) {
      datedEvents.push(event);
      continue;
    }
    const key = event.seriesId?.trim() || event.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)?.push(event);
  }

  const regularEvents = [...groups.entries()]
    .map(([seriesId, occurrences]) => {
      const ordered = occurrences.sort((a, b) => a.date.localeCompare(b.date));
      const baseline =
        ordered.find((event) => !event.isSpecialEdition) || ordered[0];
      const first = ordered[0];
      const guestEditions = ordered
        .filter(
          (event) =>
            event.isSpecialEdition &&
            event.date >= thisWeek &&
            event.date <= guestWindowEnd,
        )
        .map((event) => ({
          ...event,
          weekLabel:
            event.date < nextWeek
              ? ("This week" as const)
              : ("Next week" as const),
        }));
      return {
        ...baseline,
        date: first.date,
        seriesId,
        recurrence: first.recurrence,
        guestEditions,
      };
    })
    .sort((a, b) => {
      const byDay =
        eventWeekdayRank(a.recurrence) - eventWeekdayRank(b.recurrence);
      if (byDay) return byDay;
      return a.title.localeCompare(b.title);
    });

  datedEvents.sort(
    (a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title),
  );

  return { regularEvents, datedEvents };
}

export type EventsStackItem =
  | { regular: true; event: RegularEvent }
  | { regular: false; event: Event };

/** One diary: residencies and one-off nights, in date order. */
export function buildEventsStack(model: EventsPageModel): EventsStackItem[] {
  const items: EventsStackItem[] = [
    ...model.regularEvents.map((event) => ({ regular: true as const, event })),
    ...model.datedEvents.map((event) => ({ regular: false as const, event })),
  ];
  return items.sort(
    (a, b) =>
      a.event.date.localeCompare(b.event.date) ||
      a.event.title.localeCompare(b.event.title),
  );
}

/**
 * Website presentation groups generated occurrences back into their series.
 * The first upcoming occurrence supplies the card content and primary date.
 */
export function groupEventSeries(
  events: Event[],
  now = new Date(),
): EventSeries[] {
  const recurringCutoff = new Date(now);
  recurringCutoff.setMonth(recurringCutoff.getMonth() + 1);
  recurringCutoff.setHours(23, 59, 59, 999);

  const upcoming = getUpcomingEvents(events, now).filter((event) => {
    if (!event.recurrence?.trim()) return true;
    const [year, month, day] = event.date.split("-").map(Number);
    return new Date(year, month - 1, day) <= recurringCutoff;
  });
  const grouped = new Map<string, EventSeries>();

  for (const event of upcoming) {
    const key = event.seriesId?.trim() || event.id;
    const existing = grouped.get(key);
    if (existing) {
      if (!existing.dates.includes(event.date)) {
        existing.dates.push(event.date);
      }
      continue;
    }
    grouped.set(key, {
      ...event,
      seriesId: key,
      dates: [event.date],
    });
  }

  return [...grouped.values()]
    .map((series) => ({
      ...series,
      dates: series.dates.sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
