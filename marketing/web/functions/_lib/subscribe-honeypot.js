/** Honeypot field name — must match EmailSignup.astro `name` attribute. */
export const SUBSCRIBE_HONEYPOT_FIELD = "website";

export function isSubscribeHoneypotTripped(body) {
  const value = body?.[SUBSCRIBE_HONEYPOT_FIELD];
  return typeof value === "string" && value.trim().length > 0;
}
