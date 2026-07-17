import { defineArrayMember, defineField, defineType } from "sanity";
import { ChannelPreview } from "../components/ChannelPreview";
import { ChannelUrlInput } from "../components/ChannelUrlInput";
import { generateChannelToken } from "../lib/channels";
import {
  EVENT_PASSWORD_PATTERN,
  LEGACY_CHANNEL_TOKEN_PATTERN,
} from "../../web/functions/_lib/event-password.js";
import { eventDescription } from "./eventDescription";

function isValidChannelToken(value: unknown) {
  const token = String(value ?? "").trim();
  if (!token) return false;
  const normalized = token.toLowerCase();
  return (
    EVENT_PASSWORD_PATTERN.test(normalized) ||
    LEGACY_CHANNEL_TOKEN_PATTERN.test(token)
  );
}

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
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "title", maxLength: 96 },
      validation: (rule) => rule.required(),
      description:
        "Used in the public RSVP URL: /events/<slug>. Also the Baserow key. Keep it readable, e.g. launch-party.",
    }),
    defineField({
      name: "channels",
      title: "Invite channels",
      type: "array",
      description:
        "Each channel is a shareable invite link that also records where an RSVP came from (e.g. \"Dan - WhatsApp\"). Add one per person or place you send the invite. A valid channel link is required to open the RSVP page.",
      of: [
        defineArrayMember({
          type: "object",
          name: "channel",
          fields: [
            defineField({
              name: "label",
              title: "Label",
              type: "string",
              description: 'Where this link is shared, e.g. "Dan - WhatsApp".',
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: "token",
              title: "Event password",
              type: "string",
              readOnly: true,
              initialValue: generateChannelToken,
              components: { input: ChannelUrlInput },
              validation: (rule) =>
                rule.required().custom((value) => {
                  if (isValidChannelToken(value)) return true;
                  return "Use three hyphenated words (e.g. candle-canal-vinyl) or keep an existing legacy channel code.";
                }),
            }),
          ],
          preview: {
            select: { title: "label", subtitle: "token" },
          },
          components: { preview: ChannelPreview },
        }),
      ],
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
        "Private events are invite-only. They do not appear on the public events page.",
    }),
    defineField({
      name: "date",
      title: "Date",
      type: "date",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "description",
      title: "Description",
      type: "eventDescription",
      description: "Shown on the RSVP page. Press Enter for a new paragraph.",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "venue",
      title: "Venue",
      type: "string",
      description: "Shown on RSVP confirmation emails and wallet tickets.",
      initialValue: "Schwartz Wharf, Hackney Wick, London E9 5AA",
    }),
    defineField({
      name: "ticketStart",
      title: "Ticket start time",
      type: "string",
      description: "24-hour time on the event date for calendar and wallet tickets, e.g. 17:00.",
      initialValue: "17:00",
    }),
    defineField({
      name: "ticketEnd",
      title: "Ticket end time",
      type: "string",
      description: "24-hour time on the event date, e.g. 23:00.",
      initialValue: "23:00",
    }),
    defineField({
      name: "rsvpConfirmation",
      title: "RSVP confirmation email",
      type: "object",
      description:
        "Sent automatically when someone RSVPs yes. Placeholders: {greeting}, {name}, {guests_line}, {guests}, {title}, {date}, {event_block}, {invite_url}, {modify_url}, {ticket_url}. Event details render automatically in {event_block}. Address lives in the email footer.",
      fields: [
        defineField({
          name: "subject",
          title: "Email subject",
          type: "string",
          validation: (rule) => rule.required(),
          initialValue: "You're on the list · Gwenda",
        }),
        defineField({
          name: "eyebrow",
          title: "Email eyebrow",
          type: "string",
          description: "Small gold label above the heading.",
          initialValue: "You're on the list",
        }),
        defineField({
          name: "heading",
          title: "Email heading",
          type: "string",
          validation: (rule) => rule.required(),
          initialValue: "See you there",
        }),
        defineField({
          name: "body",
          title: "Email body",
          type: "text",
          rows: 10,
          validation: (rule) => rule.required(),
          initialValue: `{greeting}

Thanks for replying. {guests_line}

{event_block}

Open your ticket link below to view your pass, add it to Apple Wallet, or save the date to your calendar.

Need to change your reply? {modify_url}`,
        }),
        defineField({
          name: "venue",
          title: "Venue override",
          type: "string",
          description:
            "Optional. Leave blank to use the event venue field above.",
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
      ],
    }),
  ],
  preview: {
    select: { title: "title", subtitle: "eventType", media: "heroImage" },
    prepare({ title, subtitle, media }) {
      const typeLabel = subtitle === "private" ? "Private event" : "Public event";
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
