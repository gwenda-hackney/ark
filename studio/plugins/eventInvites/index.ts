import { UsersIcon } from "@sanity/icons";
import { definePlugin } from "sanity";
import { EventInvitesTool } from "./EventInvitesTool";

export const eventInvitesPlugin = definePlugin({
  name: "event-invites",
  tools: [
    {
      name: "event-invites",
      title: "Event invites",
      icon: UsersIcon,
      component: EventInvitesTool,
    },
  ],
});
