/** Shared field format rules for Play / contact forms (client + server). */

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

  return "";
}
