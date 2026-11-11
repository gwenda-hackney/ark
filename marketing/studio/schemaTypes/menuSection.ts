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
      description: "URL-safe id, e.g. our-formulas, spritz",
      options: { source: "title", maxLength: 96 },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "subtitle",
      title: "Subtitle",
      type: "string",
    }),
    defineField({
      name: "kind",
      title: "Menu",
      type: "string",
      description: "Which menu the chapter belongs to. Subsections follow their parent.",
      options: {
        list: [
          { title: "Bar", value: "bar" },
          { title: "Kitchen", value: "kitchen" },
        ],
        layout: "radio",
      },
      initialValue: "bar",
      hidden: ({ document }) => Boolean(document?.parent),
    }),
    defineField({
      name: "popupSeries",
      title: "Pop-up kitchen",
      type: "reference",
      to: [{ type: "eventSeries" }],
      description:
        "The pop-up kitchen (an event series whose category is pop-up) whose chapter this is, if any. Set in ops. Subsections follow their parent.",
      hidden: ({ document }) => Boolean(document?.parent),
    }),
    defineField({
      name: "parent",
      title: "Parent chapter",
      type: "reference",
      to: [{ type: "menuSection" }],
      description:
        "Empty for main chapters (Our Formulas, Free of Spirit, By the Book, The Cabinet). Set for subsections (Spritz, Amaro…).",
      options: {
        filter: "!defined(parent)",
      },
    }),
  ],
  preview: {
    select: {
      title: "title",
      subtitle: "subtitle",
      parentTitle: "parent.title",
    },
    prepare({ title, subtitle, parentTitle }) {
      return {
        title,
        subtitle: parentTitle
          ? `Under ${parentTitle}${subtitle ? ` · ${subtitle}` : ""}`
          : subtitle || "Main chapter",
      };
    },
  },
});
