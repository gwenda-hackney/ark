/**
 * For the weekly email's tests: a pinned clock and a published week on the
 * fake website (testing/fake-world.js). Tests never read the real date: a
 * test here once failed in CI because it depended on the weekday.
 */

/** Tuesday 10 November 2026, 10:05 in London. */
export const TUESDAY_MORNING = new Date("2026-11-10T10:05:00Z");
/** Tuesday 10 November 2026, 11:02 in London: just after the default send time. */
export const TUESDAY_SEND = new Date("2026-11-10T11:02:00Z");
/** Monday 9 November 2026, 11:02 in London: for a send set to Mondays. */
export const MONDAY_SEND = new Date("2026-11-09T11:02:00Z");
/** The Monday that week starts on. */
export const WEEK = "2026-11-09";

const block = (text) => [{ _type: "block", children: [{ _type: "span", text }] }];

function publish(world, doc) {
  world.sanity.docs.set(doc._id, { _rev: "rev-test", ...doc });
}

/** One night on the published website. */
export function publishNight(world, date, slug = "quiz", title = "Quiz Night") {
  publish(world, {
    _id: `series-${slug}`,
    _type: "eventSeries",
    slug: { current: slug },
    title,
    category: "event",
    schedule: "repeating",
    recurrence: "Every Thursday",
  });
  publish(world, {
    _id: `event-${slug}-${date}`,
    _type: "event",
    slug: { current: `${slug}-${date}` },
    title,
    seriesId: slug,
    seriesTitle: title,
    date,
    ticketStart: "19:00",
    ticketEnd: "22:00",
    description: block("Teams of six, prizes for the top three."),
  });
}

/** The week of 9 November 2026 with two nights on, and one the week after. */
export function publishWeek(world) {
  publishNight(world, "2026-11-12", "quiz", "Quiz Night");
  publishNight(world, "2026-11-14", "jazz", "Canalside Jazz");
  publishNight(world, "2026-11-19", "quiz", "Quiz Night");
}

/** Headers of someone signed in to ops with Google. */
export async function signedIn(world, email = "someone@example.com") {
  const { AUTH_COOKIE_NAME, createSessionToken } = await import("../access/server/auth.js");
  const token = await createSessionToken(world.env.OPS_SESSION_SECRET, email);
  return { Cookie: `${AUTH_COOKIE_NAME}=${token}` };
}
