/** Web addresses typed by editors: a supplier product page, an artist's website. */
const URL_LINE = /^https?:\/\/\S+$/i;

/** A full http(s) URL on one line, or "". */
export function parseProductUrl(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!URL_LINE.test(raw)) return "";
  return raw;
}

/** Accept a full URL or a bare host. Empty stays empty. */
export function normalizeWebsite(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const direct = parseProductUrl(raw);
  if (direct) return direct;
  if (/^https?:\/\//i.test(raw)) return "";
  return parseProductUrl(`https://${raw.replace(/^\/+/, "")}`);
}

