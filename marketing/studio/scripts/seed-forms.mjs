/**
 * Seed contact / artist forms into a Sanity dataset.
 *
 * Usage (from repo root):
 *   npm run studio:seed:forms:dev
 *   CONFIRM_PRODUCTION_SEED=1 npm run studio:seed:forms:production
 */
import { createClient } from "@sanity/client";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { portableTextKey } from "./lib/portable-text.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const dataset = process.env.SANITY_DATASET || "development";
const projectId = process.env.SANITY_PROJECT_ID || "pn5yjro6";
const token = process.env.SANITY_API_TOKEN;

if (dataset === "production" && process.env.CONFIRM_PRODUCTION_SEED !== "1") {
  console.error(
    "Refusing to seed production without CONFIRM_PRODUCTION_SEED=1",
  );
  process.exit(1);
}

if (!token) {
  console.error(
    "SANITY_API_TOKEN is required (Editor token with write access).",
  );
  process.exit(1);
}

const client = createClient({
  projectId,
  dataset,
  token,
  apiVersion: "2025-01-01",
  useCdn: false,
});

function option(label, value = label) {
  return {
    _type: "option",
    _key: portableTextKey(),
    label,
    value,
  };
}

function field(def) {
  const { options, ...rest } = def;
  return {
    _type: "formField",
    _key: portableTextKey(),
    ...rest,
    ...(options
      ? { options: options.map((item) =>
          typeof item === "string" ? option(item) : option(item.label, item.value),
        ) }
      : {}),
  };
}

const PLAY_AT_GWENDA = {
  _id: "form-play-at-gwenda",
  _type: "form",
  title: "Play at Gwenda",
  slug: { _type: "slug", current: "play-at-gwenda" },
  enabled: true,
  eyebrow: "",
  heading: "Play at Gwenda",
  intro:
    "Whether you DJ, play live, select, or bring a collective: we’d love to hear from you. Share a little about your music and how you’d like to be part of Gwenda.",
  seoDescription:
    "Apply to DJ, play live, or bring a night to Gwenda in Hackney Wick.",
  notifyEmail: "play@gwenda.co.uk",
  fromEmail: "play@gwenda.co.uk",
  replyToEmail: "play@gwenda.co.uk",
  requireEmailVerification: true,
  submitLabel: "Send",
  successTitle: "You're confirmed",
  successMessage:
    "Thanks for writing. We'll read this and be in touch if there's a fit.",
  verifyPendingTitle: "Check your email",
  verifyPendingMessage:
    "We sent a link to {email}. Open it to finish your application (valid for 48 hours).",
  fields: [
    field({
      key: "name",
      label: "Name",
      section: "About you",
      type: "text",
      required: true,
      placeholder: "Your name",
    }),
    field({
      key: "artistName",
      label: "Artist / DJ name",
      section: "About you",
      type: "text",
      required: true,
      placeholder: "Stage or project name",
    }),
    field({
      key: "email",
      label: "Email",
      section: "About you",
      type: "email",
      required: true,
      placeholder: "you@email.com",
    }),
    field({
      key: "phone",
      label: "Phone / WhatsApp",
      section: "About you",
      type: "tel",
      placeholder: "+44…",
    }),
    field({
      key: "instagram",
      label: "Instagram",
      section: "About you",
      type: "text",
      placeholder: "@handle or profile URL",
      helpText: "An @handle or a link to your profile / site.",
    }),
    field({
      key: "whatYouDo",
      label: "What do you do?",
      section: "Your music",
      type: "multiSelect",
      required: true,
      options: [
        "DJ",
        "Selector",
        "Live act",
        "Band",
        "Producer",
        "Collective",
        "Other",
      ],
    }),
    field({
      key: "musicStyle",
      label: "Music style",
      section: "Your music",
      type: "multiSelect",
      required: true,
      options: [
        "Disco",
        "Soul",
        "Jazz",
        "House",
        "Funk",
        "Afro",
        "Latin",
        "Reggae",
        "Broken Beat",
        "Other",
      ],
      helpText: "Pick what fits. Add detail in the short description if needed.",
    }),
    field({
      key: "musicLink",
      label: "Link to your music",
      section: "Your music",
      type: "url",
      placeholder: "SoundCloud, Mixcloud, YouTube, Spotify, Bandcamp…",
      helpText: "A mix, set, or project page helps us listen. Optional, but useful.",
    }),
    field({
      key: "whatAtGwenda",
      label: "What would you like to do at Gwenda?",
      section: "Playing here",
      type: "multiSelect",
      required: true,
      options: [
        "DJ set",
        "Live set",
        "Open decks",
        "Residency",
        "One-off event",
        "Curated night",
        "Bring my collective",
        "Other",
      ],
      helpText: "Pick what fits. Add detail in the short description if needed.",
    }),
    field({
      key: "basedWhere",
      label: "Where are you based?",
      section: "Playing here",
      type: "select",
      options: [
        "Hackney Wick",
        "Hackney",
        "East London",
        "London",
        "Other",
      ],
    }),
    field({
      key: "availability",
      label: "Which days are you available?",
      section: "Playing here",
      type: "text",
      placeholder: "e.g. Thursdays, weekends, flexible",
    }),
    field({
      key: "description",
      label: "Short description",
      section: "Tell us more",
      type: "textarea",
      required: true,
      placeholder: "Anything else we should know. Style, vibe, who you play with.",
      helpText: "A few sentences is enough.",
    }),
    field({
      key: "heardAbout",
      label: "How did you hear about Gwenda?",
      section: "Tell us more",
      type: "select",
      options: [
        "Friend / word of mouth",
        "Instagram",
        "Night out",
        "Walking by",
        "Press / listing",
        "Other",
      ],
    }),
  ],
};

const COLLABORATE = {
  _id: "form-collaborate",
  _type: "form",
  title: "Collaborate",
  slug: { _type: "slug", current: "collaborate" },
  enabled: true,
  eyebrow: "Work with us",
  heading: "Collaborate",
  intro:
    "Music, nights, press, partnerships. Tell us a little about what you'd like to do with Gwenda.",
  seoDescription:
    "Collaborate with Gwenda in Hackney Wick. Music, nights, press, and partnerships.",
  notifyEmail: "play@gwenda.co.uk",
  fromEmail: "play@gwenda.co.uk",
  replyToEmail: "play@gwenda.co.uk",
  requireEmailVerification: true,
  submitLabel: "Send",
  successTitle: "You're confirmed",
  successMessage:
    "Thanks for writing. We'll read this and be in touch if there's a fit.",
  verifyPendingTitle: "Check your email",
  verifyPendingMessage:
    "We sent a link to {email}. Open it to finish (valid for 48 hours).",
  fields: [
    field({
      key: "name",
      label: "Name",
      section: "About you",
      type: "text",
      required: true,
      placeholder: "Your name",
    }),
    field({
      key: "email",
      label: "Email",
      section: "About you",
      type: "email",
      required: true,
      placeholder: "you@email.com",
    }),
    field({
      key: "phone",
      label: "Phone / WhatsApp",
      section: "About you",
      type: "tel",
      placeholder: "+44…",
    }),
    field({
      key: "organisation",
      label: "Organisation / project",
      section: "About you",
      type: "text",
      placeholder: "Optional",
    }),
    field({
      key: "instagram",
      label: "Instagram or site",
      section: "About you",
      type: "text",
      placeholder: "@handle or URL",
    }),
    field({
      key: "interest",
      label: "What are you interested in?",
      section: "The idea",
      type: "multiSelect",
      required: true,
      options: [
        "Play music / DJ",
        "Host a night",
        "Residency",
        "Press / media",
        "Brand / partnership",
        "Private gathering",
        "Other",
      ],
      helpText: "Pick what fits. Add detail below.",
    }),
    field({
      key: "message",
      label: "Tell us more",
      section: "The idea",
      type: "textarea",
      required: true,
      placeholder: "What you have in mind, timing, and anything we should know.",
      helpText: "A few sentences is enough.",
    }),
    field({
      key: "heardAbout",
      label: "How did you hear about Gwenda?",
      section: "The idea",
      type: "select",
      options: [
        "Friend / word of mouth",
        "Instagram",
        "Night out",
        "Walking by",
        "Press / listing",
        "Other",
      ],
    }),
  ],
};

async function upsertForm(doc) {
  const existing = await client.fetch(
    `*[_type == "form" && slug.current == $slug][0]._id`,
    { slug: doc.slug.current },
  );
  const id = existing || doc._id;
  const { _id, ...body } = doc;
  await client.createOrReplace({ _id: id, ...body });
  console.log(`Upserted form ${doc.slug.current} → ${id}`);
}

async function main() {
  console.log(`Seeding forms into ${projectId}/${dataset}…`);
  await upsertForm(PLAY_AT_GWENDA);
  await upsertForm(COLLABORATE);
  console.log("Done.");
  console.log(`Studio path hint: ${resolve(__dirname, "..")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
