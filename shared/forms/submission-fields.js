/**
 * Form Submissions columns (Website Baserow database) that the website writes
 * and ops reads when it resends an email.
 */

/** Datetime columns stamped after each real (non dry-run) send. */
export const FORM_EMAIL_SENT_FIELDS = {
  notify: "Notify Sent",
  receipt: "Receipt Sent",
};

/** The receipt's "change your application" link, saved when the row is stored. */
export const FORM_EDIT_LINK_FIELD = "Edit Link";
