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

/**
 * The monthly email's own clock: it goes on the first Tuesday of the month.
 * Tuesday 1 December 2026 is December's (London is on GMT then).
 */
export const FIRST_TUESDAY_MORNING = new Date("2026-12-01T10:05:00Z");
/** Tuesday 1 December 2026, 11:02 in London: just after the default send time. */
export const FIRST_TUESDAY_SEND = new Date("2026-12-01T11:02:00Z");
/** Monday 7 December 2026, 11:02 in London: the first Monday, for a send set to Mondays. */
export const FIRST_MONDAY_SEND = new Date("2026-12-07T11:02:00Z");
/** The month those go in. */
export const MONTH = "2026-12-01";

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

/**
 * December 2026 with nights on: the quiz on two Thursdays (one card, "Also
 * 10 Dec") and jazz on a Saturday, and one night in January.
 */
export function publishMonth(world) {
  publishNight(world, "2026-12-03", "quiz", "Quiz Night");
  publishNight(world, "2026-12-05", "jazz", "Canalside Jazz");
  publishNight(world, "2026-12-10", "quiz", "Quiz Night");
  publishNight(world, "2027-01-07", "quiz", "Quiz Night");
}

/** Headers of someone signed in to ops with Google. */
export async function signedIn(world, email = "someone@example.com") {
  const { AUTH_COOKIE_NAME, createSessionToken } = await import("../access/server/auth.js");
  const token = await createSessionToken(world.env.OPS_SESSION_SECRET, email);
  return { Cookie: `${AUTH_COOKIE_NAME}=${token}` };
}
