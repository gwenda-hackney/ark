/** Go-live date for the hero countdown — YYYY-MM-DD, set via PUBLIC_OPENING_DATE at build. */
const DEFAULT_OPENING_DATE = "2026-08-01";

export const openingDate =
  import.meta.env.PUBLIC_OPENING_DATE?.trim() || DEFAULT_OPENING_DATE;

export function openingTimestamp(): number {
  return new Date(`${openingDate}T00:00:00`).getTime();
}
