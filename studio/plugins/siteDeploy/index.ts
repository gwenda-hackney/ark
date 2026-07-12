import { LaunchIcon } from "@sanity/icons/Launch";
import { definePlugin } from "sanity";
import { SiteDeployTool } from "./SiteDeployTool";

export const siteDeployPlugin = definePlugin({
  name: "site-deploy",
  tools: [
    {
      name: "deploy",
      title: "Deploy site",
      icon: LaunchIcon,
      component: SiteDeployTool,
    },
  ],
});
