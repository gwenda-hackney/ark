/**
 * Who Gwenda email comes from. Everything is sent through the Gmail API as one
 * Workspace mailbox (service account with domain-wide delegation, see
 * shared/gmail-send.js); these are the same in every environment, so they are
 * constants, not config.
 */

/** The mailbox the service account sends as. */
export const MAIL_SENDER = "notifications@gwenda.co.uk";

/** From for staff notifications and alerts. */
export const NOTIFICATIONS_FROM = `Gwenda <${MAIL_SENDER}>`;

/** From for automated event mail (form confirmations): a no-reply alias. */
export const EVENTS_FROM = "Gwenda Events <events@gwenda.co.uk>";
