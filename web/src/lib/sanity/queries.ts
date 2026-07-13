/** Published events for the events page — ordered by date ascending. */
export const EVENTS_QUERY = `*[_type == "event"] | order(date asc) {
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

/** Menu sections with nested items — ordered for display. */