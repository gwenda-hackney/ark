import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { visionTool } from "@sanity/vision";
import { siteDeployPlugin } from "./plugins/siteDeploy";
import { eventInvitesPlugin } from "./plugins/eventInvites";
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

export default defineConfig({
  name,
  title,
  projectId,
  dataset,
  plugins: [
    structureTool({ structure }),
    visionTool(),
    siteDeployPlugin(),
    eventInvitesPlugin(),
  ],
  schema: {
    types: schemaTypes,
  },
});
