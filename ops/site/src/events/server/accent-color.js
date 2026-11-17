/**
 * A pop-up kitchen's own colour (#319): "#0f4d32", lower case, or "" for
 * none. The rules only; the event model (event-model.js) checks it on the
 * way in and the adapters and publishing keep and send it.
 */

function fail(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

/** As kept: "0F4D32" and "#abc" are fine, "" is none; anything else is refused. */
export function checkedAccentColor(value) {
  const raw = String(value ?? "").trim().toLowerCase().replace(/^#/, "");
  if (!raw) return "";
  if (/^[0-9a-f]{3}$/.test(raw)) return `#${[...raw].map((c) => c + c).join("")}`;
  if (/^[0-9a-f]{6}$/.test(raw)) return `#${raw}`;
  return fail("Colour must be a hex value, like #0f4d32.");
}

/** As stored or sent: a clean colour, or "" (never refuses: it was checked on the way in). */
export function storedAccentColor(value) {
  try {
    return checkedAccentColor(value);
  } catch {
    return "";
  }
}
