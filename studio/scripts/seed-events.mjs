/**
 * Seed events into a Sanity dataset.
 *
 * Usage (from repo root):
 *   npm run studio:seed:events:dev
 *   CONFIRM_PRODUCTION_SEED=1 npm run studio:seed:events:production
 */
import { createClient } from "@sanity/client";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const imageDir = resolve(repoRoot, "web/src/assets/images/cocktails");

const dataset = process.env.SANITY_DATASET || "development";
const projectId = process.env.SANITY_PROJECT_ID || "pn5yjro6";
const token = process.env.SANITY_API_TOKEN;

if (dataset === "production" && process.env.CONFIRM_PRODUCTION_SEED !== "1") {
  console.error(
    "Refusing to seed production without CONFIRM_PRODUCTION_SEED=1",
  );
  process.exit(1);
}

if (!token) {
  console.error(
    "SANITY_API_TOKEN is required (Developer or Editor token with write access).",
  );
  process.exit(1);
}

const client = createClient({
  projectId,
  dataset,
  token,
  apiVersion: "2025-01-01",
  useCdn: false,
});

const EVENTS = [
  {
    title: "Private launch party",
    slug: "private-launch-party",
    date: "2026-08-15",
    description:
      "We're hosting a private launch party to celebrate the opening of Gwenda, and we'd love you to come. Free signature cocktail from 5 to 7pm, music, and friends.",
    venue: "Schwartz Wharf, Hackney Wick, London E9 5AA",
    ticketStart: "17:00",
    ticketEnd: "23:00",
    rsvpConfirmation: {
      subject: "You're on the list · Gwenda",
      heading: "You're on the list",
      body: `Hi {name},

Thanks for replying. {guests_line}

{title} is on {date} at {venue}.

Your ticket is attached. Add it to Apple Wallet or import the calendar file on your phone.

See you there.`,
    },
    heroImageFile: "cocktail1.png",
    heroAlt: "Cocktails at Gwenda launch party",
    channels: ["Direct link"],
  },
];

const TOKEN_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Short, URL-friendly channel access code (10 lowercase alphanumeric chars). */
function channelToken() {
  return Array.from(
    randomBytes(10),
    (byte) => TOKEN_ALPHABET[byte % TOKEN_ALPHABET.length],
  ).join("");
}

function channelObjects(labels) {
  return labels.map((label) => ({
    _type: "channel",
    _key: randomBytes(6).toString("hex"),
    label,
    token: channelToken(),
  }));
}

async function uploadImage(filename) {
  const filepath = resolve(imageDir, filename);
  const buffer = readFileSync(filepath);
  const asset = await client.assets.upload("image", buffer, {
    filename: basename(filepath),
    contentType: "image/png",
  });
  return asset._id;
}

function imageField(assetId, alt) {
  return {
    _type: "image",
    alt,
    asset: {
      _type: "reference",
      _ref: assetId,
    },
  };
}

async function ensureEvent(event, heroImage) {
  const existing = await client.fetch(
    `*[_type == "event" && slug.current == $slug][0]{ _id, channels }`,
    { slug: event.slug },
  );

  const fields = {
    title: event.title,
    slug: { _type: "slug", current: event.slug },
    date: event.date,
    description: event.description,
    ...(heroImage ? { heroImage } : {}),
    ...(!existing?.channels?.length
      ? { channels: channelObjects(event.channels ?? ["Direct link"]) }
      : {}),
  };

  if (existing?._id) {
    await client.patch(existing._id).set(fields).commit();
    return existing._id;
  }

  const created = await client.create({
    _type: "event",
    ...fields,
  });
  return created._id;
}

async function main() {
  console.log(`Seeding events into ${projectId}/${dataset}…`);

  const assetCache = {};
  for (const event of EVENTS) {
    let heroImage;
    if (event.heroImageFile) {
      if (!assetCache[event.heroImageFile]) {
        console.log(`Uploading ${event.heroImageFile}…`);
        assetCache[event.heroImageFile] = await uploadImage(event.heroImageFile);
      }
      heroImage = imageField(assetCache[event.heroImageFile], event.heroAlt);
    }

    const id = await ensureEvent(event, heroImage);
    console.log(`  ${event.title} (${event.slug}) → ${id}`);
  }

  console.log("Done.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
