export const FORM_HONEYPOT_FIELD = "website";

export function isFormHoneypotTripped(body) {
  const value = body?.[FORM_HONEYPOT_FIELD];
  return typeof value === "string" && value.trim().length > 0;
}
