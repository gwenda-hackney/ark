/**
 * Who a campaign is from and where its fixed links go, from the website's own
 * config (marketing/web/src/config/site.ts), for one website: production, or
 * dev's when ops runs on dev, so a test's links go where it was sent from.
 */
import { siteConfig } from "../../marketing/web/src/config/site.ts";

/** @returns {import("./campaign.js").CampaignSite} */
export function emailSite(origin = siteConfig.domain) {
  const site = String(origin || siteConfig.domain).replace(/\/+$/, "");
  return {
    origin: site,
    name: siteConfig.name,
    social: siteConfig.copy.social,
    instagram: siteConfig.social.instagram,
    whatsOn: `${site}/whats-on`,
    mapsUrl: siteConfig.location.mapsUrl,
    address: siteConfig.location.address,
  };
}
