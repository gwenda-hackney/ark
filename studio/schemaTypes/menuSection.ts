import { defineField, defineType } from "sanity";
import { orderRankField, orderRankOrdering } from "@sanity/orderable-document-list";

export const menuSection = defineType({
  name: "menuSection",
  title: "Menu section",
  type: "document",
  orderings: [orderRankOrdering],
  fields: [
    orderRankField({ type: "menuSection" }),
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      description: "URL-safe id, e.g. cocktails, small-plates",
      options: { source: "title", maxLength: 96 },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "subtitle",
      title: "Subtitle",
      type: "string",
    }),
  ],
  preview: {
    select: { title: "title", subtitle: "subtitle" },
  },
});
