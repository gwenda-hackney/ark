import { defineArrayMember, defineField, defineType } from "sanity";
import { eventDescription } from "./eventDescription";

export const event = defineType({
  name: "event",
  title: "Event",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "artist",
      title: "Artist",
      type: "string",
      description: "Shown on the public events list.",
    }),
    defineField({
      name: "offer",
      title: "Offer",
      type: "string",
      description: "Optional public wording, e.g. £10 Negroni.",
    }),
    defineField({
      name: "series",
      title: "Series",
      type: "reference",
      to: [{ type: "eventSeries" }],
      readOnly: true,
      description:
        "Parent series template. This document is one scheduled night.",
    }),
    defineField({
      name: "seriesId",
      title: "Series id",
      type: "string",
      readOnly: true,
      hidden: true,
      description: "Set by ops. Slug of the parent series.",
    }),
    defineField({
      name: "category",
      title: "What it is",
      type: "string",
      readOnly: true,
      description:
        "Set by ops, from the night's series. Left empty for a night; a promotion (a standing deal such as Happy Hour) or a pop-up kitchen otherwise. What's on shows nights only.",
      options: {
        list: [
          { title: "A promotion", value: "promotion" },
          { title: "A pop-up kitchen", value: "popup" },
        ],
      },
    }),
    defineField({
      name: "seriesTitle",
      title: "Series title",
      type: "string",
      readOnly: true,
      hidden: true,
      description:
        "Set by ops. Display name for the series on the public website.",
    }),
    defineField({
      name: "recurrence",
      title: "Repeats",
      type: "string",
      readOnly: true,
      description: "Set by ops, e.g. Every Thursday.",
    }),
    defineField({
      name: "isSpecialEdition",
      title: "Special edition",
      type: "boolean",
      readOnly: true,
      hidden: true,
      description:
        "Set by ops when this date has a special guest or custom content.",
    }),
    defineField({
      name: "removed",
      title: "Removed",
      type: "boolean",
      readOnly: true,
      hidden: true,
      description:
        "Set by ops on a draft when this date is dropped from its series' schedule: it leaves the website on the next publish.",
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "title", maxLength: 96 },
      validation: (rule) => rule.required(),
      description:
        "The night's own key, set by ops. Keep it readable, e.g. launch-party.",
    }),
    defineField({
      name: "eventType",
      title: "Event type",
      type: "string",
      options: {
        list: [
          { title: "Public event", value: "public" },
          { title: "Private event", value: "private" },
        ],
        layout: "radio",
      },
      initialValue: "public",
      validation: (rule) => rule.required(),
      description:
        "Private events do not appear on the public events page.",
    }),
    defineField({
      name: "date",
      title: "Date",
      type: "date",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "time",
      title: "Public time",
      type: "string",
      description:
        "Leave this empty when start and end are set. Extra sets belong in the description.",
    }),
    defineField({
      name: "pageUrl",
      title: "Page link",
      type: "url",
      readOnly: true,
      description:
        "Set by ops. Their page, shown on the event when present.",
    }),
    defineField({
      name: "shortDescription",
      title: "Short description",
      type: "text",
      rows: 3,
      description: "Card blurb on What's on. Keep it to one or two lines.",
    }),
    defineField({
      name: "description",
      title: "Description",
      type: "eventDescription",
      description:
        "Full copy on the series page. Press Enter for a new paragraph.",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "venue",
      title: "Venue",
      type: "string",
            initialValue: "Schwartz Wharf, Hackney Wick, London E9 5AA",
    }),
    defineField({
      name: "ticketStart",
      title: "Start time",
      type: "string",
      description: "24-hour time on the event date, e.g. 17:00.",
      initialValue: "17:00",
    }),
    defineField({
      name: "ticketEnd",
      title: "End time",
      type: "string",
      description: "24-hour time on the event date, e.g. 23:00.",
      initialValue: "23:00",
    }),
    defineField({
      name: "nightSchedule",
      title: "Night schedule",
      type: "array",
      description:
        "Structured schedule for the night (open decks, chess, live set). Shown on What's on when present.",
      of: [
        defineArrayMember({
          type: "object",
          name: "slot",
          fields: [
            defineField({
              name: "label",
              title: "Label",
              type: "string",
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: "startTime",
              title: "Start",
              type: "string",
              description: "24-hour HH:mm",
            }),
            defineField({
              name: "endTime",
              title: "End",
              type: "string",
              description: "24-hour HH:mm",
            }),
          ],
          preview: {
            select: { title: "label", start: "startTime", end: "endTime" },
            prepare({ title, start, end }) {
              const when = [start, end].filter(Boolean).join("–");
              return { title: title || "Slot", subtitle: when || undefined };
            },
          },
        }),
      ],
    }),
    defineField({
      name: "heroImage",
      title: "Hero image",
      type: "image",
      options: { hotspot: true },
      fields: [
        defineField({
          name: "alt",
          type: "string",
          title: "Alternative text",
        }),
        defineField({
          name: "fit",
          type: "string",
          title: "Fit",
          description:
            "Whole image: the photo is shown uncropped inside the 16×10 frame, on a blurred copy of itself (#27). Set by ops.",
          options: {
            list: [
              { title: "Fill the frame", value: "fill" },
              { title: "Whole image", value: "whole" },
            ],
          },
        }),
      ],
    }),
    defineField({
      name: "seriesHeroImage",
      title: "Series default hero",
      type: "image",
      readOnly: true,
      hidden: true,
      description:
        "Set by ops from the series Main image. Used on What's on when a night has no flyer.",
      options: { hotspot: true },
      fields: [
        defineField({
          name: "alt",
          type: "string",
          title: "Alternative text",
        }),
        defineField({
          name: "fit",
          type: "string",
          title: "Fit",
          description:
            "Whole image: the photo is shown uncropped inside the 16×10 frame, on a blurred copy of itself (#27). Set by ops.",
          options: {
            list: [
              { title: "Fill the frame", value: "fill" },
              { title: "Whole image", value: "whole" },
            ],
          },
        }),
      ],
    }),
  ],
  preview: {
    select: { title: "title", subtitle: "eventType", media: "heroImage" },
    prepare({ title, subtitle, media }) {
      const typeLabel =
        subtitle === "private" ? "Private event" : "Public event";
      return { title, subtitle: typeLabel, media };
    },
  },
  orderings: [
    {
      title: "Date, soonest first",
      name: "dateAsc",
      by: [{ field: "date", direction: "asc" }],
    },
  ],
});
