import { defineCliConfig } from "sanity/cli";
import { getStudioDataset, getStudioProjectId } from "./lib/env";

export default defineCliConfig({
  api: {
    projectId: getStudioProjectId(),
    dataset: getStudioDataset(),
  },
  /** Hosted Studio URL: https://gwenda.sanity.studio */
  studioHost: "gwenda",
});
