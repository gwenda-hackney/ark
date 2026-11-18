#!/usr/bin/env node
/**
 * Record what a website build is made from (see shared/site-snapshot.js).
 *
 *   node scripts/site-build-snapshot.mjs capture --out FILE
 *     Before the build. Reads SANITY_DATASET with SANITY_API_TOKEN, and the
 *     artists: ops D1 over its API, with CLOUDFLARE_API_TOKEN.
 *
 *   node scripts/site-build-snapshot.mjs save --in FILE --site preview|production
 *     After a successful deploy. Writes the config database for SITE_ENV (D1,
 *     with the Cloudflare token).
 *
 * Capturing first means edits made during the build still count as pending.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { listArtists } from "../shared/artists.js";
import { writeState } from "../shared/config.js";
import {
  SNAPSHOT_CONFIG_KEY,
  SNAPSHOT_DOCS_QUERY,
  buildSnapshot,
  parseSnapshot,
} from "../shared/site-snapshot.js";

const [command, ...rest] = process.argv.slice(2);
const arg = (name) => {
  const index = rest.indexOf(name);
  return index >= 0 ? rest[index + 1] : "";
};

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function sanityDocs() {
  const projectId = process.env.SANITY_PROJECT_ID || "pn5yjro6";
  const dataset = process.env.SANITY_DATASET || fail("SANITY_DATASET is required.");
  const token = process.env.SANITY_API_TOKEN || fail("SANITY_API_TOKEN is required.");
  const url = new URL(`https://${projectId}.api.sanity.io/v2025-01-01/data/query/${dataset}`);
  url.searchParams.set("query", SNAPSHOT_DOCS_QUERY);
  // What the build showed: the preview reads drafts over published.
  url.searchParams.set(
    "perspective",
    process.env.SANITY_PERSPECTIVE === "previewDrafts" ? "previewDrafts" : "published",
  );
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) fail(`Sanity query failed (${response.status}).`);
  return (await response.json()).result || [];
}

async function artists() {
  if (!process.env.CLOUDFLARE_API_TOKEN) {
    console.warn("No CLOUDFLARE_API_TOKEN: artists not in the snapshot.");
    return [];
  }
  // Ops D1 over its API (#127).
  return listArtists({
    SANITY_PROJECT_ID: process.env.SANITY_PROJECT_ID,
    SITE_ENV: process.env.SITE_ENV,
    CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
  });
}

if (command === "capture") {
  const out = arg("--out") || fail("capture needs --out FILE");
  const [docs, rows] = await Promise.all([sanityDocs(), artists()]);
  const snapshot = buildSnapshot({ docs, artists: rows, commit: process.env.BUILD_SHA || "" });
  writeFileSync(out, JSON.stringify(snapshot));
  console.log(
    `Captured ${Object.keys(snapshot.documents).length} documents and ${Object.keys(snapshot.artists).length} artists.`,
  );
} else if (command === "save") {
  const input = arg("--in") || fail("save needs --in FILE");
  const site = arg("--site");
  if (site !== "preview" && site !== "production") fail("--site must be preview or production");
  const snapshot = parseSnapshot(readFileSync(input, "utf8")) || fail("Snapshot file is not valid.");
  await writeState(process.env, "web", SNAPSHOT_CONFIG_KEY, site, JSON.stringify(snapshot));
  console.log(`Saved the ${site} build snapshot (${snapshot.at}).`);
} else {
  fail(
    "Usage: site-build-snapshot.mjs capture --out FILE | save --in FILE --site preview|production",
  );
}
