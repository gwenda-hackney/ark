/** OpenTable reservations — shown from PUBLIC_BOOKING_ENABLED_FROM (YYYY-MM-DD) onwards. */
export const bookingUrl =
  "https://www.opentable.co.uk/r/gwenda-reservations-london?restref=508950&lang=en-GB&ot_source=Restaurant%20website";

export const bookingEnabledFrom =
  import.meta.env.PUBLIC_BOOKING_ENABLED_FROM?.trim() || "";

export function bookingEnabledFromTimestamp(): number | null {
  if (!bookingEnabledFrom) return null;
  return new Date(`${bookingEnabledFrom}T00:00:00`).getTime();
}

/** True when the env var is set and the go-live date has passed (build time). */
export function isBookingEnabled(): boolean {
  const from = bookingEnabledFromTimestamp();
  if (from === null) return false;
  return Date.now() >= from;
}

/** True when PUBLIC_BOOKING_ENABLED_FROM is set (including a future date). */
export function isBookingScheduled(): boolean {
  return bookingEnabledFrom !== "";
}
