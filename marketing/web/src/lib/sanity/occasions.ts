import { OCCASIONS_QUERY, readOccasions } from "../occasions.js";
import { createSanityClient } from "./client";

export type Occasion = ReturnType<typeof readOccasions>[number];

let built: Promise<Occasion[]> | null = null;

function load(): Promise<Occasion[]> {
  return createSanityClient()
    .fetch(OCCASIONS_QUERY)
    .then(readOccasions)
    .catch((error: unknown) => {
      // Nothing is better than a broken build: home then shows none.
      console.warn(
        `Occasions not loaded: ${error instanceof Error ? error.message : error}`,
      );
      return [];
    });
}

/**
 * Every occasion ops has (#353). A build asks once; `astro dev` asks on every
 * page, so a save in ops shows on the next reload.
 */
export function fetchOccasions(): Promise<Occasion[]> {
  if (import.meta.env.DEV) return load();
  built ??= load();
  return built;
}
