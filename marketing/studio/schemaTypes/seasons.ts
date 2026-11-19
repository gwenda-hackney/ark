import { defineArrayMember, defineField, defineType } from "sanity";

/**
 * Seasons (#353): written by ops (What's on → Seasons), never here.
 * Something on sale for a while that leads to an enquiry, such as Christmas
 * parties: home shows each one between its show days, with an enquiry button
 * that opens the party form marked with its name.
 */
export const seasons = defineType({
  name: "seasons",
  title: "Seasons",
  type: "document",
  readOnly: true,
  fields: [
    defineField({
      name: "items",
      title: "Seasons",
      type: "array",
      description:
        "Edited in ops: What's on → Seasons. Saving there puts them on the website.",
      of: [
        defineArrayMember({
          type: "object",
          name: "season",
          fields: [
            defineField({ name: "name", title: "Name", type: "string" }),
            defineField({ name: "line", title: "Line", type: "text", rows: 2 }),
            defineField({
              name: "included",
              title: "What's included",
              type: "array",
              of: [{ type: "string" }],
            }),
            defineField({
              name: "covers",
              title: "When it's for",
              type: "string",
            }),
            defineField({
              name: "showFrom",
              title: "Shows from",
              type: "date",
            }),
            defineField({
              name: "showUntil",
              title: "Shows until",
              type: "date",
            }),
            defineField({
              name: "image",
              title: "Picture",
              type: "image",
              fields: [
                defineField({
                  name: "alt",
                  title: "Description",
                  type: "string",
                }),
              ],
            }),
          ],
          preview: {
            select: {
              title: "name",
              from: "showFrom",
              until: "showUntil",
              media: "image",
            },
            prepare: ({ title, from, until, media }) => ({
              title,
              subtitle: [from, until].filter(Boolean).join(" to "),
              media,
            }),
          },
        }),
      ],
    }),
  ],
});
