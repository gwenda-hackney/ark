#!/usr/bin/env node
/**
 * Build the weekly "what's on" email from the published website data and
 * write it to a folder. It only reads Sanity and writes local files: nothing
 * is sent, and nothing in Mailchimp is touched.
 *
 *   node scripts/with-env.mjs node scripts/weekly-email.mjs --out <folder>
 *
 * with-env loads the dev Sanity project on a developer's machine, so this
 * builds from dev's nights. Options:
 *
 *   --out <folder>     where the files go (required)
 *   --today YYYY-MM-DD the day it goes out; today in London unless given
 *   --origin <url>     where links go; the live site unless given (a preview
 *                      site, to try the links before a release)
 *   --logo <url>       the logo's public address; <origin>/brand/logo-email-social.png
 *                      unless given
 *
 * Writes weekly-email.html, weekly-email.txt, weekly-email.subject.txt
 * (subject, then the preview line) and weekly-email.model.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { londonToday } from "../marketing/web/src/lib/london-day.js";
import { fetchWeeklyCatalog, renderWeeklyEmail, weeklyEmailModel } from "../shared/weekly-email/index.js";

const { values } = parseArgs({
  options: {
    out: { type: "string" },
    today: { type: "string" },
    origin: { type: "string" },
    logo: { type: "string" },
  },
});

if (!values.out) {
  console.error("usage: weekly-email.mjs --out <folder> [--today YYYY-MM-DD] [--origin <url>] [--logo <url>]");
  process.exit(1);
}

const projectId = process.env.SANITY_PROJECT_ID?.trim();
if (!projectId) {
  console.error("SANITY_PROJECT_ID is not set: run this through scripts/with-env.mjs");
  process.exit(1);
}

const catalog = await fetchWeeklyCatalog({
  projectId,
  dataset: process.env.SANITY_DATASET?.trim() || "production",
  token: process.env.SANITY_API_TOKEN?.trim() || "",
});
const model = weeklyEmailModel(catalog, {
  today: values.today || londonToday(),
  ...(values.origin ? { origin: values.origin } : {}),
});
const email = renderWeeklyEmail(model, { logoUrl: values.logo });

const out = resolve(values.out);
mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, "weekly-email.html"), email.html);
writeFileSync(resolve(out, "weekly-email.txt"), email.text);
writeFileSync(resolve(out, "weekly-email.subject.txt"), `${email.subject}\n${email.preheader}\n`);
writeFileSync(resolve(out, "weekly-email.model.json"), `${JSON.stringify(model, null, 2)}\n`);

console.log(
  JSON.stringify(
    {
      sanityProject: projectId,
      today: model.today,
      subject: email.subject,
      preheader: email.preheader,
      nights: model.nights.map((night) => `${night.sticker.weekday} ${night.sticker.day} ${night.title}`),
      deals: model.deals.map((deal) => deal.title),
      kitchens: model.kitchens.map((kitchen) => kitchen.title),
      nextWeek: model.nextWeek.nights.length + model.nextWeek.more,
      htmlKb: Number((Buffer.byteLength(email.html) / 1024).toFixed(1)),
      out,
    },
    null,
    2,
  ),
);
