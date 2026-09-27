export function parseGbp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value * 100) / 100;
  }
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[£,\s]/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}
export function formatGbp(value: unknown): string {
  const n = parseGbp(value);
  if (n == null) return "";
  return `£${n.toFixed(2)}`;
}
