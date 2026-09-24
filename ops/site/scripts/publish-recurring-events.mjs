#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { occurrenceHash } from "../functions/_lib/event-content.js";
import {
  expandOccurrenceDates,
  todayIso,
} from "../functions/_lib/event-recurrence.js";
import {
  publishEventLive,
  publishEventPreview,
} from "../functions/_lib/event-publish.js";
import { listEvents } from "../functions/_lib/event-store.js";

export function parseArgs(argv) {
  const options = { dryRun: false };
  for (const arg of argv) {
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

export function planRecurringPublishes(events, { today = todayIso() } = {}) {
  return events.map((event) => {
    if (!event.repeatUnit || event.repeatUnit === "none") {
      return { event, action: "skip", reason: "not recurring", missing: [] };
    }

    const wanted = expandOccurrenceDates(event, { today });
    const productionRows = (event.dates || [])
      .filter((row) => row.snapshots?.production?.hash)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!productionRows.length) {
      return { event, action: "skip", reason: "not live", missing: [] };
    }

    const latestPublished = productionRows.at(-1);
    if (
      latestPublished.snapshots.production.hash !==
      occurrenceHash(event, latestPublished)
    ) {
      return {
        event,
        action: "skip",
        reason: "series has unpublished edits",
        missing: [],
      };
    }

    const publishedDates = new Set(productionRows.map((row) => row.date));
    const missing = wanted.filter((date) => !publishedDates.has(date));
    if (!missing.length) {
      return { event, action: "skip", reason: "horizon current", missing: [] };
    }

    if (missing.some((date) => date <= latestPublished.date)) {
      return {
        event,
        action: "skip",
        reason: "published schedule has a gap",
        missing,
      };
    }

    return { event, action: "publish", reason: "extend horizon", missing };
  });
}

export async function publishRecurringEvents(
  env,
  {
    dryRun = false,
    loadEvents = listEvents,
    publishPreview = publishEventPreview,
    publishLive = publishEventLive,
  } = {},
) {
  const plans = planRecurringPublishes(await loadEvents(env));
  const results = [];

  for (const plan of plans) {
    if (plan.action !== "publish" || dryRun) {
      results.push({ ...plan, published: false });
      continue;
    }

    const preview = await publishPreview(env, plan.event.id);
    const live = await publishLive(env, plan.event.id);
    results.push({
      ...plan,
      published: true,
      warnings: [...(preview.warnings || []), ...(live.warnings || [])],
    });
  }

  return results;
}

function printHelp() {
  console.log(`Publish missing dates at the end of live recurring event horizons.

Usage:
  npm run events:roll
  npm run events:roll -- --dry-run

Safety:
  Unpublished series and series with pending edits are skipped.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const results = await publishRecurringEvents(process.env, options);
  for (const result of results) {
    const dates = result.missing.length
      ? ` (${result.missing.join(", ")})`
      : "";
    console.log(
      `${result.published ? "published" : "skipped"} ${result.event.name}: ${result.reason}${dates}`,
    );
    for (const warning of result.warnings || [])
      console.warn(`warning: ${warning}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
