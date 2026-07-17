import { defineField, defineType } from "sanity";

export const siteSettings = defineType({
  name: "siteSettings",
  title: "Site settings",
  type: "document",
  fields: [
    defineField({
      name: "bookingEnabled",
      title: "Show booking button",
      type: "boolean",
      description:
        "When on, the Book a table CTA appears on the site (after Publish and Deploy site).",
      initialValue: false,
    }),
  ],
  preview: {
    prepare() {
      return { title: "Site settings" };
    },
  },
});
