#!/usr/bin/env node
/**
 * Recent errors from Sentry (#35), across ops, the website and the Workers:
 * one line per issue, newest first, with how often and where it happened.
 * --issue SHORT_ID prints that issue's latest event: message, tags and the
 * top of the stack trace.
 *
 * Needs bw-unlock (SENTRY_AUTH_TOKEN__PRODUCTION, with Issue & Event: Read).
 *
 *   npm run sentry:issues                     unresolved, last 24 hours
 *   npm run sentry:issues -- --period 7d --env production
 *   npm run sentry:issues -- --issue OPS-1
 */
import { productionSecretValues } from "./lib/bitwarden-sm.mjs";

const API = "https://de.sentry.io/api/0";
const ORG = "gwenda";
const arg = (name, fallback = "") => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] || fallback : fallback;
};

async function get(token, path) {
  const res = await fetch(`${API}/${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok)
    throw new Error(
      `Sentry GET ${path}: ${res.status} ${JSON.stringify(body).slice(0, 200)}`,
    );
  return body;
}

async function showIssue(token, shortId) {
  const issue = await get(token, `organizations/${ORG}/shortids/${shortId}/`);
  const event = await get(
    token,
    `organizations/${ORG}/issues/${issue.groupId}/events/latest/`,
  );
  console.log(`${shortId}: ${event.title}`);
  console.log(`  ${issue.group?.permalink || ""}`);
  for (const tag of event.tags || []) console.log(`  ${tag.key}: ${tag.value}`);
  const frames =
    event.entries
      ?.find((entry) => entry.type === "exception")
      ?.data?.values?.at(-1)
      ?.stacktrace?.frames?.slice(-8)
      .reverse() || [];
  for (const frame of frames) {
    console.log(
      `  at ${frame.function || "?"} (${frame.filename}:${frame.lineNo}:${frame.colNo})`,
    );
  }
  const extra =
    event.context && Object.keys(event.context).length ? event.context : null;
  if (extra) console.log(`  extra: ${JSON.stringify(extra).slice(0, 1000)}`);
}

async function main() {
  const token = productionSecretValues().get("SENTRY_AUTH_TOKEN")?.trim();
  if (!token)
    throw new Error(
      "SENTRY_AUTH_TOKEN__PRODUCTION is missing from Secrets Manager (ark). Run bw-unlock.",
    );
  if (arg("--issue")) return showIssue(token, arg("--issue"));

  const env = arg("--env");
  const params = new URLSearchParams({
    statsPeriod: arg("--period", "24h"),
    query: "is:unresolved",
    sort: "date",
  });
  if (env) params.set("environment", env);
  const issues = await get(token, `organizations/${ORG}/issues/?${params}`);
  if (!issues.length)
    return console.log("No unresolved errors in that period.");
  for (const issue of issues) {
    console.log(
      `${issue.shortId.padEnd(12)} ${String(issue.count).padStart(5)}× last ${issue.lastSeen.slice(0, 16)}  ${issue.project.slug}: ${issue.title}`,
    );
  }
}

try {
  await main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
