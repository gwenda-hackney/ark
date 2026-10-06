/**
 * Subscribers (guests, #186): the newsletter list. One record per address;
 * signing up again (the website, then the Wi-Fi portal) only adds the tag.
 * The Mailchimp sync sends unsynced records on and marks them synced.
 *
 *   SubscriberRecord = { id: number, email: string, tags: string[],
 *                        signedUpOn: "YYYY-MM-DD" | null, synced: boolean }
 *
 * `subscribe` is the one sign-up, for every app: the website, its smoke
 * test and the Wi-Fi portal. Storage is the repository's
 * (subscriber-repository.js).
 */

/** The tags Subscribers allows. */
export const SUBSCRIBER_TAGS = ["prelaunch", "wifi"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lower case and trimmed, or null when it isn't an email address. */
export function normalizeEmail(raw) {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return email && EMAIL_RE.test(email) ? email : null;
}

/** Tags from a string, `{ value }` (Baserow's select) or a list of them; no repeats. */
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

/** A new record's fields: unsynced, signed up today (UTC). */
export function newSubscriber(email, tag, now = new Date()) {
  return {
    email,
    tags: normalizeTags(tag),
    signedUpOn: now.toISOString().slice(0, 10),
    synced: false,
  };
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
 * one (which then syncs again). Already tagged is fine and changes nothing.
 * @param {{ listByEmail(email: string): Promise<object[]>, create(fields: object): Promise<object>,
 *   update(id: number, fields: object): Promise<object> }} repo
 * @returns {Promise<{ ok: true, status: 200, subscriber: object, changed: boolean }
 *   | { ok: false, status: number, error: string }>}
 */
export async function subscribe(
  repo,
  { email: rawEmail, tag = "prelaunch", now = new Date() },
) {
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, status: 400, error: "Valid email required." };
  const tagValue =
    (typeof tag === "string" ? tag : "prelaunch").trim() || "prelaunch";

  // Two sign-ups of a new address at once: the second create fails as a
  // duplicate, and its retry merges the tag into the first one's record.
  for (let attempt = 0; ; attempt += 1) {
    try {
      const [existing] = await repo.listByEmail(email);
      if (existing) {
        const tags = mergeTags(existing.tags, tagValue);
        if (tags.length === existing.tags.length)
          return {
            ok: true,
            status: 200,
            subscriber: existing,
            changed: false,
          };
        const subscriber = await repo.update(existing.id, {
          tags,
          synced: false,
        });
        return { ok: true, status: 200, subscriber, changed: true };
      }
      const subscriber = await repo.create(newSubscriber(email, tagValue, now));
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
