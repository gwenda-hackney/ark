/** Home "Featured artist" card text: their profile as a sentence, or the generic line. */
export function artistTeaser(profile, fallback = "") {
  const text = String(profile || "").trim();
  if (!text) return String(fallback || "");
  return /[.!?]$/.test(text) ? text : `${text}.`;
}
