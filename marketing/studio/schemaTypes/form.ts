import { defineArrayMember, defineField, defineType } from "sanity";

const DEFAULT_PLAY_MAIL = "play@gwenda.co.uk";

export const form = defineType({
  name: "form",
  title: "Form",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "Studio title",
      type: "string",
      description: "Internal name in Studio (e.g. Play at Gwenda).",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "title", maxLength: 96 },
      validation: (rule) => rule.required(),
      description: "Public URL: /forms/<slug>. Example: play-at-gwenda.",
    }),
    defineField({
      name: "enabled",
      title: "Published on site",
      type: "boolean",
      description:
        "When off, the page is not built and submissions are rejected (after Deploy site).",
      initialValue: true,
    }),
    defineField({
      name: "eyebrow",
      title: "Eyebrow",
      type: "string",
      description:
        'Small gold label above the heading. Leave blank if it would repeat the heading (e.g. logo + "Play at Gwenda" is enough).',
    }),
    defineField({
      name: "heading",
      title: "Heading",
      type: "string",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "intro",
      title: "Intro",
      type: "text",
      rows: 4,
      description: "Short lead under the heading.",
    }),
    defineField({
      name: "seoDescription",
      title: "SEO description",
      type: "text",
      rows: 2,
      description: "Meta description for search and link previews.",
    }),
    defineField({
      name: "notifyEmail",
      title: "Notify email",
      type: "string",
      initialValue: DEFAULT_PLAY_MAIL,
      description:
        "Where new submissions are sent (e.g. the play@ Google Group).",
      validation: (rule) =>
        rule.required().email().error("Enter a valid notification email."),
    }),
    defineField({
      name: "fromEmail",
      title: "From email",
      type: "string",
      initialValue: DEFAULT_PLAY_MAIL,
      description:
        "Outbound From address for staff notify and submitter confirmations.",
      validation: (rule) =>
        rule.required().email().error("Enter a valid From email."),
    }),
    defineField({
      name: "replyToEmail",
      title: "Reply-To email",
      type: "string",
      initialValue: DEFAULT_PLAY_MAIL,
      description:
        "Reply-To on outbound form mail. Defaults to From when blank.",
      validation: (rule) =>
        rule.email().error("Enter a valid Reply-To email."),
    }),
    defineField({
      name: "requireEmailVerification",
      title: "Require email verification",
      type: "boolean",
      initialValue: false,
      description:
        "When on, the submitter must confirm via a link before staff are notified. Needs an email field with key \"email\".",
    }),
    defineField({
      name: "submitLabel",
      title: "Submit button",
      type: "string",
      initialValue: "Send",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "successTitle",
      title: "Success title",
      type: "string",
      initialValue: "Got it",
      description: "Shown after submit when verification is off, or after they confirm the link.",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "successMessage",
      title: "Success message",
      type: "text",
      rows: 3,
      initialValue: "Thanks for writing. We'll be in touch.",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "verifyPendingTitle",
      title: "Verify pending title",
      type: "string",
      initialValue: "Check your email",
      hidden: ({ document }) => !document?.requireEmailVerification,
      description: "Shown right after submit while waiting for the confirm link.",
    }),
    defineField({
      name: "verifyPendingMessage",
      title: "Verify pending message",
      type: "text",
      rows: 3,
      initialValue:
        "We sent a link to {email}. Open it to finish (valid for 48 hours).",
      hidden: ({ document }) => !document?.requireEmailVerification,
      description: "Use {email} for the address they entered.",
    }),
    defineField({
      name: "fields",
      title: "Fields",
      type: "array",
      of: [defineArrayMember({ type: "formField" })],
      validation: (rule) =>
        rule
          .required()
          .min(1)
          .custom((fields) => {
            if (!Array.isArray(fields)) return true;
            const keys = fields
              .map((field) =>
                field && typeof field === "object" && "key" in field
                  ? String((field as { key?: string }).key ?? "")
                  : "",
              )
              .filter(Boolean);
            const unique = new Set(keys);
            if (unique.size !== keys.length) {
              return "Each field key must be unique.";
            }
            return true;
          }),
    }),
  ],
  preview: {
    select: {
      title: "title",
      subtitle: "slug.current",
      enabled: "enabled",
    },
    prepare({ title, subtitle, enabled }) {
      const status = enabled === false ? " · off" : "";
      return {
        title: title || "Form",
        subtitle: subtitle ? `/forms/${subtitle}${status}` : status.trim(),
      };
    },
  },
});
