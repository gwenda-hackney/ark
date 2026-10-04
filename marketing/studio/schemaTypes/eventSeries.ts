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
      name: "formerSlugs",
      title: "Former slugs",
      type: "array",
      of: [{ type: "string" }],
      readOnly: true,
      description: "Set by ops. Old web addresses that redirect to this series.",
    }),
    defineField({
      name: "schedule",
      title: "Schedule",
      type: "string",
      readOnly: true,
      options: {
        list: [
          { title: "Manual (each night is added)", value: "manual" },
          { title: "Special event", value: "once" },
          { title: "Repeating", value: "repeating" },
        ],
        layout: "radio",
      },
      initialValue: "manual",
    }),
    defineField({
      name: "replacesSeriesId",
      title: "Replaces series",
      type: "string",
      readOnly: true,
      description:
        "Slug of the residency this one-off stands in for. Empty when both nights stay listed.",
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
      name: "datesPending",
      title: "Dates to be announced",
      type: "boolean",
      readOnly: true,
      description:
        "Set by ops when the series has no nights yet. What's on shows it with “Check back soon for the next date”.",
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
      name: "gallery",
      title: "Gallery",
      type: "array",
      readOnly: true,
      description:
        "Copied by ops from the series' Drive gallery folder. Shown at the bottom of its What's on page.",
      of: [
        {
          type: "image",
          fields: [
            defineField({ name: "alt", type: "string", title: "Alternative text" }),
            defineField({
              name: "driveFileId",
              type: "string",
              title: "Drive file",
              hidden: true,
            }),
          ],
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
    select: { title: "title", subtitle: "schedule", media: "heroImage" },
    prepare({ title, subtitle, media }) {
      const schedule =
        subtitle === "repeating"
          ? "Repeating"
          : subtitle === "once"
            ? "Special event"
            : "Manual schedule";
      return { title, subtitle: schedule, media };
    },
  },
});
