/**
 * Intra-night schedule (sets / activities), distinct from series recurrence.
 * Stored as JSON in Baserow "Night schedule".
 */

function text(value) {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  return String(value).trim();
}

function clockTime(value) {
  const raw = text(value);
  if (!raw) return "";
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return "";
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Normalize one entry; null if label is empty. */
export function normalizeNightScheduleEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  const label = text(entry.label ?? entry.name ?? entry.title);
  if (!label) return null;
  return {
    label,
    startTime: clockTime(entry.startTime ?? entry.start ?? ""),
    endTime: clockTime(entry.endTime ?? entry.end ?? ""),
  };
}

/** Parse Baserow JSON / array into a clean list. */
export function parseNightSchedule(raw) {
  if (!raw) return [];
  let list = raw;
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  return list.map(normalizeNightScheduleEntry).filter(Boolean);
}

export function serializeNightSchedule(value) {
  const list = parseNightSchedule(value);
  return list.length ? JSON.stringify(list) : "";
}

export function stableNightSchedule(value) {
  return parseNightSchedule(value);
}

/** Sanity array items need _key / _type for Studio and mutations. */
export function toSanityNightSchedule(value) {
  return parseNightSchedule(value).map((slot, index) => ({
    _type: "slot",
    _key: `slot-${index}-${slot.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || index}`,
    label: slot.label,
    startTime: slot.startTime,
    endTime: slot.endTime,
  }));
}
