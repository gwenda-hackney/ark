/**
 * The party enquiry form, "Book your party" (/contact/party): a Sanity form
 * document like Play at Gwenda's, so the website's form page, the submit
 * function, the emails and ops' Forms list all pick it up with no code of
 * their own.
 *
 * After the website deploy, since only the new code knows the date and number
 * field types. It only creates the form when there is none (by id, or by its
 * web address): once it exists the venue edits it in Studio and this leaves
 * it alone, so it is safe to run again.
 *
 * One exception, for forms made by this migration's earlier versions, which
 * sent party enquiries elsewhere (OLD_DEFAULTS): an address of form-party (or
 * its draft) that is still what an earlier version put there moves to where
 * party enquiries go now (ADDRESSES). An address the venue has since changed
 * stays as they set it, and a form the venue made themselves at
 * /contact/party is never touched.
 *
 * Supports --dry-run (with --only), which reports and writes nothing.
 */
export const app = "web";
export const phase = "post";
export const about = "Party enquiry form: Book your party (/contact/party)";

export const FORM_ID = "form-party";
export const FORM_SLUG = "party";

/**
 * The form's addresses. Enquiries go to, and replies to the receipt come
 * back to, bookings@, the venue's bookings group (in production; every other
 * site sends to forms.notify_email). The receipt is sent From the events
 * address, the one form mail falls back to (shared/forms/form-email.js):
 * notifications@ is already allowed to send as it (docs/email.md), which
 * nobody has set up for bookings@.
 */
export const ADDRESSES = {
  notifyEmail: "bookings@gwenda.co.uk",
  fromEmail: "events@gwenda.co.uk",
  replyToEmail: "bookings@gwenda.co.uk",
};

/**
 * What earlier versions of this migration put in the form, oldest first.
 * Only an address that is still one of these, in its own field, is replaced.
 */
export const OLD_DEFAULTS = [
  { notifyEmail: "hello@gwenda.co.uk", fromEmail: "hello@gwenda.co.uk", replyToEmail: "hello@gwenda.co.uk" },
  { notifyEmail: "enquiries@gwenda.co.uk", fromEmail: "events@gwenda.co.uk", replyToEmail: "enquiries@gwenda.co.uk" },
];

const YES_NO_MAYBE = ["Yes", "No", "Maybe"];

/**
 * The questions, in order. Keys are what submissions are stored under, so
 * they don't change once the form is live; `name`, `email`, `date` and
 * `people` are also what the notification's subject line reads.
 */
export const FIELDS = [
  { key: "name", label: "Name", section: "About you", type: "text", placeholder: "Your name", required: true },
  { key: "email", label: "Email", section: "About you", type: "email", placeholder: "you@email.com", required: true },
  { key: "phone", label: "Phone / WhatsApp", section: "About you", type: "tel", placeholder: "+44…" },
  {
    key: "occasion",
    label: "What’s the occasion?",
    section: "The party",
    type: "select",
    options: ["Birthday", "Leaving do", "Work do", { label: "Something else", value: "Other" }],
  },
  { key: "date", label: "Preferred date", section: "The party", type: "date", required: true },
  {
    key: "secondDate",
    label: "Second choice",
    section: "The party",
    type: "date",
    helpText: "In case the first one’s gone.",
  },
  { key: "startTime", label: "Rough start time", section: "The party", type: "text", placeholder: "e.g. 7pm" },
  {
    key: "people",
    label: "How many people",
    section: "The party",
    type: "number",
    placeholder: "e.g. 30",
    helpText: "A rough number is fine.",
    required: true,
  },
  {
    key: "food",
    label: "Want food?",
    section: "Food, drinks and music",
    type: "select",
    helpText: "The kitchen is a guest pop-up, so we’ll ask them.",
    options: YES_NO_MAYBE,
  },
  {
    key: "drinks",
    label: "Drinks package or a bar tab?",
    section: "Food, drinks and music",
    type: "select",
    options: YES_NO_MAYBE,
  },
  {
    key: "music",
    label: "Music",
    section: "Food, drinks and music",
    type: "select",
    options: ["Bringing a DJ or a playlist", "Want yours", "Don’t mind"],
  },
  {
    key: "budget",
    label: "Budget",
    section: "Anything else",
    type: "text",
    placeholder: "A rough figure helps",
  },
  {
    key: "message",
    label: "Tell us more",
    section: "Anything else",
    type: "textarea",
    placeholder: "What you’re planning, and anything we should know.",
  },
];

function option(choice, key) {
  const label = typeof choice === "string" ? choice : choice.label;
  const value = typeof choice === "string" ? choice : choice.value;
  return { _key: key, _type: "option", label, value };
}

/** The form as the Sanity document the website reads. */
export function partyFormDocument() {
  return {
    _id: FORM_ID,
    _type: "form",
    title: "Party enquiry",
    slug: { _type: "slug", current: FORM_SLUG },
    enabled: true,
    eyebrow: "",
    heading: "Book your party",
    intro:
      "Birthday, leaving do, work thing: tell us what you’re planning and we’ll come back to you.",
    seoDescription: "Having a party at Gwenda in Hackney Wick? Tell us the date and how many of you.",
    ...ADDRESSES,
    requireEmailVerification: false,
    submitLabel: "Send",
    successTitle: "Got it",
    successMessage: "Thanks. We’ll come back to you about your party. We’ve also sent a copy to your email.",
    fields: FIELDS.map((field) => ({
      _key: field.key,
      _type: "formField",
      key: field.key,
      label: field.label,
      section: field.section,
      type: field.type,
      required: field.required === true,
      ...(field.placeholder ? { placeholder: field.placeholder } : {}),
      ...(field.helpText ? { helpText: field.helpText } : {}),
      ...(field.options
        ? { options: field.options.map((choice, index) => option(choice, `${field.key}${index}`)) }
        : {}),
    })),
  };
}

/**
 * Move the addresses of form-party (and its draft) that are still an earlier
 * default to the new ones. Returns how many documents changed (or would).
 */
async function moveOldAddresses(content, forms, log, { dryRun }) {
  let moved = 0;
  for (const form of forms) {
    if (![FORM_ID, `drafts.${FORM_ID}`].includes(form._id)) continue;
    const set = Object.fromEntries(
      Object.entries(ADDRESSES).filter(
        ([field, address]) => form[field] !== address && OLD_DEFAULTS.some((old) => old[field] === form[field]),
      ),
    );
    const fields = Object.keys(set);
    if (!fields.length) continue;
    moved += 1;
    const what = fields.map((field) => `${field} ${form[field]} → ${set[field]}`).join(", ");
    if (dryRun) {
      log(`${content.project}: would change ${form._id}: ${what}`);
      continue;
    }
    await content.mutate([{ patch: { id: form._id, set } }]);
    log(`${content.project}: changed ${form._id}: ${what}`);
  }
  return moved;
}

export async function up({ sanity, log, dryRun = false }) {
  const content = sanity();
  const existing = await content.query(
    `*[_type == "form" && (_id in $ids || slug.current == $slug)]{ _id, notifyEmail, fromEmail, replyToEmail }`,
    { ids: [FORM_ID, `drafts.${FORM_ID}`], slug: FORM_SLUG },
  );
  if (existing?.length) {
    const moved = await moveOldAddresses(content, existing, log, { dryRun });
    if (moved) return;
    return log(`${content.project}: the party form is already there (${existing.map((doc) => doc._id).join(", ")})`);
  }
  const document = partyFormDocument();
  if (dryRun) {
    return log(`${content.project}: would create ${FORM_ID} (/contact/${FORM_SLUG}, ${document.fields.length} questions)`);
  }
  await content.mutate([{ createIfNotExists: document }]);
  log(`${content.project}: created ${FORM_ID} (/contact/${FORM_SLUG}, ${document.fields.length} questions)`);
}
