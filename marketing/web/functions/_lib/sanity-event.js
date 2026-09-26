import { normalizeEventPassword } from "./event-password.js";
import {
  sanityDatasetForEnv,
  sanityProjectId,
  sanityQuery,
} from "./sanity-query.js";
import { portableTextToPlain } from "./portable-text.js";

const EVENT_FIELDS = `{
  title,
  eventType,
  description,
  offer,
  date,
  time,
  venue,
  ticketStart,
  ticketEnd,
  "heroImageUrl": heroImage.asset->url,
  "slug": slug.current,
  "channels": channels[]{label, token},
  rsvpConfirmation {
    subject,
    eyebrow,
    heading,
    body,
    venue
  }
}`;

const EVENT_BY_SLUG_QUERY = `*[_type == "event" && slug.current == $slug && removed != true][0]${EVENT_FIELDS}`;

export { sanityDatasetForEnv };

function normalizeChannels(channels) {
  if (!Array.isArray(channels)) return [];
  return channels
    .filter((channel) => channel?.token)
    .map((channel) => ({
      label: (channel.label ?? "").trim(),
      token: normalizeEventPassword(channel.token),
    }));
}

function toEventRecord(doc) {
  if (!doc?.title) return null;
  return {
    title: doc.title,
    eventType: doc.eventType === "private" ? "private" : "public",
    description: portableTextToPlain(doc.description),
    offer: doc.offer ?? null,
    date: doc.date ?? null,
    time: doc.time ?? null,
    venue: doc.venue ?? null,
    ticketStart: doc.ticketStart ?? null,
    ticketEnd: doc.ticketEnd ?? null,
    heroImageUrl: doc.heroImageUrl ?? null,
    slug: doc.slug ?? null,
    channels: normalizeChannels(doc.channels),
    rsvpConfirmation: doc.rsvpConfirmation ?? null,
  };
}

export function publicEventFields(event) {
  if (!event) return null;
  return {
    title: event.title,
    eventType: event.eventType,
    description: portableTextToPlain(event.description),
    offer: event.offer,
    date: event.date,
    time: event.time,
    venue: event.venue,
    ticketStart: event.ticketStart,
    ticketEnd: event.ticketEnd,
    heroImageUrl: event.heroImageUrl,
  };
}

export async function fetchEventBySlug(env, slug) {
  const normalized = slug?.trim();
  if (!normalized) return null;

  const doc = await sanityQuery(env, EVENT_BY_SLUG_QUERY, {
    $slug: normalized,
  });
  return toEventRecord(doc);
}

export async function fetchEventHeroImageUrl(env, slug) {
  const event = await fetchEventBySlug(env, slug);
  if (event?.heroImageUrl) return event.heroImageUrl;
  return (
    env.INVITE_IMAGE_URL?.trim() ||
    "https://gwenda.co.uk/images/event-invite.jpg"
  );
}
