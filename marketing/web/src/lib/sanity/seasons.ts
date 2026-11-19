import { SEASONS_QUERY, readSeasons } from "../seasons.js";
import { createSanityClient } from "./client";

export type Season = ReturnType<typeof readSeasons>[number];

let built: Promise<Season[]> | null = null;

function load(): Promise<Season[]> {
  return createSanityClient()
    .fetch(SEASONS_QUERY)
    .then(readSeasons)
    .catch((error: unknown) => {
      // Nothing is better than a broken build: home then shows none.
      console.warn(
        `Seasons not loaded: ${error instanceof Error ? error.message : error}`,
      );
      return [];
    });
}

/**
 * Every season ops has (#353). A build asks once; `astro dev` asks on every
 * page, so a save in ops shows on the next reload.
 */
export function fetchSeasons(): Promise<Season[]> {
  if (import.meta.env.DEV) return load();
  built ??= load();
  return built;
}
