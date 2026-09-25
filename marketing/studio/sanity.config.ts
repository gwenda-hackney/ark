import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { visionTool } from "@sanity/vision";
import { schemaTypes } from "./schemaTypes";
import { structure } from "./structure";
import { isDevProject } from "./lib/env";

/** Inlined at build time — vars from repo-root `.env` via scripts/with-env.mjs */
const dataset = process.env.SANITY_STUDIO_DATASET || "production";
const projectId = process.env.SANITY_STUDIO_PROJECT_ID || "pn5yjro6";

/**
 * Studio only edits drafts. Publishing, and taking things off the website,
 * happen in ops, where the editor sees what goes live. Discard stays, to throw
 * a draft away.
 */
const OPS_ONLY_ACTIONS = new Set(["publish", "unpublish", "delete", "duplicate"]);

export default defineConfig({
  name: isDevProject(projectId) ? "gwenda-dev" : "gwenda",
  title: isDevProject(projectId) ? "Gwenda (dev)" : "Gwenda",
  projectId,
  dataset,
  plugins: [structureTool({ structure }), visionTool()],
  schema: {
    types: schemaTypes,
  },
  document: {
    actions: (previous) => previous.filter((item) => !OPS_ONLY_ACTIONS.has(item.action ?? "")),
  },
});
