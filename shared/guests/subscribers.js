/**
 * Subscribers (guests, #186): every address we have, from the website's
 * sign-up and the guest Wi-Fi, with whether it may get marketing. Only
 * `marketing` records are the mailing list: the Mailchimp sync sends those
 * (unsynced ones) on and marks them synced. One record per address.
 *
 *   SubscriberRecord = { id: number, email: string, tags: string[],
 *                        signedUpOn: "YYYY-MM-DD" | null,   // first seen
 *                        marketing: boolean,                // on the mailing list
 *                        marketingOn: "YYYY-MM-DD" | null,  // the day they last said yes
 *                        marketingOffOn: "YYYY-MM-DD" | null, // the day they unsubscribed
 *                        lastSeenOn: "YYYY-MM-DD" | null,   // last on the guest Wi-Fi
 *                        synced: boolean }
 *
 * Tags say where an address came from (website; prelaunch: the website
 * before opening; wifi). An unsubscribe in Mailchimp comes back through the
 * sync (marketing off); signing up again puts the address back on the list.
 *
 * `subscribe` is the one sign-up, for every app: the website, its smoke
 * test and the Wi-Fi portal. Storage is the repository's
 * (subscriber-repository.js).
 */

/** The tags Subscribers allows. */
export const SUBSCRIBER_TAGS = ["website", "prelaunch", "wifi"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lower case and trimmed, or null when it isn't an email address. */
export function normalizeEmail(raw) {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return email && EMAIL_RE.test(email) ? email : null;
}

/** Tags from a string, `{ value }` or a list of them; no repeats. */
export function normalizeTags(raw) {
  if (raw == null) return [];
  if (typeof raw === "string") {
    const tag = raw.trim();
    return tag ? [tag] : [];
  }
  if (Array.isArray(raw)) {
    const out = [];
    for (const item of raw) {
      for (const tag of normalizeTags(item)) {
        if (!out.includes(tag)) out.push(tag);
      }
    }
    return out;
  }
  if (typeof raw === "object" && "value" in raw) {
    return normalizeTags(raw.value);
  }
  return [];
}

/** `existing` plus `add`, when it isn't there yet. */
export function mergeTags(existing, add) {
  const tags = normalizeTags(existing);
  const tag = String(add ?? "").trim();
  return tag && !tags.includes(tag) ? [...tags, tag] : tags;
}

const day = (now) => now.toISOString().slice(0, 10);

/**
 * A new record's fields: unsynced, signed up today (UTC). With `marketing`,
 * on the mailing list from today; with `visit`, seen on the Wi-Fi today.
 */
export function newSubscriber(
  email,
  tag,
  now = new Date(),
  { marketing = true, visit = false } = {},
) {
  return {
    email,
    tags: normalizeTags(tag),
    signedUpOn: day(now),
    marketing: Boolean(marketing),
    marketingOn: marketing ? day(now) : null,
    marketingOffOn: null,
    lastSeenOn: visit ? day(now) : null,
    synced: false,
  };
}

/**
 * What a sign-up changes on an existing record, or null for nothing.
 * Consent (`marketing`) is always recorded afresh, even for an address and
 * tag we have: on the list from today, any unsubscribe cleared, and synced
 * again (so someone who unsubscribed is asked to confirm). A visit without
 * consent only moves lastSeenOn: it never changes consent either way.
 */
function changesFor(existing, { tag, marketing, visit, now }) {
  const changes = {};
  if (marketing) {
    Object.assign(changes, {
      tags: mergeTags(existing.tags, tag),
      marketing: true,
      marketingOn: day(now),
      marketingOffOn: null,
      synced: false,
    });
  }
  if (visit && existing.lastSeenOn !== day(now)) changes.lastSeenOn = day(now);
  return Object.keys(changes).length ? changes : null;
}

/** Thrown by an adapter's create() when the address is there already (a race). */
export function duplicateSubscriberError(cause) {
  const error = new Error("A subscriber with this email exists already.");
  error.code = "duplicate";
  if (cause) error.cause = cause;
  return error;
}

const FAILED = "Something went wrong. Try again?";

/** What a sign-up says when storage fails, by the error's status. */
export function subscribeFailure(error) {
  const status = Number(error?.status) || 0;
  if (status === 429)
    return {
      ok: false,
      status: 429,
      error: "Lots of signups just now. Try again in a little while.",
    };
  if (status === 400 && /email|invalid|validation/i.test(error?.message || ""))
    return {
      ok: false,
      status: 400,
      error: "That doesn't look like a valid email.",
    };
  return { ok: false, status: 502, error: FAILED };
}

/**
 * Sign `email` up with `tag`: a new record, or the tag added to the existing
 * one, with consent recorded (see changesFor).
 *
 * `marketing` (default true: the website's sign-up is consent) says the
 * address may get marketing. The Wi-Fi portal passes the guest's tick, and
 * `visit` to record the day they got online. Without consent a new address
 * is kept off the list and an existing one keeps its consent as it was.
 * @param {{ listByEmail(email: string): Promise<object[]>, create(fields: object): Promise<object>,
 *   update(id: number, fields: object): Promise<object> }} repo
 * @returns {Promise<{ ok: true, status: 200, subscriber: object, changed: boolean }
 *   | { ok: false, status: number, error: string }>}
 */
export async function subscribe(
  repo,
  {
    email: rawEmail,
    tag = "website",
    now = new Date(),
    marketing = true,
    visit = false,
  },
) {
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, status: 400, error: "Valid email required." };
  const tagValue =
    (typeof tag === "string" ? tag : "website").trim() || "website";

  // Two sign-ups of a new address at once: the second create fails as a
  // duplicate, and its retry merges the tag into the first one's record.
  for (let attempt = 0; ; attempt += 1) {
    try {
      const [existing] = await repo.listByEmail(email);
      if (existing) {
        const changes = changesFor(existing, {
          tag: tagValue,
          marketing,
          visit,
          now,
        });
        if (!changes)
          return {
            ok: true,
            status: 200,
            subscriber: existing,
            changed: false,
          };
        const subscriber = await repo.update(existing.id, changes);
        return { ok: true, status: 200, subscriber, changed: true };
      }
      const subscriber = await repo.create(
        newSubscriber(email, tagValue, now, { marketing, visit }),
      );
      return { ok: true, status: 200, subscriber, changed: true };
    } catch (error) {
      if (error?.code !== "duplicate") {
        console.error("subscribe: could not save the sign-up", error);
        return subscribeFailure(error);
      }
      if (attempt >= 1) {
        // The other sign-up has the address; ours is as good as saved.
        return { ok: true, status: 200, subscriber: null, changed: false };
      }
    }
  }
}
