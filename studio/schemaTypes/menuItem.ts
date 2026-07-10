import { defineField, defineType } from "sanity";

export const menuItem = defineType({
  name: "menuItem",
  title: "Menu item",
  type: "document",
  fields: [
    defineField({
      name: "name",
      title: "Name",
      type: "string",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "name", maxLength: 96 },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "section",
      title: "Section",
      type: "reference",
      to: [{ type: "menuSection" }],
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "description",
      title: "Description",
      type: "text",
      rows: 2,
    }),
    defineField({
      name: "price",
      title: "Price",
      description: "Display price without £, e.g. 14",
      type: "string",
    }),
    defineField({
      name: "tags",
      title: "Tags",
      type: "array",
      of: [{ type: "string" }],
      options: { layout: "tags" },
    }),
    defineField({
      name: "available",
      title: "Available",
      type: "boolean",
      initialValue: true,
    }),
    defineField({
      name: "image",
      title: "Image",
      type: "image",
      options: { hotspot: true },
    }),
    defineField({
      name: "sortOrder",
      title: "Sort order within section",
      type: "number",
      initialValue: 0,
      validation: (rule) => rule.required().integer().min(0),
    }),
  ],
  preview: {
    select: {
      title: "name",
      subtitle: "section.title",
      media: "image",
    },
  },
  orderings: [
    {
      title: "Sort order",
      name: "sortOrderAsc",
      by: [{ field: "sortOrder", direction: "asc" }],
    },
  ],
});
