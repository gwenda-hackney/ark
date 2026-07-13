import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { visionTool } from "@sanity/vision";
import { siteDeployPlugin } from "./plugins/siteDeploy";
import { eventInvitesPlugin } from "./plugins/eventInvites";
import { schemaTypes } from "./schemaTypes";

/** Inlined at build time — vars from repo-root `.env` via scripts/with-env.mjs */
const dataset = process.env.SANITY_STUDIO_DATASET || "development";
const projectId = process.env.SANITY_STUDIO_PROJECT_ID || "pn5yjro6";

export default defineConfig({
  name: dataset === "production" ? "gwenda" : "gwenda-dev",
  title: dataset === "production" ? "Gwenda" : "Gwenda (development)",
  projectId,
  dataset,
  plugins: [structureTool(), visionTool(), siteDeployPlugin(), eventInvitesPlugin()],
  schema: {
    types: schemaTypes,
  },
});
