/**
 * The people on our list (Email → People): everyone who has signed up on
 * the website or the guest Wi-Fi, from our own list (shared/guests, the
 * website D1 database), which the Mailchimp sync copies to Mailchimp every
 * hour. For each: where we got them and when, the last day they were on the
 * Wi-Fi, and where they stand with Mailchimp. Reads only; admins only, as
 * it's guests' email addresses.
 */
import { subscriberRepository } from "../../../../../shared/guests/subscriber-repository.js";

/** Where a tag says we got them, as a guest would say it. */
const SOURCES = { wifi: "Wi-Fi", website: "Website", prelaunch: "Before opening" };

/**
 * Where they stand with Mailchimp, from our side of the sync:
 * on the list and sent → in Mailchimp; on the list, not sent yet → waiting
 * for the hourly sync; unsubscribed in Mailchimp (the sync brought it back);
 * or never on the list (a Wi-Fi guest who didn't tick the box).
 */
export function mailchimpStatus(record) {
  if (record.marketing) {
    return record.synced
      ? { status: "in", label: "In Mailchimp", tone: "success", detail: "On the mailing list in Mailchimp." }
      : { status: "waiting", label: "Waiting", tone: "info", detail: "Goes to Mailchimp with the next hourly sync." }
  }
  if (record.marketingOffOn) {
    return { status: "unsubscribed", label: "Unsubscribed", tone: "warning", detail: "Unsubscribed in Mailchimp." };
  }
  return { status: "off", label: "Not on the list", tone: "neutral", detail: "Didn't ask for emails, so never sent to Mailchimp." };
}

/** One person as the People list shows them. */
export function personView(record) {
  const sources = (record.tags || []).map((tag) => SOURCES[tag] || tag);
  return {
    id: record.id,
    email: record.email,
    source: sources.join(", "),
    acquiredOn: record.signedUpOn || null,
    lastSeenOn: record.lastSeenOn || null,
    onListSince: record.marketing ? record.marketingOn || null : null,
    unsubscribedOn: record.marketingOffOn || null,
    mailchimp: mailchimpStatus(record),
  };
}

/** Everyone, newest first, with counts for the page's summary. */
export async function listPeople(env) {
  const { subscribers } = await subscriberRepository(env).exportAll();
  const people = subscribers
    .map(personView)
    .sort((a, b) => String(b.acquiredOn || "").localeCompare(String(a.acquiredOn || "")) || b.id - a.id);
  const counts = { total: people.length, in: 0, waiting: 0, unsubscribed: 0, off: 0 };
  for (const person of people) counts[person.mailchimp.status] += 1;
  return { people, counts };
}
