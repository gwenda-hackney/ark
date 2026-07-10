import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { visionTool } from "@sanity/vision";
import { getStudioDataset, getStudioProjectId } from "./lib/env";
import { schemaTypes } from "./schemaTypes";

const dataset = getStudioDataset();

export default defineConfig({
  name: dataset === "production" ? "gwenda" : "gwenda-dev",
  title: dataset === "production" ? "Gwenda" : "Gwenda (development)",
  projectId: getStudioProjectId(),
  dataset,
  plugins: [structureTool(), visionTool()],
  schema: {
    types: schemaTypes,
  },
});
