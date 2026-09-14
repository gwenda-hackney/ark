/** Which outbound email flow is sending. */
export const SMTP_PURPOSE = {
  EVENTS: "events",
  INVITES: "invites",
};

const DEFAULT_FROM = {
  [SMTP_PURPOSE.EVENTS]: "Gwenda Events <events@gwenda.co.uk>",
};

/** No-reply headers for automated event confirmations. */
export const EVENTS_NO_REPLY_HEADERS = {
  "Auto-Submitted": "auto-generated",
  "X-Auto-Response-Suppress": "OOF, DR, RN, NRN, AutoReply",
};

/**
 * Resolve the From address for an email use case.
 * Events default to events@gwenda.co.uk (no-reply). Invites use SMTP_FROM.
 */
export function resolveSmtpFrom(env, purpose) {
  if (purpose === SMTP_PURPOSE.EVENTS) {
    return env.SMTP_FROM_EVENTS?.trim() || DEFAULT_FROM[SMTP_PURPOSE.EVENTS];
  }
  return env.SMTP_FROM?.trim() || "";
}
