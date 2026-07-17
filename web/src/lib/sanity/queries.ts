/** Published events for the events page — ordered by date ascending. */
export const EVENTS_QUERY = `*[_type == "event" && coalesce(eventType, "public") == "public"] | order(date asc) {
  "id": slug.current,
  title,
  date,
  description,
  heroImage {
    alt,
    asset->{
      _id,
      url,
      metadata { dimensions { width, height } }
    }
  }
}`;

export const EVENT_BY_SLUG_QUERY = `*[_type == "event" && slug.current == $slug][0] {
  "id": slug.current,
  title,
  date,
  description,
  heroImage {
    alt,
    asset->{
      _id,
      url,
      metadata { dimensions { width, height } }
    }
  }
}`;

/** All published events with slugs — used to prerender RSVP pages and social previews. */
export const RSVP_EVENTS_QUERY = `*[_type == "event" && defined(slug.current)] | order(date asc) {
  "slug": slug.current,
  title,
  description,
  heroImage {
    alt,
    crop,
    hotspot,
    asset->{
      _id,
      url,
      metadata { dimensions { width, height } }
    }
  }
}`;

/** Menu sections with nested items — ordered for display (Studio drag rank). */
export const MENU_QUERY = `*[_type == "menuSection"] | order(orderRank asc) {
  "id": slug.current,
  title,
  subtitle,
  "items": *[_type == "menuItem" && references(^._id)] | order(orderRank asc) {
    "id": _id,
    name,
    description,
    price,
    signature,
    notes,
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
  bookingEnabled
}`;
