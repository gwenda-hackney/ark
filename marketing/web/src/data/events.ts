import type { Event } from "../types/events";

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

function formatTicketTime(time: string | null | undefined): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(time ?? "").trim());
  if (!match) return "";
  let hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  if (hours > 23 || minutes > 59) return "";
  const period = hours >= 12 ? "pm" : "am";
  hours %= 12;
  if (hours === 0) hours = 12;
  if (minutes === 0) return `${hours}${period}`;
  return `${hours}:${String(minutes).padStart(2, "0")}${period}`;
}

/** Date and door times for invite cards and listings. */
export function formatEventWhen(
  isoDate: string,
  startTime?: string | null,
  endTime?: string | null,
): string {
  const datePart = formatEventDate(isoDate);
  const start = formatTicketTime(startTime);
  const end = formatTicketTime(endTime);
  if (datePart && start && end) return `${datePart}, ${start}–${end}`;
  if (datePart && start) return `${datePart}, ${start}`;
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
