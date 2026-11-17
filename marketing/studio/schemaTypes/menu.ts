import { defineArrayMember, defineField, defineType } from "sanity";
import {
  orderRankField,
  orderRankOrdering,
} from "@sanity/orderable-document-list";

/**
 * A menu guests see (#306): Drinks, or a pop-up kitchen's Dinner and Brunch.
 * Ops writes it when it updates the website; the website shows it between
 * its dates, on its days, and its chapters are the menu sections that refer
 * to it.
 */
export const menu = defineType({
  name: "menu",
  title: "Menu",
  type: "document",
  orderings: [orderRankOrdering],
  fields: [
    orderRankField({ type: "menu" }),
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
      description:
        "Its link on the website, e.g. /kitchen#chez-pickle-brunch. Set in ops.",
      options: { source: "name", maxLength: 96 },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "kind",
      title: "Drinks or food",
      type: "string",
      options: {
        list: [
          { title: "Drinks", value: "bar" },
          { title: "Food", value: "kitchen" },
        ],
        layout: "radio",
      },
      initialValue: "bar",
    }),
    defineField({
      name: "startsOn",
      title: "Starts",
      type: "date",
      description: "Empty: it has started.",
    }),
    defineField({
      name: "endsOn",
      title: "Ends",
      type: "date",
      description: "Empty: ongoing. It goes from the website the day after.",
    }),
    defineField({
      name: "days",
      title: "Days",
      type: "array",
      description: "The days it runs. Empty: every day.",
      of: [defineArrayMember({ type: "string" })],
      options: {
        list: [
          { title: "Mon", value: "mon" },
          { title: "Tue", value: "tue" },
          { title: "Wed", value: "wed" },
          { title: "Thu", value: "thu" },
          { title: "Fri", value: "fri" },
          { title: "Sat", value: "sat" },
          { title: "Sun", value: "sun" },
        ],
      },
    }),
    defineField({
      name: "popupSeries",
      title: "Pop-up kitchen",
      type: "reference",
      to: [{ type: "eventSeries" }],
      description: "The pop-up kitchen whose menu this is, if any. Set in ops.",
    }),
  ],
  preview: {
    select: { title: "name", kind: "kind" },
    prepare({ title, kind }) {
      return { title, subtitle: kind === "kitchen" ? "Food" : "Drinks" };
    },
  },
});
