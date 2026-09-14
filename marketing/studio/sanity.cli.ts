import { defineCliConfig } from "sanity/cli";

const dataset = process.env.SANITY_STUDIO_DATASET || "development";
const projectId = process.env.SANITY_STUDIO_PROJECT_ID || "pn5yjro6";
const studioHost = process.env.SANITY_STUDIO_HOSTNAME || "gwenda-dev";

export default defineCliConfig({
  api: {
    projectId,
    dataset,
  },
  studioHost,
});
