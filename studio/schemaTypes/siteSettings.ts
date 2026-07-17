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
    defineField({
      name: "cocktailGalleryEnabled",
      title: "Show cocktail gallery images",
      type: "boolean",
      description:
        "When off, the homepage menu section stays visible with a coming soon message instead of cocktail photos (after Publish and Deploy site).",
      initialValue: true,
    }),
  ],
  preview: {
    prepare() {
      return { title: "Site settings" };
    },
  },
});
