/** Tiny shared helpers for scripts (no Cloudflare Access). */

export function parseEmailList(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}
