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

export function guestEmail(guest) {
  if (guest.channel !== "email" || !guest.contact?.trim()) return null;
  return guest.contact.trim();
}

export function normalizeInstagramHandle(raw) {
  if (!raw?.trim()) return null;
  let handle = raw.trim().replace(/^@/, "");
  handle = handle.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "");
  handle = handle.split("?")[0]?.replace(/\/$/, "") ?? "";
  return handle ? handle.toLowerCase() : null;
}

export function guestInstagramHandle(guest) {
  if (guest.channel !== "instagram" || !guest.contact?.trim()) return null;
  return normalizeInstagramHandle(guest.contact);
}

export function formatInviteContent(template, values) {
  return template
    .replaceAll("{name}", values.name || "there")
    .replaceAll("{link}", values.link)
    .replaceAll("{image}", values.image);
}

export const DEFAULT_EMAIL_BODY = `Hi {name},

We're hosting a private launch party to celebrate the opening of Gwenda, and we'd love you to come along. Free signature cocktail from 5 to 7pm, music, and friends.

When you get a sec, RSVP here: {link}

Schwartz Wharf, Hackney Wick.

Dan
`;

export const DEFAULT_INSTAGRAM_MESSAGE =
  "Hey {name}, we're hosting a private launch party for Gwenda's opening and we'd love you there. Free signature cocktail 5 to 7, music and friends. RSVP here: {link}";
