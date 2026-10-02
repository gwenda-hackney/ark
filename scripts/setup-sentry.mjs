#!/usr/bin/env node
/**
 * Error reporting (#35): the Sentry projects and their alert rule, in the
 * `gwenda` organisation (EU region, free plan, user alerts@gwenda.co.uk, so
 * Sentry's emails land in the alerts inbox).
 *
 * Creates any project below that's missing, prints each project's DSN for
 * shared/sentry.js (SENTRY_DSN), and makes sure each has the rule "email when
 * an issue is new or comes back". Safe to rerun.
 *
 * Needs bw-unlock (SENTRY_AUTH_TOKEN__PRODUCTION, a personal token of the
 * alerts@ Sentry user: project:write, alerts:write, org:read).
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
  { key: "ops", slug: "ops", platform: "javascript-cloudflare" },
  { key: "web", slug: "website", platform: "javascript-cloudflare" },
  { key: "workers", slug: "workers", platform: "javascript-cloudflare" },
];
const RULE_NAME = "Email when an issue is new or comes back";
const RULE = {
  name: RULE_NAME,
  actionMatch: "any",
  filterMatch: "all",
  // At most one email per issue every 30 minutes, however often it fires.
  frequency: 30,
  conditions: [
    { id: "sentry.rules.conditions.first_seen_event.FirstSeenEventCondition" },
    { id: "sentry.rules.conditions.regression_event.RegressionEventCondition" },
  ],
  filters: [],
  actions: [
    {
      id: "sentry.mail.actions.NotifyEmailAction",
      targetType: "IssueOwners",
      fallthroughType: "ActiveMembers",
    },
  ],
};

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
    // Sign-up makes a starter project (javascript-astro); it becomes the website's.
    const starter = existing.find((p) => p.slug === "javascript-astro");
    if (!found && project.key === "web" && starter) {
      if (DRY_RUN) {
        console.log(
          `RENAME  javascript-astro → ${project.slug} (dry run, not changed)`,
        );
        continue;
      }
      found = await call(token, "PUT", `projects/${ORG}/javascript-astro/`, {
        name: project.slug,
        slug: project.slug,
        platform: project.platform,
      });
      console.log(`renamed javascript-astro → ${project.slug}`);
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

    const rules = await call(
      token,
      "GET",
      `projects/${ORG}/${project.slug}/rules/`,
    );
    if (rules.some((rule) => rule.name === RULE_NAME)) {
      console.log(`ok      ${project.slug}: alert rule`);
    } else if (DRY_RUN) {
      console.log(`MISSING ${project.slug}: alert rule (dry run, not created)`);
    } else {
      await call(token, "POST", `projects/${ORG}/${project.slug}/rules/`, RULE);
      console.log(`created ${project.slug}: alert rule`);
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
