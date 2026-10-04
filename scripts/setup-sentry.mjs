#!/usr/bin/env node
/**
 * Error reporting (#35): the Sentry projects, in the `gwenda` organisation
 * (EU region, free plan, user alerts@gwenda.co.uk).
 *
 * Creates any project below that's missing and prints each project's DSN for
 * shared/sentry.js (SENTRY_DSN). Safe to rerun. Alerts need nothing here:
 * Sentry gives every new project the alert "Send a notification for high
 * priority issues", emailed to the organisation's members (alerts@), and an
 * error-level report is high priority.
 *
 * Needs bw-unlock (SENTRY_AUTH_TOKEN__PRODUCTION, the organisation's internal
 * integration SENTRY_AUTH_TOKEN: Project write, Team and Organization read).
 *
 *   npm run setup:sentry -- --dry-run    only report
 *   npm run setup:sentry                 create what's missing
 */
import { productionSecretValues } from "./lib/bitwarden-sm.mjs";

const API = "https://de.sentry.io/api/0";
const ORG = "gwenda";
const DRY_RUN = process.argv.includes("--dry-run");
/** One project per app, keyed like SENTRY_DSN. */
const PROJECTS = [
  { key: "ops", slug: "ops", platform: "node-cloudflare-pages" },
  { key: "web", slug: "website", platform: "node-cloudflare-pages" },
  // One per Worker, so an error's id says which (MAILCHIMP-SYNC-1).
  {
    key: "deploy-webhook",
    slug: "deploy-webhook",
    platform: "node-cloudflare-workers",
  },
  {
    key: "mailchimp-sync",
    slug: "mailchimp-sync",
    platform: "node-cloudflare-workers",
    was: "workers",
  },
  {
    key: "site-health",
    slug: "site-health",
    platform: "node-cloudflare-workers",
  },
  {
    key: "wifi-portal",
    slug: "wifi-portal",
    platform: "node-cloudflare-workers",
  },
];
async function call(token, method, path, body) {
  const res = await fetch(`${API}/${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok)
    throw new Error(
      `Sentry ${method} ${path}: ${res.status} ${text.slice(0, 300)}`,
    );
  return text ? JSON.parse(text) : {};
}

async function main() {
  const token = productionSecretValues().get("SENTRY_AUTH_TOKEN")?.trim();
  if (!token)
    throw new Error(
      "SENTRY_AUTH_TOKEN__PRODUCTION is missing from Secrets Manager (ark). Run bw-unlock.",
    );

  const existing = await call(token, "GET", `organizations/${ORG}/projects/`);
  const teams = await call(token, "GET", `organizations/${ORG}/teams/`);
  const team = teams[0]?.slug;
  if (!team) throw new Error(`Sentry organisation ${ORG} has no team.`);

  const dsns = {};
  for (const project of PROJECTS) {
    let found = existing.find((p) => p.slug === project.slug);
    // A renamed project keeps its errors (the shared "workers" project held
    // the Mailchimp sync's).
    const old = project.was && existing.find((p) => p.slug === project.was);
    if (!found && old) {
      if (DRY_RUN) {
        console.log(
          `RENAME  ${project.was} → ${project.slug} (dry run, not changed)`,
        );
        continue;
      }
      found = await call(token, "PUT", `projects/${ORG}/${project.was}/`, {
        name: project.slug,
        slug: project.slug,
      });
      console.log(`renamed ${project.was} → ${project.slug}`);
    }
    if (!found) {
      if (DRY_RUN) {
        console.log(`MISSING project ${project.slug} (dry run, not created)`);
        continue;
      }
      found = await call(token, "POST", `teams/${ORG}/${team}/projects/`, {
        name: project.slug,
        slug: project.slug,
        platform: project.platform,
      });
      console.log(`created project ${project.slug}`);
    }
    const keys = await call(
      token,
      "GET",
      `projects/${ORG}/${project.slug}/keys/`,
    );
    dsns[project.key] = keys.find((key) => key.isActive)?.dsn?.public || "";

    // Errors don't need the sender's IP; for editors' browsers it is
    // personal data. Sentry's "Prevent storing IP addresses".
    const settings = await call(
      token,
      "GET",
      `projects/${ORG}/${project.slug}/`,
    );
    if (settings.scrubIPAddresses) {
      console.log(`ok      ${project.slug}`);
    } else if (DRY_RUN) {
      console.log(
        `IP      ${project.slug}: stores IP addresses (dry run, not changed)`,
      );
    } else {
      await call(token, "PUT", `projects/${ORG}/${project.slug}/`, {
        scrubIPAddresses: true,
      });
      console.log(`ok      ${project.slug}: no longer stores IP addresses`);
    }
  }
  console.log("\nSENTRY_DSN for shared/sentry.js:");
  console.log(JSON.stringify(dsns, null, 2));
}

try {
  await main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
