import { defineCliConfig } from "sanity/cli";
import { getStudioDataset, getStudioProjectId } from "./lib/env";

export default defineCliConfig({
  api: {
    projectId: getStudioProjectId(),
    dataset: getStudioDataset(),
  },
});
