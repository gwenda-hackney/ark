import type { Guest, InviteChannel } from "./types.js";

export function normalizeInstagramHandle(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  let handle = raw.trim().replace(/^@/, "");
  handle = handle.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "");
  handle = handle.split("?")[0]?.replace(/\/$/, "") ?? "";
  return handle ? handle.toLowerCase() : null;
}

export function parseInviteChannel(raw: string | null | undefined | unknown): InviteChannel | null {
  let text = "";
  if (typeof raw === "string") {
    text = raw;
  } else if (raw && typeof raw === "object" && "value" in raw) {
    const value = (raw as { value?: unknown }).value;
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

export function guestEmail(guest: Guest): string | null {
  if (guest.channel !== "email" || !guest.contact?.trim()) return null;
  return guest.contact.trim();
}

export function guestInstagramHandle(guest: Guest): string | null {
  if (guest.channel !== "instagram" || !guest.contact?.trim()) return null;
  return normalizeInstagramHandle(guest.contact);
}

export function resolveInstagramRecipientId(
  handle: string | null,
  conversationMap: Readonly<Record<string, string>>,
): string | null {
  if (!handle) return null;
  return conversationMap[handle] ?? null;
}

export function formatMessage(template: string, name: string): string {
  return template.replaceAll("{name}", name || "there");
}

export function formatInviteContent(
  template: string,
  values: { name: string; link: string; image: string },
): string {
  return template
    .replaceAll("{name}", values.name || "there")
    .replaceAll("{link}", values.link)
    .replaceAll("{image}", values.image);
}

export const DEFAULT_EMAIL_BODY = `Dear {name},

You are invited to a special evening at Gwenda.

Open your personal invitation: {link}

We would be delighted to welcome you to Schwartz Wharf, Hackney Wick.

With warm regards,
Dan
White Post Partners Ltd
`;

export const DEFAULT_INSTAGRAM_MESSAGE = `Hi {name}, you're invited to a private evening at Gwenda. Your personal invite: {link}`;
