const SHORT = [
  "",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sept",
  "Oct",
  "Nov",
  "Dec",
];

const NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/** 1–12, or "" when the value is blank or not a month. */
export function monthIndex(value) {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!raw) return 0;
  const number = Number(raw);
  if (Number.isInteger(number) && number >= 1 && number <= 12) return number;
  const index = NAMES.findIndex(
    (name) => name.startsWith(raw) && raw.length >= 3,
  );
  return index >= 0 ? index + 1 : 0;
}

/** "Sept to Oct", or one month when the run does not cross. */
export function artistRunLabel(start, end) {
  const from = SHORT[monthIndex(start)] || "";
  const to = SHORT[monthIndex(end)] || "";
  if (from && to && from !== to) return `${from} to ${to}`;
  return from || to;
}
