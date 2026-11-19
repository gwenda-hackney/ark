/**
 * Where ops' emails are sent from, for this runtime: the website their
 * links and logo point at (website/server/site-urls.js publicSiteOrigin), and
 * the Sanity project their pictures are in. The weekly email and one-off
 * emails are built in this frame, on the server and in the page's preview.
 */
import { emailLogoUrl } from "../../../../../shared/email/shell.js";
import { emailSite } from "../../../../../shared/email/site.js";
import { DATASET, runsOnMachine, sanityProjectId } from "../../platform/sanity.js";
import { publicSiteOrigin, siteUrls } from "../../website/server/site-urls.js";

/**
 * @param {Record<string, any>} env
 * @returns {{ site: import("../../../../../shared/email/campaign.js").CampaignSite,
 *   images: { projectId: string, dataset: string }, logoUrl?: string }}
 */
export function emailFrame(env) {
  const origin = publicSiteOrigin(env);
  return {
    site: emailSite(origin),
    images: { projectId: sanityProjectId(env), dataset: DATASET },
    // On a developer's machine the preview shows the local website's logo
    // (web:dev on 4321), so a logo change is seen before it's deployed. Local
    // ops can't send, so this never reaches an inbox.
    ...(runsOnMachine(env) ? { logoUrl: emailLogoUrl(siteUrls(env).preview) } : {}),
  };
}
