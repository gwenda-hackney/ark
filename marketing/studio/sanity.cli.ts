import { defineCliConfig } from "sanity/cli";
import { isDevProject } from "./lib/env";

const dataset = process.env.SANITY_STUDIO_DATASET || "production";
const projectId = process.env.SANITY_STUDIO_PROJECT_ID || "pn5yjro6";
const studioHost =
  process.env.SANITY_STUDIO_HOSTNAME || (isDevProject(projectId) ? "gwenda-dev" : "gwenda");

export default defineCliConfig({
  api: {
    projectId,
    dataset,
  },
  studioHost,
});
