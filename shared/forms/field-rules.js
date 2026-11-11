/**
 * Field format rules for the contact forms. The website's form script and the
 * submit function both use these, so a field is checked the same in the
 * browser and on the server.
 */

/** Loose shape check; tighter rules live in isValidEmail. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
export const URL_RE = /^https?:\/\/\S+$/i;

/**
 * Stricter email check for form submissions.
 * Rejects missing TLD, consecutive dots, leading/trailing dots, and overlong addresses.
 * @param {string} value
 * @returns {boolean}
 */
export function isValidEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!email || email.length > 254) return false;
  if (email.includes("..")) return false;
  if (!EMAIL_RE.test(email)) return false;

  const at = email.lastIndexOf("@");
  if (at < 1) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);

  if (!local || local.length > 64) return false;
  if (local.startsWith(".") || local.endsWith(".")) return false;
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local)) return false;

  if (!domain || domain.length > 253) return false;
  if (domain.startsWith("-") || domain.endsWith("-") || domain.startsWith(".")) {
    return false;
  }
  // Need a real hostname with a TLD label (e.g. example.com), not a@b.c alone of 1-char TLD is ok with {2,}
  const labels = domain.split(".");
  if (labels.length < 2) return false;
  if (labels.some((label) => !label || label.length > 63)) return false;
  if (labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label))) {
    return false;
  }
  const tld = labels[labels.length - 1];
  if (!/^[a-z]{2,24}$/i.test(tld)) return false;

  return true;
}

/**
 * @param {string} value
 * @returns {boolean}
 */
export function isValidUrl(value) {
  return URL_RE.test(String(value ?? "").trim());
}

/**
 * International-friendly phone: digits with optional +, spaces, dashes, brackets.
 * @param {string} value
 * @returns {boolean}
 */
export function isValidPhone(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return false;
  if (!/^[+()\d\s./-]+$/.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

/**
 * Instagram @handle / bare handle, or any http(s) profile / site link.
 * @param {string} value
 * @returns {boolean}
 */
export function isValidInstagramOrLink(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return false;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      return Boolean(url.hostname.includes("."));
    } catch {
      return false;
    }
  }

  // instagram.com/handle without scheme
  if (/^(www\.)?instagram\.com\/[A-Za-z0-9._]+\/?$/i.test(trimmed)) {
    return true;
  }

  const handle = trimmed.replace(/^@/, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(handle);
}

/** The furthest ahead a date field takes: two years, which keeps typos (2062) out. */
export const DATE_FIELD_MAX_DAYS = 730;
/** A number field is a whole number in this range (a head count, say). */
export const NUMBER_FIELD_MIN = 1;
export const NUMBER_FIELD_MAX = 1000;

/** Today at the bar (Europe/London), as YYYY-MM-DD. */
export function londonToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type) => parts.find((row) => row.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** A real calendar day written YYYY-MM-DD, as UTC milliseconds; else NaN. */
function isoDayTime(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return NaN;
  const [year, month, day] = match.slice(1).map(Number);
  const time = Date.UTC(year, month - 1, day);
  const date = new Date(time);
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? time
    : NaN;
}

/**
 * A date field's answer: a real day, today or later, within two years.
 * @param {string} value YYYY-MM-DD, as a date input sends it
 * @param {{ label?: string, today?: string }} [options] `today` is the bar's day
 * @returns {string} error message, or empty string if ok
 */
export function dateFieldError(value, { label = "This date", today = londonToday() } = {}) {
  const time = isoDayTime(value);
  if (Number.isNaN(time)) return `${label}: pick a date.`;
  const start = isoDayTime(today);
  if (time < start) return `${label}: that day has gone. Pick today or later.`;
  if (time > start + DATE_FIELD_MAX_DAYS * 86400000) {
    return `${label}: pick a date in the next two years.`;
  }
  return "";
}

/** "2026-12-12" as "Saturday 12 December 2026"; anything else unchanged. */
export function formatDateAnswer(value) {
  const time = isoDayTime(value);
  if (Number.isNaN(time)) return String(value ?? "").trim();
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
    .format(new Date(time))
    .replace(",", "");
}

/**
 * A number field's answer: a whole number from 1 to 1000.
 * @returns {string} error message, or empty string if ok
 */
export function numberFieldError(value, { label = "This" } = {}) {
  const raw = String(value ?? "").trim();
  const number = /^\d{1,6}$/.test(raw) ? Number(raw) : NaN;
  if (Number.isNaN(number) || number < NUMBER_FIELD_MIN || number > NUMBER_FIELD_MAX) {
    return `${label}: enter a whole number from ${NUMBER_FIELD_MIN} to ${NUMBER_FIELD_MAX}.`;
  }
  return "";
}

/**
 * @param {{ key?: string | null, type?: string | null, label?: string | null, value: string, today?: string }} field
 *   `today` (YYYY-MM-DD at the bar) is for date fields; now unless given
 * @returns {string} error message, or empty string if ok
 */
export function formatErrorForFieldValue(field) {
  const key = String(field.key ?? "").trim();
  const type = String(field.type ?? "").trim();
  const label = String(field.label ?? "This field").trim() || "This field";
  const value = String(field.value ?? "").trim();
  if (!value) return "";

  if (type === "email" || key === "email") {
    if (!isValidEmail(value)) {
      return "Enter a full email address (name@example.com).";
    }
  }

  if (type === "tel" || key === "phone") {
    if (!isValidPhone(value)) {
      return "Enter a valid phone number (with country code if you can).";
    }
  }

  if (key === "instagram") {
    if (!isValidInstagramOrLink(value)) {
      return "Enter an @handle or a link.";
    }
  }

  if (type === "url") {
    if (!isValidUrl(value)) {
      return `Enter a full link for ${label} (https://…).`;
    }
  }

  if (type === "date") {
    return dateFieldError(value, { label, today: field.today || londonToday() });
  }

  if (type === "number") {
    return numberFieldError(value, { label });
  }

  return "";
}
