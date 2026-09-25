export function parseInviteChannel(raw) {
  let text = "";
  if (typeof raw === "string") {
    text = raw;
  } else if (raw && typeof raw === "object" && "value" in raw) {
    const value = raw.value;
    text = typeof value === "string" ? value : String(value ?? "");
  } else if (raw != null) {
    text = String(raw);
  }

  if (!text.trim()) return null;
  const value = text.trim().toLowerCase();
  if (value === "email" || value === "e-mail") return "email";
  if (value === "instagram" || value === "ig" || value === "dm" || value === "insta") {
    return "instagram";
  }
  return null;
}

export function isValidEmail(raw) {
  const email = raw?.trim();
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
