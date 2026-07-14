import { sanityDatasetForEnv, sanityProjectId, sanityQuery } from "./sanity-query.js";

const EVENT_FIELDS = `{
  title,
  description,
  date,
  venue,
  ticketStart,
  ticketEnd,
  "heroImageUrl": heroImage.asset->url,
  "slug": slug.current,
  "channels": channels[]{label, token},
  rsvpConfirmation {
    subject,
    heading,
    body,
    venue
  }
}`;

const EVENT_BY_SLUG_QUERY = `*[_type == "event" && slug.current == $slug][0]${EVENT_FIELDS}`;

export { sanityDatasetForEnv };

function normalizeChannels(channels) {
  if (!Array.isArray(channels)) return [];
  return channels
    .filter((channel) => channel?.token)
    .map((channel) => ({
      label: (channel.label ?? "").trim(),
      token: channel.token.trim().toLowerCase(),
    }));
}

function toEventRecord(doc) {
  if (!doc?.title) return null;
  return {
    title: doc.title,
    description: doc.description ?? "",
    date: doc.date ?? null,
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
    description: event.description,
    date: event.date,
    venue: event.venue,
    heroImageUrl: event.heroImageUrl,
  };
}

export async function fetchEventBySlug(env, slug) {
  const normalized = slug?.trim();
  if (!normalized) return null;

  const doc = await sanityQuery(env, EVENT_BY_SLUG_QUERY, { $slug: normalized });
  return toEventRecord(doc);
}

export async function fetchEventHeroImageUrl(env, slug) {
  const event = await fetchEventBySlug(env, slug);
  if (event?.heroImageUrl) return event.heroImageUrl;
  return env.INVITE_IMAGE_URL?.trim() || "https://gwenda.co.uk/images/event-invite.jpg";
}
