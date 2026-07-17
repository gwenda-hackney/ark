/**
 * Repair event documents after schema changes:
 * - portable text `_key` on description blocks and spans
 * - channel array `_key` values
 * - canonical fields (eventType, venue, ticket times, email copy)
 * - remove orphaned rsvpCode / clickupGuestListId
 * - discard stale drafts so Studio shows a clean published doc
 *
 * Usage (from repo root):
 *   npm run studio:fix:events:dev
 *   CONFIRM_PRODUCTION_MIGRATE=1 npm run studio:fix:events:production
 */
import { createClient } from "@sanity/client";
import {
  ensureChannelKeys,
  ensurePortableTextKeys,
  textToBlocks,
} from "./lib/portable-text.mjs";

const dataset = process.env.SANITY_DATASET || "development";
const projectId = process.env.SANITY_PROJECT_ID || "pn5yjro6";
const token = process.env.SANITY_API_TOKEN;

if (dataset === "production" && process.env.CONFIRM_PRODUCTION_MIGRATE !== "1") {
  console.error(
    "Refusing to fix production without CONFIRM_PRODUCTION_MIGRATE=1",
  );
  process.exit(1);
}

if (!token) {
  console.error("SANITY_API_TOKEN is required.");
  process.exit(1);
}

const client = createClient({
  projectId,
  dataset,
  token,
  apiVersion: "2025-01-01",
  useCdn: false,
});

const DEFAULT_DESCRIPTION = textToBlocks(
  "We're hosting a private launch party to celebrate the opening of Gwenda, and we'd love for you to come join us.\n\nFree signature cocktail from 5 to 7pm, music, and friends.",
);

const DEFAULT_RSVP_CONFIRMATION = {
  subject: "You're on the list · Gwenda",
  eyebrow: "You're on the list",
  heading: "See you there",
  body: `{greeting}

Thanks for replying. {guests_line}

{event_block}

Open your ticket link below to view your pass, add it to Apple Wallet, or save the date to your calendar.

Need to change your reply? {modify_url}`,
};

const CANONICAL_BY_SLUG = {
  "private-launch-party": {
    title: "Launch Party",
    eventType: "private",
    date: "2026-08-15",
    description: DEFAULT_DESCRIPTION,
    venue: "Schwartz Wharf, Hackney Wick, London E9 5AA",
    ticketStart: "17:00",
    ticketEnd: "23:00",
    rsvpConfirmation: DEFAULT_RSVP_CONFIRMATION,
  },
};

function mergeEventFields(doc) {
  const slug = doc.slug?.current;
  const canonical = slug ? CANONICAL_BY_SLUG[slug] : null;

  const description = ensurePortableTextKeys(
    doc.description ?? canonical?.description ?? DEFAULT_DESCRIPTION,
  );

  const channels = ensureChannelKeys(doc.channels);

  const rsvpConfirmation = {
    ...DEFAULT_RSVP_CONFIRMATION,
    ...(doc.rsvpConfirmation ?? {}),
    ...(canonical?.rsvpConfirmation ?? {}),
  };

  return {
    title: doc.title?.trim() || canonical?.title || doc.title,
    eventType: doc.eventType || canonical?.eventType || "public",
    date: doc.date || canonical?.date,
    description,
    venue: doc.venue?.trim() || canonical?.venue || null,
    ticketStart: doc.ticketStart?.trim() || canonical?.ticketStart || null,
    ticketEnd: doc.ticketEnd?.trim() || canonical?.ticketEnd || null,
    rsvpConfirmation,
    ...(channels.length ? { channels } : {}),
  };
}

async function main() {
  const docs = await client.fetch(
    `*[_type == "event"]{
      _id,
      _rev,
      title,
      slug,
      eventType,
      date,
      description,
      venue,
      ticketStart,
      ticketEnd,
      channels,
      rsvpConfirmation,
      heroImage
    }`,
  );

  if (!docs.length) {
    console.log(`No events in ${projectId}/${dataset}.`);
    return;
  }

  console.log(`Fixing ${docs.length} event document(s) in ${projectId}/${dataset}…`);

  const published = docs.filter((doc) => !doc._id.startsWith("drafts."));
  const drafts = docs.filter((doc) => doc._id.startsWith("drafts."));

  for (const doc of published) {
    const draft = drafts.find((item) => item._id === `drafts.${doc._id}`);
    const source = draft
      ? {
          ...doc,
          ...draft,
          channels: draft.channels?.length ? draft.channels : doc.channels,
          description: draft.description ?? doc.description,
          rsvpConfirmation: draft.rsvpConfirmation ?? doc.rsvpConfirmation,
          heroImage: draft.heroImage ?? doc.heroImage,
        }
      : doc;

    const fields = mergeEventFields(source);

    console.log(`  ${fields.title} (${doc.slug?.current}) → ${doc._id}`);

    await client
      .patch(doc._id)
      .set(fields)
      .unset(["rsvpCode", "clickupGuestListId"])
      .commit();

    if (draft) {
      await client.delete(draft._id);
      console.log(`    discarded stale draft ${draft._id}`);
    }
  }

  const orphanDrafts = drafts.filter(
    (draft) => !published.some((doc) => draft._id === `drafts.${doc._id}`),
  );
  for (const draft of orphanDrafts) {
    console.log(`  orphan draft only: ${draft._id}`);
    const fields = mergeEventFields(draft);
    const created = await client.create({
      _type: "event",
      ...fields,
      slug: draft.slug,
      ...(draft.heroImage ? { heroImage: draft.heroImage } : {}),
    });
    await client.delete(draft._id);
    console.log(`    published as ${created._id}`);
  }

  console.log("Done. Refresh Studio to clear missing-key warnings.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
