import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { visionTool } from "@sanity/vision";
import { schemaTypes } from "./schemaTypes";

export default defineConfig({
  name: "gwenda",
  title: "Gwenda",
  projectId: "pn5yjro6",
  dataset: "production",
  plugins: [structureTool(), visionTool()],
  schema: {
    types: schemaTypes,
  },
});
