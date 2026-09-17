/** Shared field format rules for Play / contact forms (client + server). */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
export const URL_RE = /^https?:\/\/\S+$/i;

/**
 * @param {string} value
 * @returns {boolean}
 */
export function isValidEmail(value) {
  return EMAIL_RE.test(String(value ?? "").trim());
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

/**
 * @param {{ key?: string | null, type?: string | null, label?: string | null, value: string }} field
 * @returns {string} error message, or empty string if ok
 */
export function formatErrorForFieldValue(field) {
  const key = String(field.key ?? "").trim();
  const type = String(field.type ?? "").trim();
  const label = String(field.label ?? "This field").trim() || "This field";
  const value = String(field.value ?? "").trim();
  if (!value) return "";

  if (type === "email" || key === "email") {
    if (!isValidEmail(value)) return "Enter a valid email.";
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

  return "";
}
