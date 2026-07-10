import { defineCliConfig } from "sanity/cli";

const dataset = process.env.SANITY_STUDIO_DATASET || "development";
const projectId = process.env.SANITY_STUDIO_PROJECT_ID || "pn5yjro6";

export default defineCliConfig({
  api: {
    projectId,
    dataset,
  },
  /** Hosted Studio URL: https://gwenda.sanity.studio */
  studioHost: "gwenda",
});
