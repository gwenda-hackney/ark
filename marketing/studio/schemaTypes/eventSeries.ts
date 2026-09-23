import { defineField, defineType } from "sanity";
import { eventDescription } from "./eventDescription";

export const eventSeries = defineType({
  name: "eventSeries",
  title: "Event series",
  type: "document",
  description:
    "Template for a residency. Occurrences (event documents) are nights scheduled into this series. Ops is the source of truth.",
  fields: [
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
      options: { source: "title", maxLength: 96 },
      validation: (rule) => rule.required(),
      readOnly: true,
    }),
    defineField({
      name: "schedule",
      title: "Schedule",
      type: "string",
      readOnly: true,
      options: {
        list: [
          { title: "Manual (each night is added)", value: "manual" },
          { title: "Repeating", value: "repeating" },
        ],
        layout: "radio",
      },
      initialValue: "manual",
    }),
    defineField({
      name: "recurrence",
      title: "Repeats",
      type: "string",
      readOnly: true,
      description:
        "Set by ops when the series auto-schedules. Empty for manual series.",
    }),
    defineField({
      name: "shortDescription",
      title: "Short description",
      type: "text",
      rows: 3,
      description: "Card blurb on What's on.",
    }),
    defineField({
      name: "description",
      title: "Description",
      type: "eventDescription",
      description: "Series copy on the What's on series page.",
    }),
    defineField({
      name: "nightSchedule",
      title: "Night schedule",
      type: "array",
      description:
        "Default schedule for nights in this series (open decks, chess, sets).",
      of: [
        {
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
            }),
            defineField({
              name: "endTime",
              title: "End",
              type: "string",
            }),
          ],
          preview: {
            select: { title: "label", start: "startTime", end: "endTime" },
            prepare({ title, start, end }) {
              const when = [start, end].filter(Boolean).join("–");
              return { title: title || "Slot", subtitle: when || undefined };
            },
          },
        },
      ],
    }),
    defineField({
      name: "heroImage",
      title: "Default hero",
      type: "image",
      options: { hotspot: true },
      fields: [
        defineField({
          name: "alt",
          type: "string",
          title: "Alternative text",
        }),
      ],
    }),
  ],
  preview: {
    select: { title: "title", subtitle: "schedule", media: "heroImage" },
    prepare({ title, subtitle, media }) {
      const schedule =
        subtitle === "repeating" ? "Repeating" : "Manual schedule";
      return { title, subtitle: schedule, media };
    },
  },
});
