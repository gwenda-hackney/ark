/** Published events for the events page — ordered by date ascending. */
export const EVENTS_QUERY = `*[_type == "event"] | order(date asc) {
  "id": slug.current,
  title,
  date,
  description
}`;
