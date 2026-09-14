/**
 * Fix the launch party event after schema changes:
 * - convert plain-text description → portable text blocks
 * - remove orphaned rsvpCode / clickupGuestListId fields
 * - set eventType, title, venue, ticket times, and email copy
 *
 * Usage (from repo root):
 *   npm run studio:migrate:launch-event:dev
 *   CONFIRM_PRODUCTION_MIGRATE=1 npm run studio:migrate:launch-party:production
 */
import { createClient } from "@sanity/client";
import { ensurePortableTextKeys, textToBlocks } from "./lib/portable-text.mjs";

const dataset = process.env.SANITY_DATASET || "development";
const projectId = process.env.SANITY_PROJECT_ID || "pn5yjro6";
const token = process.env.SANITY_API_TOKEN;
const slug = "private-launch-party";

if (dataset === "production" && process.env.CONFIRM_PRODUCTION_MIGRATE !== "1") {
  console.error(
    "Refusing to migrate production without CONFIRM_PRODUCTION_MIGRATE=1",
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

function textToBlocksFromLegacy(text) {
  if (Array.isArray(text)) return ensurePortableTextKeys(text);
  return textToBlocks(text);
}

const CANONICAL = {
  title: "Launch Party",
  eventType: "private",
  description: textToBlocksFromLegacy(
    "We're hosting a private launch party to celebrate the opening of Gwenda, and we'd love for you to come join us.\n\nFree signature cocktail from 5 to 7pm, music, and friends.",
  ),
  venue: "Schwartz Wharf, Hackney Wick, London E9 5AA",
  ticketStart: "17:00",
  ticketEnd: "23:00",
  rsvpConfirmation: {
    subject: "You're on the list · Gwenda",
    eyebrow: "You're on the list",
    heading: "See you there",
    body: `{greeting}

Thanks for replying. {guests_line}

{event_block}

Open your ticket link below to view your pass, add it to Apple Wallet, or save the date to your calendar.

Need to change your reply? {modify_url}`,
  },
};

async function main() {
  const doc = await client.fetch(
    `*[_type == "event" && slug.current == $slug][0]{
      _id,
      title,
      description,
      eventType,
      rsvpCode,
      clickupGuestListId
    }`,
    { slug },
  );

  if (!doc?._id) {
    console.error(`No event found with slug "${slug}" in ${projectId}/${dataset}.`);
    process.exit(1);
  }

  console.log(`Migrating ${doc.title} (${doc._id}) in ${projectId}/${dataset}…`);

  const patch = client.patch(doc._id).set(CANONICAL).unset(["rsvpCode", "clickupGuestListId"]);

  await patch.commit();

  console.log("Done.");
  console.log("  title → Launch Party");
  console.log("  eventType → private");
  console.log("  description → portable text");
  console.log("  removed → rsvpCode, clickupGuestListId");
  console.log("Refresh Studio to clear the validation errors.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
