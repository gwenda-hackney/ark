import { OPENING_HOURS_QUERY, readWeek } from "../opening-hours.js";
import { createSanityClient } from "./client";

export type OpeningDay = {
  day: string;
  closed: boolean;
  opens: string;
  closes: string;
};

let built: Promise<OpeningDay[] | null> | null = null;

async function load(): Promise<OpeningDay[] | null> {
  try {
    return readWeek(await createSanityClient().fetch(OPENING_HOURS_QUERY));
  } catch (error) {
    // No hours is better than a broken build: the pages then say none.
    console.warn(
      `Opening hours not loaded: ${error instanceof Error ? error.message : error}`,
    );
    return null;
  }
}

/**
 * The venue's week (ops: Settings → Venue details), Monday first, or null
 * when there is none or it doesn't add up: then nothing about hours shows.
 * A build asks once; `astro dev` asks on every page, so a change in ops
 * shows on the next reload.
 */
export function fetchOpeningHours(): Promise<OpeningDay[] | null> {
  if (import.meta.env.DEV) return load();
  built ??= load();
  return built;
}
