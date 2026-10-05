#!/usr/bin/env node
/**
 * Refresh the Gwenda Dev Sanity project from the real one: each has one
 * dataset, production, drafts included. Afterwards dev has exactly the real
 * project's documents: dev-only ones are deleted. The real project is only
 * read. `--dry-run` lists what would be deleted.
 *
 * Uses your personal Sanity login (`npx sanity login`), not a robot token.
 * The same step runs in CI as part of copy-prod-to-dev (scripts/lib/dev-copy).
 *
 *   npm run dev:refresh:sanity
 */
import { DEV_SANITY_PROJECT_ID } from "../shared/sanity-projects.js";
import { copySanityContent } from "./lib/dev-copy/content.mjs";

copySanityContent({ dryRun: process.argv.includes("--dry-run") });
console.log(`\nDone. Gwenda Dev (${DEV_SANITY_PROJECT_ID}) now matches the real project.`);
