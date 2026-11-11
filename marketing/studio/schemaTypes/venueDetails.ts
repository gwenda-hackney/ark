import { defineArrayMember, defineField, defineType } from "sanity";

/**
 * Venue details (#240): written by ops (Settings → Venue details, and
 * Gallery), never here. The opening hours, the party facts the party page
 * shows, and the venue's own photos (#291) for home's photo strip and the top
 * of the Photos page. Times are London "HH:MM"; a close earlier than the
 * opening is after midnight. A party fact left blank in ops isn't in the
 * document at all, nor is a gallery with no photos.
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
    defineField({
      name: "parties",
      title: "Parties",
      type: "object",
      description:
        "Edited in ops: Settings → Venue details. The party page shows the ones filled in.",
      fields: [
        defineField({ name: "standing", title: "Standing", type: "number" }),
        defineField({ name: "seated", title: "Seated", type: "number" }),
        defineField({
          name: "included",
          title: "What's included",
          type: "text",
          description: "One thing a line.",
        }),
        defineField({
          name: "replyWithin",
          title: "We reply within",
          type: "string",
        }),
      ],
    }),
    defineField({
      name: "gallery",
      title: "Gallery",
      type: "array",
      readOnly: true,
      description:
        "The venue's own photos, in the order the website shows them. Edited in ops: Gallery. Event photos are on each event.",
      of: [
        defineArrayMember({
          type: "image",
          fields: [
            defineField({
              name: "alt",
              title: "What it shows",
              type: "string",
            }),
            defineField({
              name: "menu",
              title: "Menu board on home",
              type: "string",
              options: {
                list: [
                  { title: "Drinks", value: "drinks" },
                  { title: "Food", value: "food" },
                ],
              },
            }),
          ],
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
