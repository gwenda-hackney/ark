import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { visionTool } from "@sanity/vision";
import { siteDeployPlugin } from "./plugins/siteDeploy";
import { schemaTypes } from "./schemaTypes";
import { structure } from "./structure";

/** Inlined at build time — vars from repo-root `.env` via scripts/with-env.mjs */
const dataset = process.env.SANITY_STUDIO_DATASET || "staging";
const projectId = process.env.SANITY_STUDIO_PROJECT_ID || "pn5yjro6";

function studioMeta(value: string) {
  if (value === "production") return { name: "gwenda", title: "Gwenda" };
  return { name: "gwenda-dev", title: "Gwenda (dev)" };
}

const { name, title } = studioMeta(dataset);

/**
 * Ops writes these. Local ops saves them as drafts for the local site only, so
 * Studio must not publish (or delete) them: that would put dev data on staging.
 * Discard stays, to clear a stray local draft.
 */
const OPS_MANAGED_TYPES = new Set(["event", "eventSeries"]);
const BLOCKED_OPS_ACTIONS = new Set(["publish", "unpublish", "delete", "duplicate"]);

export default defineConfig({
  name,
  title,
  projectId,
  dataset,
  plugins: [
    structureTool({ structure }),
    visionTool(),
    siteDeployPlugin(),
  ],
  schema: {
    types: schemaTypes,
  },
  document: {
    actions: (previous, context) =>
      OPS_MANAGED_TYPES.has(context.schemaType)
        ? previous.filter((item) => !BLOCKED_OPS_ACTIONS.has(item.action ?? ""))
        : previous,
  },
});
