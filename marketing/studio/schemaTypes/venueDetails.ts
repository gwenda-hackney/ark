import { defineArrayMember, defineField, defineType } from "sanity";

/**
 * Venue details (#240): written by ops (Settings → Venue details), never
 * here. Opening hours now; the party facts join it next. Times are London
 * "HH:MM"; a close earlier than the opening is after midnight.
 */
export const venueDetails = defineType({
  name: "venueDetails",
  title: "Venue details",
  type: "document",
  readOnly: true,
  fields: [
    defineField({
      name: "openingHours",
      title: "Opening hours",
      type: "array",
      description:
        "Edited in ops: Settings → Venue details. Saving there puts them on the website.",
      of: [
        defineArrayMember({
          type: "object",
          name: "openingDay",
          fields: [
            defineField({
              name: "day",
              title: "Day",
              type: "string",
              options: {
                list: [
                  { title: "Monday", value: "mon" },
                  { title: "Tuesday", value: "tue" },
                  { title: "Wednesday", value: "wed" },
                  { title: "Thursday", value: "thu" },
                  { title: "Friday", value: "fri" },
                  { title: "Saturday", value: "sat" },
                  { title: "Sunday", value: "sun" },
                ],
              },
            }),
            defineField({ name: "closed", title: "Closed", type: "boolean" }),
            defineField({ name: "opens", title: "Opens", type: "string" }),
            defineField({ name: "closes", title: "Closes", type: "string" }),
          ],
          preview: {
            select: {
              day: "day",
              closed: "closed",
              opens: "opens",
              closes: "closes",
            },
            prepare({ day, closed, opens, closes }) {
              return {
                title: String(day || "").toUpperCase(),
                subtitle: closed ? "Closed" : `${opens || "?"} – ${closes || "?"}`,
              };
            },
          },
        }),
      ],
    }),
  ],
  preview: {
    prepare() {
      return { title: "Venue details" };
    },
  },
});
