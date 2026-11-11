/** OpenTable reservations. Visibility is controlled in Sanity Site settings. */
export const bookingUrl =
  "https://www.opentable.co.uk/r/gwenda-reservations-london?restref=508950&lang=en-GB&ot_source=Restaurant%20website";

/** OpenTable offers tables on the half hour (7:00pm, 7:30pm). */
const SLOT_MINUTES = 30;
/** OpenTable's own starting time when it isn't given one. */
const DEFAULT_TIME = "19:00";

/** "19:45" → "19:30": rounded down, so the table is ready when it starts. */
function slotTime(time?: string | null): string {
  const match = /^(\d{1,2})[:.](\d{2})/.exec(String(time ?? "").trim());
  const hours = Number(match?.[1]);
  const minutes = Number(match?.[2]);
  if (!match || hours > 23 || minutes > 59) return DEFAULT_TIME;
  const slot = minutes - (minutes % SLOT_MINUTES);
  return `${String(hours).padStart(2, "0")}:${String(slot).padStart(2, "0")}`;
}

/**
 * Book a table for one night (#240): OpenTable's page for the bar opened on
 * that day and time (its `dateTime`), from the same link as bookingUrl, so
 * it still counts as booked through the website. `date` is the night's day
 * at the bar (YYYY-MM-DD) and `time` its start, London time (HH:MM). With
 * no date, the plain booking page.
 */
export function bookingUrlFor({
  date,
  time,
}: { date?: string | null; time?: string | null } = {}): string {
  const day = String(date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return bookingUrl;
  return `${bookingUrl}&dateTime=${day}T${slotTime(time)}`;
}
