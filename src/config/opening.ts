/** Go-live date for the hero countdown — YYYY-MM-DD, set via PUBLIC_OPENING_DATE at build. */
const DEFAULT_OPENING_DATE = "2026-08-01";

export const openingDate =
  import.meta.env.PUBLIC_OPENING_DATE?.trim() || DEFAULT_OPENING_DATE;

export function openingTimestamp(): number {
  return new Date(`${openingDate}T00:00:00`).getTime();
}

/** e.g. "1 August" — derived from PUBLIC_OPENING_DATE when needed. */
export function openingDateLabel(): string {
  const [year, month, day] = openingDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}

/** e.g. "Opening 1 August 2026" — for promo copy and SEO snippets. */
export function openingPromoLine(): string {
  const year = new Date(openingDate).getFullYear();
  return `Opening ${openingDateLabel()} ${year}`;
}
