import type { Event } from "../types/events";
import { openingDate } from "../config/opening";

/**
 * Single source of truth for events content.
 * Swap for a Baserow fetch when non-devs need to edit.
 */
export const events: Event[] = [
  {
    id: "grand-opening",
    title: "Grand Opening",
    date: openingDate,
    description: "Details to follow.",
  },
];

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

export function getUpcomingEvents(now = new Date()): Event[] {
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
