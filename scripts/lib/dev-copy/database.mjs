/**
 * The backend database behind ops and the website, for the production → dev
 * copy. The copy names databases by role ("ops", "website"), never by
 * provider, so moving off Baserow means adding a provider here and switching
 * DATABASE_PROVIDER; nothing that starts a copy changes.
 *
 * A provider:
 *   id         short name ("baserow")
 *   label      what logs show ("Baserow")
 *   databases  the roles it can copy, in copy order
 *   copy(database, { dryRun })  replaces the dev copy of one database with
 *              production's. Only reads production. Throws on failure.
 */
import { baserow } from "./baserow.mjs";

export const DATABASE_PROVIDERS = { baserow };

/** The provider the copy uses today. */
export const DATABASE_PROVIDER = "baserow";

/** @param {string} [id] */
export function databaseProvider(id = DATABASE_PROVIDER) {
  const provider = DATABASE_PROVIDERS[id];
  if (!provider) {
    throw new Error(
      `Unknown database provider "${id}". Known: ${Object.keys(DATABASE_PROVIDERS).join(", ")}.`,
    );
  }
  return provider;
}
