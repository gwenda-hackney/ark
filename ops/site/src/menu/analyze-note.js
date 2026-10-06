export function parseStoredAnalyzeNote(raw) {
  if (raw == null) return null;
  let parsed = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return {
        summary: trimmed,
        concerns: [],
        questions: [],
        specKey: "",
      };
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const summary =
    typeof parsed.summary === "string" ? parsed.summary.trim() : "";
  const concerns = Array.isArray(parsed.concerns)
    ? parsed.concerns
        .filter((row) => typeof row === "string")
        .map((row) => row.trim())
        .filter(Boolean)
    : [];
  const questions = Array.isArray(parsed.questions)
    ? parsed.questions
        .filter((row) => typeof row === "string")
        .map((row) => row.trim())
        .filter(Boolean)
    : [];
  const specKey = typeof parsed.specKey === "string" ? parsed.specKey : "";
  if (!summary && !concerns.length && !questions.length) return null;
  return { summary, concerns, questions, specKey };
}

export function serializeAnalyzeNote(note) {
  const parsed = parseStoredAnalyzeNote(note);
  if (!parsed) return "";
  return JSON.stringify(parsed);
}
