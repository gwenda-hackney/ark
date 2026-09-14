export const RSVP_CODE_RE = /^[a-f0-9]{32}$/i;

export function isValidRsvpCode(code) {
  return typeof code === "string" && RSVP_CODE_RE.test(code.trim());
}

export function generateInviteToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
