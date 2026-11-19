/**
 * A day's heading on What's on by date (#352): its name in full ("Thursday
 * 19 November") and, for the next two days, what it is to the visitor
 * (Tonight, Tomorrow). A day an event runs over keeps "Tonight" to its end.
 */
import { daysAway } from "./london-day.js";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "Thursday 19 November". */
export function dayName(dateIso) {
  const [year, month, day] = String(dateIso).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return `${WEEKDAYS[date.getUTCDay()]} ${day} ${MONTHS[month - 1]}`;
}

/** "Tonight", "Tomorrow", or "" for a day further off. */
export function dayLabel(dateIso, todayIso, endIso = dateIso) {
  const away = daysAway(dateIso, todayIso);
  if (away <= 0 && daysAway(endIso || dateIso, todayIso) >= 0) return "Tonight";
  if (away === 1) return "Tomorrow";
  return "";
}
