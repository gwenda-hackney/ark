import { siteConfig } from "../config/site";

/** Instagram link under "Check back soon for the next date" on a series with no dates yet. */
export function followUpdatesLink(url = siteConfig.social.instagram) {
  const href = String(url || "").trim();
  if (!href) return null;
  const handle = href.replace(/\/+$/, "").split("/").pop();
  return {
    href,
    label: handle
      ? `Follow @${handle} on Instagram for updates`
      : "Follow us on Instagram for updates",
  };
}
