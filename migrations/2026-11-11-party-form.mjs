/**
 * The party enquiry form, "Book your party" (/contact/party): a Sanity form
 * document like Play at Gwenda's, so the website's form page, the submit
 * function, the emails and ops' Forms list all pick it up with no code of
 * their own.
 *
 * After the website deploy, since only the new code knows the date and number
 * field types. It only creates the form when there is none (by id, or by its
 * web address): once it exists the venue edits it in Studio and this leaves
 * it alone, so it is safe to run again. Supports --dry-run (with --only),
 * which reports and writes nothing.
 */
export const app = "web";
export const phase = "post";
export const about = "Party enquiry form: Book your party (/contact/party)";

export const FORM_ID = "form-party";
export const FORM_SLUG = "party";

/** Where enquiries go in production; every other site sends to forms.notify_email. */
const VENUE_MAIL = "hello@gwenda.co.uk";

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
    notifyEmail: VENUE_MAIL,
    fromEmail: VENUE_MAIL,
    replyToEmail: VENUE_MAIL,
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

export async function up({ sanity, log, dryRun = false }) {
  const content = sanity();
  const existing = await content.query(`*[_type == "form" && (_id in $ids || slug.current == $slug)]{ _id }`, {
    ids: [FORM_ID, `drafts.${FORM_ID}`],
    slug: FORM_SLUG,
  });
  if (existing?.length) {
    return log(`${content.project}: the party form is already there (${existing.map((doc) => doc._id).join(", ")})`);
  }
  const document = partyFormDocument();
  if (dryRun) {
    return log(`${content.project}: would create ${FORM_ID} (/contact/${FORM_SLUG}, ${document.fields.length} questions)`);
  }
  await content.mutate([{ createIfNotExists: document }]);
  log(`${content.project}: created ${FORM_ID} (/contact/${FORM_SLUG}, ${document.fields.length} questions)`);
}
