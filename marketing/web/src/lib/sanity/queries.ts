// Series choices on the play form (#41): shared with the Pages Function.
import { APPLICATION_SERIES_PROJECTION } from "../../../../../shared/forms/series-choice.js";

/** Published events for the events page — ordered by date ascending. */
export const EVENTS_QUERY = `*[_type == "event" && coalesce(eventType, "public") == "public" && removed != true] | order(date asc) {
  "id": slug.current,
  title,
  artist,
  offer,
  pageUrl,
  seriesId,
  seriesTitle,
  category,
  recurrence,
  isSpecialEdition,
  time,
  "startTime": ticketStart,
  "endTime": ticketEnd,
  date,
  shortDescription,
  nightSchedule[]{ label, startTime, endTime },
  description,
  heroImage {
    alt,
    fit,
    crop,
    hotspot,
    asset->{
      _id,
      url,
      metadata { dimensions { width, height } }
    }
  },
  seriesHeroImage {
    alt,
    fit,
    crop,
    hotspot,
    asset->{
      _id,
      url,
      metadata { dimensions { width, height } }
    }
  }
}`;

/** A series taken off in ops is marked `removed` until the website lets it go. */
export const SERIES_QUERY = `*[_type == "eventSeries" && removed != true] | order(title asc) {
  "id": slug.current,
  formerSlugs,
  title,
  category,
  schedule,
  datesPending,
  "gallery": gallery[]{
    "url": asset->url,
    "width": asset->metadata.dimensions.width,
    "height": asset->metadata.dimensions.height,
    alt,
    date,
    "added": asset->_createdAt,
    "lqip": asset->metadata.lqip,
    "color": asset->metadata.palette.dominant.background
  },
  recurrence,
  replacesSeriesId,
  shortDescription,
  nightSchedule[]{ label, startTime, endTime },
  description,
  heroImage {
    alt,
    fit,
    crop,
    hotspot,
    asset->{
      _id,
      url,
      metadata { dimensions { width, height } }
    }
  }
}`;

export const EVENT_BY_SLUG_QUERY = `*[_type == "event" && slug.current == $slug && removed != true][0] {
  "id": slug.current,
  title,
  date,
  description,
  heroImage {
    alt,
    fit,
    asset->{
      _id,
      url,
      metadata { dimensions { width, height } }
    }
  }
}`;

/** All published events with slugs — used to prerender RSVP pages and social previews. */
export const RSVP_EVENTS_QUERY = `*[_type == "event" && defined(slug.current) && removed != true] | order(date asc) {
  "slug": slug.current,
  title,
  date,
  seriesId,
  description
}`;

/**
 * Menu sections with nested items — ordered for display (Studio drag rank).
 * A section's `id` is its slug: ops writes it once and leaves it alone, so
 * it is what the section's links are made of (lib/menu-anchors.js). One
 * without a slug goes by its document id, and so does a parent without one.
 */
export const MENU_QUERY = `*[_type == "menuSection"] | order(orderRank asc) {
  "id": coalesce(slug.current, _id),
  title,
  subtitle,
  kind,
  "popupSeriesId": coalesce(popupSeries->slug.current, popupSeries._ref),
  "parentId": coalesce(parent->slug.current, parent._ref),
  "items": *[_type == "menuItem" && references(^._id) && removed != true] | order(orderRank asc) {
    "id": _id,
    name,
    description,
    price,
    priceAlt,
    prices[] { name, size, price },
    drinkType,
    notes,
    abv,
    volume,
    producer,
    image {
      alt,
      crop,
      hotspot,
      asset->{
        _id,
        url,
        metadata { dimensions { width, height } }
      }
    }
  }
}`;

/** Singleton site settings (fixed document id). */
export const SITE_SETTINGS_QUERY = `*[_id == "siteSettings"][0] {
  bookingEnabled,
  cocktailGalleryEnabled
}`;

const FORM_FIELDS_PROJECTION = `fields[] {
  key,
  label,
  section,
  type,
  placeholder,
  helpText,
  required,
  options[] { label, value }
}`;

/** Enabled forms for static paths. */
export const FORM_SLUGS_QUERY = `*[_type == "form" && enabled == true && defined(slug.current)]{
  "slug": slug.current
}`;

export const FORM_BUTTONS_QUERY = `*[_type == "form" && enabled == true && defined(slug.current)]{
  "slug": slug.current,
  heading
}`;

export const FORM_BY_SLUG_QUERY = `*[_type == "form" && enabled == true && slug.current == $slug][0] {
  title,
  "slug": slug.current,
  eyebrow,
  heading,
  intro,
  seoDescription,
  notifyEmail,
  fromEmail,
  replyToEmail,
  requireEmailVerification,
  submitLabel,
  successTitle,
  successMessage,
  verifyPendingTitle,
  verifyPendingMessage,
  ${FORM_FIELDS_PROJECTION},
  ${APPLICATION_SERIES_PROJECTION}
}`;

/** Runtime validation for form submissions (Pages Function). */
export const FORM_SUBMIT_QUERY = `*[_type == "form" && enabled == true && slug.current == $slug][0] {
  title,
  "slug": slug.current,
  notifyEmail,
  fromEmail,
  replyToEmail,
  requireEmailVerification,
  successTitle,
  successMessage,
  verifyPendingTitle,
  verifyPendingMessage,
  ${FORM_FIELDS_PROJECTION},
  ${APPLICATION_SERIES_PROJECTION}
}`;
